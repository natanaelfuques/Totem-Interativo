// api/admin.js — Moderação de fotos
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.query.pwd !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const { action, url } = req.query;

  if (req.method === 'GET') {
    const pending = (await redis.lrange('pending', 0, -1)) || [];
    const photos = (await redis.lrange('photos', 0, -1)) || [];
    const flagged = (await redis.lrange('flagged', 0, -1)) || [];
    const moderation = (await redis.get('moderation')) ?? '1';
    return res.status(200).json({ pending, photos, flagged, moderation: moderation === '1' });
  }

  if (req.method === 'POST') {
    if (action === 'approve' && url) {
      await redis.lrem('pending', 0, url);
      await redis.rpush('photos', url);
      await redis.ltrim('photos', -50, -1);
      return res.status(200).json({ success: true });
    }

    if (action === 'unflag' && url) {
      await redis.lrem('flagged', 0, url);
      return res.status(200).json({ success: true });
    }

    if (action === 'reject' && url) {
      await redis.lrem('pending', 0, url);
      return res.status(200).json({ success: true });
    }

    if (action === 'delete' && url) {
      await redis.lrem('photos', 0, url);
      return res.status(200).json({ success: true });
    }

    if (action === 'clear') {
      await redis.del('photos');
      await redis.del('pending');
      await redis.del('flagged');
      return res.status(200).json({ success: true });
    }

    if (action === 'reorder') {
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(JSON.parse(data)));
      });
      await redis.del('photos');
      if (body.photos && body.photos.length > 0) {
        await redis.rpush('photos', ...body.photos);
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'moderation') {
      const val = req.query.value === '1' ? '1' : '0';
      await redis.set('moderation', val);
      return res.status(200).json({ success: true, moderation: val === '1' });
    }
  }

  return res.status(400).json({ error: 'Ação inválida' });
}
