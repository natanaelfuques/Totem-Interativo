import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function getSettings(redis) {
  const raw = await redis.get('settings');
  const defaults = { moderation: '1', show_count: '-1' };
  if (!raw) return defaults;
  try { return { ...defaults, ...(typeof raw === 'string' ? JSON.parse(raw) : raw) }; }
  catch { return defaults; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const settings = await getSettings(redis);
    const photos = (await redis.lrange('photos', 0, -1)) || [];
    const limited = settings.show_count === '1' ? photos.slice(0, 1) : photos;
    return res.status(200).json({ photos: limited, paused: settings.show_count === '1' });
  } catch (err) {
    return res.status(500).json({ error: err.message, photos: [], paused: false });
  }
}
