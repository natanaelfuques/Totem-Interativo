import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  await redis.lrem('photos', 0, url);
  await redis.lrem('pending', 0, url);
  return res.status(200).json({ success: true });
}
