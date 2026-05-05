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
    if (action === 'get_rules') {
      const rulesRaw = await redis.get('upload_rules');
      const rules = rulesRaw ? JSON.parse(rulesRaw) : null;
      return res.status(200).json({ rules });
    }
    const pending = (await redis.lrange('pending', 0, -1)) || [];
    const photos = (await redis.lrange('photos', 0, -1)) || [];
    const flagged = (await redis.lrange('flagged', 0, -1)) || [];
    const moderation = (await redis.get('moderation')) ?? '1';
    const paused = (await redis.get('show_count')) === '1';
    const blockedRaw = (await redis.hgetall('blocked_ips')) || {};
    const blocked = Object.entries(blockedRaw).map(([ip, ts]) => ({ ip, ts: Number(ts) }));
    const whitelistRaw = (await redis.hgetall('whitelist_ips')) || {};
    const whitelist = Object.keys(whitelistRaw);
    return res.status(200).json({ pending, photos, flagged, moderation: moderation === '1', paused: paused, blocked, whitelist });
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
      await redis.del('blocked_ips');
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

    if (action === 'pause') {
      const val = req.query.value === '1' ? '1' : '-1';
      await redis.set('show_count', val);
      return res.status(200).json({ success: true, paused: val === '1' });
    }

    if (action === 'unblock' && url) {
      await redis.hdel('blocked_ips', url);
      await redis.del(`ip:${url}`);
      return res.status(200).json({ success: true });
    }

    if (action === 'whitelist' && url) {
      await redis.hset('whitelist_ips', { [url]: Date.now() });
      await redis.hdel('blocked_ips', url);
      await redis.del(`ip:${url}`);
      return res.status(200).json({ success: true });
    }

    if (action === 'unwhitelist' && url) {
      await redis.hdel('whitelist_ips', url);
      return res.status(200).json({ success: true });
    }

    if (action === 'save_rules') {
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(JSON.parse(data)));
      });
      await redis.set('upload_rules', JSON.stringify(body));
      return res.status(200).json({ success: true });
    }
  }

  return res.status(400).json({ error: 'Ação inválida' });
}
