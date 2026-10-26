import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual, randomUUID } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const leadsPath = path.resolve(root, process.env.LEADS_FILE || './data/leads.json');
const token = process.env.ADMIN_TOKEN || '';
const key = Buffer.from(process.env.LEADS_ENCRYPTION_KEY || '', 'base64');
if (Buffer.byteLength(token) < 32) throw new Error('ADMIN_TOKEN must contain at least 32 bytes. Set it in .env.');
if (key.length !== 32) throw new Error('LEADS_ENCRYPTION_KEY must be a base64 encoded 32-byte key. Set it in .env.');

const rateLimits = new Map();
let writeQueue = Promise.resolve();
const rateWindowMs = 60_000;
const rateMax = 30;
const allowedWorkTypes = new Set(['shop','kiosk','company','restaurant','trade','workshop','service','employee','other']);
const allowedCreditHistory = new Set(['regular','sometimes_late','currently_late','unknown']);
const workTypeLabels = {shop:'محل تجاري',kiosk:'كشك',company:'شركة',restaurant:'مطعم أو كافيه',trade:'تجارة وتوزيع',workshop:'ورشة أو نشاط صناعي',service:'خدمات أو عمل حر',employee:'موظف',other:'نشاط أو عمل آخر'};
const creditLabels = {regular:'ملتزم بالسداد',sometimes_late:'حصل تأخير أحيانًا',currently_late:'عندي تأخير حالي',unknown:'مش عارف أو ما تعاملتش ائتمانيًا'};

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(body);
}
function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
function decrypt(record) {
  const decipher = createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));
  decipher.setAuthTag(Buffer.from(record.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]).toString('utf8'));
}
async function readStore() {
  try {
    const data = JSON.parse(await readFile(leadsPath,'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
async function saveStore(records) {
  await mkdir(path.dirname(leadsPath),{recursive:true});
  const tempPath = `${leadsPath}.${process.pid}.tmp`;
  await writeFile(tempPath,JSON.stringify(records),'utf8');
  await rename(tempPath,leadsPath);
}
function tokenMatches(supplied) {
  const a = Buffer.from(token);
  const b = Buffer.from(typeof supplied === 'string' ? supplied : '');
  return a.length === b.length && timingSafeEqual(a,b);
}
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
function authorized(req) {
  const supplied=(req.headers.authorization || '').replace(/^Bearer\s+/i,'') || cookieValue(req,'owf_admin_session');
  return tokenMatches(supplied);
}
function setAdminSession(req,res,clear=false) {
  const secure=req.headers['x-forwarded-proto']==='https';
  res.setHeader('set-cookie',`owf_admin_session=${clear?'':encodeURIComponent(token)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${clear?0:30*24*60*60}${secure?'; Secure':''}`);
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function rateLimited(req,scope='leads') {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const key=`${ip}:${scope}`;
  const recent = (rateLimits.get(key) || []).filter(time => now - time < rateWindowMs);
  const max=scope==='admin-login'?5:rateMax;
  if (recent.length >= max) { rateLimits.set(key,recent); return true; }
  recent.push(now); rateLimits.set(key,recent); return false;
}
async function readBody(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw Object.assign(new Error('Request too large'),{status:413});
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'),{status:400}); }
}
function normalizeSubmission(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {error:'بيانات الطلب غير مكتملة.'};
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const name=clean(data.name), phone=clean(data.phone).replace(/[\s()-]/g,''), workType=clean(data.workType);
  const workAddress=clean(data.workAddress), creditHistory=clean(data.creditHistory), workDetail=clean(data.workDetail);
  const normalizedPhone = phone.replace(/^\+?20/,'').replace(/^0/,'');
  if (name.length < 3 || name.length > 100) return {error:'اكتب الاسم بالكامل (من ٣ إلى ١٠٠ حرف).'};
  if (!/^1[0125]\d{8}$/.test(normalizedPhone)) return {error:'رقم الموبايل المصري غير صحيح.'};
  if (!allowedWorkTypes.has(workType)) return {error:'اختار طبيعة الشغل من القائمة.'};
  if ((workType === 'other' || workType === 'employee') && (workDetail.length < 2 || workDetail.length > 150)) return {error:workType === 'employee' ? 'اكتب أو اختار المسمى الوظيفي.' : 'اكتب طبيعة الشغل الآخر.'};
  if (workAddress.length < 4 || workAddress.length > 250) return {error:'اكتب عنوان الشغل بشكل مختصر.'};
  if (!allowedCreditHistory.has(creditHistory)) return {error:'اختار حالة سجل السداد.'};
  if (data.consent !== true) return {error:'الموافقة على استخدام البيانات مطلوبة.'};
  return {value:{name,phone,workType,workTypeLabel:workTypeLabels[workType],workDetail,workAddress,creditHistory,creditHistoryLabel:creditLabels[creditHistory],consent:true,consentAt:new Date().toISOString()}};
}
function createReference() {
  const date = new Date();
  return `OW-${String(date.getFullYear()).slice(-2)}${String(date.getMonth()+1).padStart(2,'0')}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
function requestError(error,res) {
  if (!res.headersSent) json(res,error.status || 500,{error:error.status ? error.message : 'حصل خطأ في الخادم. حاول مرة تانية.'});
  else res.destroy();
}

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') return json(res,400,{error:'HTTPS is required.'});
    if (url.pathname === '/api/admin/session' && ['POST','DELETE'].includes(req.method)) {
      if (!sameOrigin(req)) return json(res,403,{error:'مصدر الطلب غير مسموح.'});
      if (req.method === 'DELETE') {
        setAdminSession(req,res,true);
        return json(res,200,{ok:true});
      }
      if (rateLimited(req,'admin-login')) return json(res,429,{error:'محاولات كتير في وقت قصير. حاول بعد دقيقة.'});
      const data=await readBody(req);
      if (!tokenMatches(data?.token)) return json(res,401,{error:'رمز الإدارة غير صحيح.'});
      setAdminSession(req,res);
      return json(res,200,{ok:true,expiresInSeconds:30*24*60*60});
    }
    if (url.pathname === '/api/admin/session') { res.setHeader('allow','POST, DELETE'); return json(res,405,{error:'الطريقة غير مسموحة.'}); }
    if (url.pathname === '/api/meta-pixel-config' && req.method === 'GET') {
      const configuredId=String(process.env.NEXT_PUBLIC_META_PIXEL_ID || '');
      const pixelId=/^\d{5,20}$/.test(configuredId)?configuredId:'';
      return json(res,200,{pixelId});
    }
    if (url.pathname === '/api/meta-pixel-config') { res.setHeader('allow','GET'); return json(res,405,{error:'الطريقة غير مسموحة.'}); }
    if (url.pathname === '/api/leads' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res,403,{error:'مصدر الطلب غير مسموح.'});
      if (rateLimited(req)) return json(res,429,{error:'طلبات كتير في وقت قصير. حاول بعد دقيقة.'});
      const data = await readBody(req);
      if (data.website) return json(res,400,{error:'تعذر التحقق من الطلب.'});
      const result = normalizeSubmission(data);
      if (result.error) return json(res,400,{error:result.error});
      const suppliedIdempotency = req.headers['idempotency-key'];
      const idempotencyHash = typeof suppliedIdempotency === 'string' ? createHash('sha256').update(suppliedIdempotency).digest('hex') : randomUUID();
      let savedRecord, duplicate=false;
      writeQueue = writeQueue.then(async()=>{
        const records=await readStore();
        const existing=records.find(item=>item.idempotencyHash===idempotencyHash);
        if (existing) { savedRecord=existing; duplicate=true; return; }
        const id=createReference(), createdAt=new Date().toISOString();
        savedRecord={id,createdAt,idempotencyHash,encrypted:encrypt({...result.value,id,createdAt,screening:{status:'needs_manual_review',reasonCodes:['POLICY_NOT_CONFIGURED'],rulesVersion:'unconfigured'}})};
        records.unshift(savedRecord);
        await saveStore(records);
      });
      await writeQueue;
      return json(res,duplicate?200:201,{id:savedRecord.id,createdAt:savedRecord.createdAt,...(duplicate?{duplicate:true}:{})});
    }
    if (url.pathname === '/api/admin/leads' && req.method === 'GET') {
      if (!sameOrigin(req)) return json(res,403,{error:'مصدر الطلب غير مسموح.'});
      if (rateLimited(req,'admin')) return json(res,429,{error:'محاولات كتير في وقت قصير. حاول بعد دقيقة.'});
      if (!authorized(req)) return json(res,401,{error:'رمز لوحة الإدارة غير صحيح.'});
      const records=await readStore();
      const leads=records.map(item=>decrypt(item.encrypted)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      return json(res,200,{leads});
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res,404,{error:'المسار غير موجود.'});
    const requested = url.pathname === '/admin' ? 'dashboard.html' : decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    const allowed = new Set(['index.html','styles.css','app.js','tracking.js','dashboard.html','dashboard.css','dashboard.js','public-logo.png']);
    if (!allowed.has(requested)) return json(res,404,{error:'الملف غير موجود.'});
    const content=await readFile(path.join(root,requested));
    const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
    res.writeHead(200,{'content-type':types[path.extname(requested)] || 'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY'});
    if (req.method === 'HEAD') return res.end();
    res.end(content);
  } catch (error) { requestError(error,res); }
});

server.listen(port,host,()=>process.stdout.write(`One Way Finance app listening on http://${host}:${port}\n`));
