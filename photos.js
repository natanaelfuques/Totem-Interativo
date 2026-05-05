// api/photos.js — Retorna lista de fotos do evento
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const photos = (await kv.get('photos')) || [];
    return res.status(200).json({ photos });
  } catch (err) {
    return res.status(500).json({ error: err.message, photos: [] });
  }
}
