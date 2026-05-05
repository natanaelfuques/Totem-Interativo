import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  try {
    const showCount = await redis.get('show_count');
    const photos = (await redis.lrange('photos', 0, -1)) || [];
    const limited = showCount && Number(showCount) > 0 ? photos.slice(0, Number(showCount)) : photos;
    return res.status(200).json({ photos: limited, paused: showCount === '1' });
  } catch (err) {
    return res.status(500).json({ error: err.message, photos: [], paused: false });
  }
}
