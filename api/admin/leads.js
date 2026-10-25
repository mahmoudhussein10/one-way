import { authorized, decrypt, json, rateLimited, requestError, sameOrigin, supabase } from '../../lib/server-api.js';

export default async function handler(req,res) {
  if (req.method !== 'GET') { res.setHeader('allow','GET'); return json(res,405,{error:'الطريقة غير مسموحة.'}); }
  try {
    if (!sameOrigin(req)) return json(res,403,{error:'مصدر الطلب غير مسموح.'});
    if (await rateLimited(req,'admin')) return json(res,429,{error:'محاولات كتير في وقت قصير. حاول بعد دقيقة.'});
    if (!authorized(req)) return json(res,401,{error:'رمز لوحة الإدارة غير صحيح.'});
    const records=await supabase('leads?select=id,created_at,encrypted&order=created_at.desc',{method:'GET'});
    const leads=records.map(record=>decrypt(record.encrypted)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return json(res,200,{leads});
  } catch (error) { return requestError(error,res); }
}
