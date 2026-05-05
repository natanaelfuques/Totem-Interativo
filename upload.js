// api/upload.js — Vercel Serverless Function
// Recebe foto, sobe pro Cloudinary, salva URL no KV Store (Vercel KV)

import { v2 as cloudinary } from 'cloudinary';
import { kv } from '@vercel/kv';
import formidable from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form
    const form = formidable({ maxFileSize: 10 * 1024 * 1024 }); // 10MB
    const [, files] = await form.parse(req);
    const file = files.photo?.[0];

    if (!file) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    // Sobe pro Cloudinary
    const result = await cloudinary.uploader.upload(file.filepath, {
      folder: 'totem-event',
      transformation: [
        { width: 1920, height: 1080, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    // Limpa arquivo temporário
    fs.unlinkSync(file.filepath);

    // Salva URL no Vercel KV
    const existing = (await kv.get('photos')) || [];
    const updated = [...existing, result.secure_url];

    // Mantém no máximo 50 fotos
    if (updated.length > 50) updated.splice(0, updated.length - 50);

    await kv.set('photos', updated);

    return res.status(200).json({ success: true, url: result.secure_url });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
