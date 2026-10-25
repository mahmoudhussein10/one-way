import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const leadsPath=path.resolve(root,process.env.LEADS_FILE || './data/leads.json');
const supabaseUrl=(process.env.SUPABASE_URL || '').replace(/\/$/,'');
const supabaseKey=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!supabaseUrl || !supabaseKey) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env before migrating.');

let records=[];
try {
  const parsed=JSON.parse(await readFile(leadsPath,'utf8'));
  records=Array.isArray(parsed)?parsed:[];
} catch (error) {
  if (error.code!=='ENOENT') throw error;
}

for (const record of records) {
  if (!record.id || !record.createdAt || !record.idempotencyHash || !record.encrypted) {
    throw new Error('A local record is missing required fields; migration stopped without changing the source file.');
  }
}

if (records.length) {
  const response=await fetch(`${supabaseUrl}/rest/v1/leads?on_conflict=idempotency_hash`,{
    method:'POST',
    headers:{apikey:supabaseKey,...(supabaseKey.startsWith('sb_secret_')?{}:{authorization:`Bearer ${supabaseKey}`}),'content-type':'application/json',prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(records.map(record=>({id:record.id,created_at:record.createdAt,idempotency_hash:record.idempotencyHash,encrypted:record.encrypted})))
  });
  if (!response.ok) {
    const details=await response.text();
    throw new Error(`Supabase migration failed with HTTP ${response.status}: ${details}`);
  }
}
process.stdout.write(`Migrated ${records.length} encrypted lead record(s). The local source file was left unchanged.\n`);
