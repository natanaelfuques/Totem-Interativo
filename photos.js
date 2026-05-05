// api/photos.js — Retorna lista de fotos do evento
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const photos = (await redis.lrange('photos', 0, -1)) || [];
    return res.status(200).json({ photos });
  } catch (err) {
    return res.status(500).json({ error: err.message, photos: [] });
  }
}
