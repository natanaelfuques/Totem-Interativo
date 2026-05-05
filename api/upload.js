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

    // Verifica whitelist — IPs livres não têm limite
    const whitelisted = await redis.hexists('whitelist_ips', ip);
    if (!whitelisted) {
      const ipCount = Number((await redis.get(ipKey)) || 0);

      if (ipCount >= 14) {
        await redis.hset('blocked_ips', { [ip]: Date.now() });
        return res.status(429).json({ error: 'Limite atingido', limitReached: true });
      }

      // Incrementa e define TTL
      const newCount = ipCount + 1;
      await redis.incr(ipKey);
      if (newCount <= 5) {
        await redis.expire(ipKey, 10 * 60);
      } else if (newCount <= 10) {
        await redis.expire(ipKey, 60 * 60);
      } else {
        await redis.expire(ipKey, 12 * 60 * 60);
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

    const moderation = (await redis.get('moderation')) ?? '1';

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
