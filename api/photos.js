import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const paused = (await redis.get('paused')) ?? '0';
    const photos = (await redis.lrange('photos', 0, -1)) || [];
    return res.status(200).json({ photos, paused: paused === '1' });
  } catch (err) {
    return res.status(500).json({ error: err.message, photos: [], paused: false });
  }
}
