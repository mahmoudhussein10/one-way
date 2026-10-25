import { createReference, encrypt, json, newIdempotencyHash, normalizeSubmission, rateLimited, readJson, requestError, sameOrigin, supabase } from '../lib/server-api.js';

export default async function handler(req,res) {
  if (req.method !== 'POST') { res.setHeader('allow','POST'); return json(res,405,{error:'الطريقة غير مسموحة.'}); }
  try {
    if (!sameOrigin(req)) return json(res,403,{error:'مصدر الطلب غير مسموح.'});
    if (await rateLimited(req,'leads')) return json(res,429,{error:'طلبات كتير في وقت قصير. حاول بعد دقيقة.'});
    const data=await readJson(req);
    if (data.website) return json(res,400,{error:'تعذر التحقق من الطلب.'});
    const normalized=normalizeSubmission(data);
    if (normalized.error) return json(res,400,{error:normalized.error});

    const supplied=req.headers['idempotency-key'];
    const idempotencyHash=newIdempotencyHash(typeof supplied==='string'&&supplied.length<=200?supplied:'');
    const id=createReference(), createdAt=new Date().toISOString();
    const encrypted=encrypt({...normalized.value,id,createdAt,screening:{status:'needs_manual_review',reasonCodes:['POLICY_NOT_CONFIGURED'],rulesVersion:'unconfigured'}});
    try {
      await supabase('leads',{method:'POST',headers:{prefer:'return=minimal'},body:JSON.stringify({id,created_at:createdAt,idempotency_hash:idempotencyHash,encrypted})});
      return json(res,201,{id,createdAt});
    } catch (error) {
      if (error.status!==409) throw error;
      const existing=await supabase(`leads?select=id,created_at&idempotency_hash=eq.${idempotencyHash}`,{method:'GET'});
      if (!existing?.length) throw error;
      return json(res,200,{id:existing[0].id,createdAt:existing[0].created_at,duplicate:true});
    }
  } catch (error) { return requestError(error,res); }
}
