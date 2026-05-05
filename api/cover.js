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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();
  if (req.query.pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const form = formidable({ maxFileSize: 20 * 1024 * 1024 }); // 20MB para capa
    const [, files] = await form.parse(req);
    const file = files.photo?.[0];
    if (!file) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    // Upload com qualidade máxima
    const result = await cloudinary.uploader.upload(file.filepath, {
      folder: 'totem-event',
      transformation: [
        { width: 1920, height: 1080, crop: 'limit' }, // Full HD
        { quality: 95, fetch_format: 'auto' },
      ],
    });

    fs.unlinkSync(file.filepath);

    // Insere no início da lista (primeira posição)
    const existing = (await redis.lrange('photos', 0, -1)) || [];
    await redis.del('photos');
    await redis.rpush('photos', result.secure_url, ...existing);

    return res.status(200).json({ success: true, url: result.secure_url });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
