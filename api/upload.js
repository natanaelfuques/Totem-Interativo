import { v2 as cloudinary } from 'cloudinary';
import { Redis } from '@upstash/redis';
import formidable from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const ipKey = `ip:${ip}`;

    // Carrega regras configuráveis (ou usa padrão)
    const rulesRaw = await redis.get('upload_rules');
    const rules = rulesRaw ? JSON.parse(rulesRaw) : { t1_limit: 5, t1_ttl: 10, t2_limit: 10, t2_ttl: 60, t3_limit: 15, t3_ttl: 720 };

    // Verifica whitelist — IPs livres não têm limite
    const whitelisted = await redis.hexists('whitelist_ips', ip);
    if (!whitelisted) {
      const ipCount = Number((await redis.get(ipKey)) || 0);

      if (ipCount >= rules.t3_limit - 1) {
        await redis.hset('blocked_ips', { [ip]: Date.now() });
        return res.status(429).json({ error: 'Limite atingido', limitReached: true });
      }

      const newCount = ipCount + 1;
      await redis.incr(ipKey);
      if (newCount <= rules.t1_limit) {
        await redis.expire(ipKey, rules.t1_ttl * 60);
      } else if (newCount <= rules.t2_limit) {
        await redis.expire(ipKey, rules.t2_ttl * 60);
      } else {
        await redis.expire(ipKey, rules.t3_ttl * 60);
      }
    }

    const form = formidable({ maxFileSize: 10 * 1024 * 1024 });
    const [, files] = await form.parse(req);
    const file = files.photo?.[0];

    if (!file) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    const result = await cloudinary.uploader.upload(file.filepath, {
      folder: 'totem-event',
      transformation: [
        { width: 1920, height: 1080, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    fs.unlinkSync(file.filepath);

    const settingsRaw = await redis.get('settings');
    const settings = settingsRaw ? (typeof settingsRaw === 'string' ? JSON.parse(settingsRaw) : settingsRaw) : { moderation: '1' };
    const moderation = settings.moderation ?? '1';

    if (moderation === '1') {
      await redis.rpush('pending', result.secure_url);
      await redis.ltrim('pending', -100, -1);
    } else {
      await redis.rpush('photos', result.secure_url);
      await redis.ltrim('photos', -50, -1);
    }

    return res.status(200).json({ success: true, url: result.secure_url, moderation: moderation === '1' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
