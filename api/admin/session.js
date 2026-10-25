import { clearAdminSessionCookie, json, matchesAdminToken, rateLimited, readJson, requestError, sameOrigin, setAdminSessionCookie } from '../../lib/server-api.js';

export default async function handler(req,res) {
  if (!['POST','DELETE'].includes(req.method)) { res.setHeader('allow','POST, DELETE'); return json(res,405,{error:'الطريقة غير مسموحة.'}); }
  try {
    if (!sameOrigin(req)) return json(res,403,{error:'مصدر الطلب غير مسموح.'});
    if (req.method==='DELETE') {
      clearAdminSessionCookie(req,res);
      return json(res,200,{ok:true});
    }
    if (await rateLimited(req,'admin-login')) return json(res,429,{error:'محاولات كتير في وقت قصير. حاول بعد دقيقة.'});
    const data=await readJson(req);
    if (!matchesAdminToken(data?.token)) return json(res,401,{error:'رمز الإدارة غير صحيح.'});
    setAdminSessionCookie(req,res);
    return json(res,200,{ok:true,expiresInSeconds:30*24*60*60});
  } catch (error) { return requestError(error,res); }
}
