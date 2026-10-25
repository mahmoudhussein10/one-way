import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const workTypeLabels = {shop:'محل تجاري',kiosk:'كشك',company:'شركة',restaurant:'مطعم أو كافيه',trade:'تجارة وتوزيع',workshop:'ورشة أو نشاط صناعي',service:'خدمات أو عمل حر',employee:'موظف',other:'نشاط أو عمل آخر'};
const creditLabels = {regular:'ملتزم بالسداد',sometimes_late:'حصل تأخير أحيانًا',currently_late:'عندي تأخير حالي',unknown:'مش عارف أو ما تعاملتش ائتمانيًا'};
const allowedWorkTypes = new Set(Object.keys(workTypeLabels));
const allowedCreditHistory = new Set(Object.keys(creditLabels));

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.end(JSON.stringify(data));
}

export async function readJson(req) {
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > 8192) throw Object.assign(new Error('Request too large'),{status:413});
    try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { throw Object.assign(new Error('Invalid JSON'),{status:400}); }
  }
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw Object.assign(new Error('Request too large'),{status:413});
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'),{status:400}); }
}

export function normalizeSubmission(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {error:'بيانات الطلب غير مكتملة.'};
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const name=clean(data.name), phone=clean(data.phone).replace(/[\s()-]/g,''), workType=clean(data.workType);
  const workAddress=clean(data.workAddress), creditHistory=clean(data.creditHistory), workDetail=clean(data.workDetail);
  const normalizedPhone = phone.replace(/^\+?20/,'').replace(/^0/,'');
  if (name.length < 3 || name.length > 100) return {error:'اكتب الاسم بالكامل (من ٣ إلى ١٠٠ حرف).'};
  if (!/^1[0125]\d{8}$/.test(normalizedPhone)) return {error:'رقم الموبايل المصري غير صحيح.'};
  if (!allowedWorkTypes.has(workType)) return {error:'اختار طبيعة الشغل من القائمة.'};
  if (workType === 'other' && (workDetail.length < 2 || workDetail.length > 150)) return {error:'اكتب طبيعة الشغل الآخر.'};
  if (workAddress.length < 4 || workAddress.length > 250) return {error:'اكتب عنوان الشغل بشكل مختصر.'};
  if (!allowedCreditHistory.has(creditHistory)) return {error:'اختار حالة سجل السداد.'};
  if (data.consent !== true) return {error:'الموافقة على استخدام البيانات مطلوبة.'};
  return {value:{name,phone,workType,workTypeLabel:workTypeLabels[workType],workDetail,workAddress,creditHistory,creditHistoryLabel:creditLabels[creditHistory],consent:true,consentAt:new Date().toISOString()}};
}

export function sameOrigin(req) {
  const origin=req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const ADMIN_SESSION_COOKIE='owf_admin_session';
const ADMIN_SESSION_MAX_AGE=30*24*60*60;

function cookieValue(req,name) {
  const prefix=`${name}=`;
  for (const part of (req.headers.cookie || '').split(';')) {
    const item=part.trim();
    if (item.startsWith(prefix)) {
      try { return decodeURIComponent(item.slice(prefix.length)); } catch { return ''; }
    }
  }
  return '';
}

export function matchesAdminToken(supplied) {
  const token=process.env.ADMIN_TOKEN || '';
  const a=Buffer.from(token), b=Buffer.from(typeof supplied==='string'?supplied:'');
  return a.length >= 32 && a.length === b.length && timingSafeEqual(a,b);
}

export function setAdminSessionCookie(req,res) {
  const forwardedProto=(req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
  const secure=process.env.VERCEL==='1' || forwardedProto==='https';
  res.setHeader('set-cookie',`${ADMIN_SESSION_COOKIE}=${encodeURIComponent(process.env.ADMIN_TOKEN)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_MAX_AGE}${secure?'; Secure':''}`);
}

export function clearAdminSessionCookie(req,res) {
  const forwardedProto=(req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
  const secure=process.env.VERCEL==='1' || forwardedProto==='https';
  res.setHeader('set-cookie',`${ADMIN_SESSION_COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`);
}

export function authorized(req) {
  const supplied=(req.headers.authorization || '').replace(/^Bearer\s+/i,'') || cookieValue(req,ADMIN_SESSION_COOKIE);
  return matchesAdminToken(supplied);
}

function encryptionKey() {
  const key=Buffer.from(process.env.LEADS_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('LEADS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

export function encrypt(value) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}

export function decrypt(record) {
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(record.iv,'base64'));
  decipher.setAuthTag(Buffer.from(record.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]).toString('utf8'));
}

function supabaseConfig() {
  const url=(process.env.SUPABASE_URL || '').replace(/\/$/,'');
  const key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Supabase server environment variables are missing.');
  return {url,key};
}

export async function supabase(path, options={}) {
  const {url,key}=supabaseConfig();
  const headers={apikey:key,'content-type':'application/json',...(options.headers||{})};
  if (!key.startsWith('sb_secret_')) headers.authorization=`Bearer ${key}`;
  const response=await fetch(`${url}/rest/v1/${path}`,{...options,headers});
  const body=await response.text();
  let data=null;
  if (body) { try { data=JSON.parse(body); } catch { data={message:'Unexpected response from database.'}; } }
  if (!response.ok) {
    const error=new Error(data?.message || 'Database request failed.');
    error.status=response.status;
    error.details=data;
    throw error;
  }
  return data;
}

export async function rateLimited(req, scope) {
  const ip=(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const secret=process.env.ADMIN_TOKEN || process.env.LEADS_ENCRYPTION_KEY || 'missing-secret';
  const key=createHmac('sha256',secret).update(`${scope}:${ip}`).digest('hex');
  const result=await supabase('rpc/consume_request_limit',{method:'POST',body:JSON.stringify({p_key:key,p_window_seconds:60,p_max_requests:scope==='admin-login'?5:30})});
  return result !== true;
}

export function createReference() {
  const date=new Date();
  return `OW-${String(date.getFullYear()).slice(-2)}${String(date.getMonth()+1).padStart(2,'0')}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function requestError(error,res) {
  const status=[400,413].includes(error.status)?error.status:500;
  if (status === 500) console.error('API request failed:',error.message);
  return json(res,status,{error:status===500?'حصل خطأ في الخادم. حاول مرة تانية.':error.message});
}

export function newIdempotencyHash(value) {
  return createHash('sha256').update(value || randomUUID()).digest('hex');
}
