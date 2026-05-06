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
    const slideDuration = (settings.rules && settings.rules.slide_duration) ? settings.rules.slide_duration * 1000 : 5000;
    const eventName = (settings.rules && settings.rules.event_name) ? settings.rules.event_name : 'Totem Interativo';
    return res.status(200).json({ photos: limited, paused: settings.show_count === '1', slideDuration, eventName });
  } catch (err) {
    return res.status(500).json({ error: err.message, photos: [], paused: false });
  }
}
