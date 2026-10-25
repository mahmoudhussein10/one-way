import { json } from '../lib/server-api.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'الطريقة غير مسموحة.' });
  }

  const configuredId = String(process.env.NEXT_PUBLIC_META_PIXEL_ID || '');
  const pixelId = /^\d{5,20}$/.test(configuredId) ? configuredId : '';
  return json(res, 200, { pixelId });
}
