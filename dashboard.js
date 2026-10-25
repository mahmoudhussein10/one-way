let leads = [];
const loginCard = document.querySelector('#loginCard');
const dashboard = document.querySelector('#dashboard');
const list = document.querySelector('#leadList');
const loginError = document.querySelector('#loginError');
const dashboardError = document.querySelector('#dashboardError');
const search = document.querySelector('#searchLeads');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = value => new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

async function loadLeads() {
  dashboardError.textContent='';
  const response=await fetch('/api/admin/leads',{credentials:'same-origin',cache:'no-store'});
  const result=await response.json();
  if(response.status===401) throw new Error('انتهت جلسة الدخول. اكتب الرمز مرة تانية.');
  if(!response.ok) throw new Error(result.error||'تعذر تحميل الطلبات.');
  leads=result.leads;
  renderLeads();
}

function copyText(lead) {
  return [
    `طلب جديد رقم ${lead.id}`,
    `الاسم: ${lead.name}`,
    `رقم الموبايل / واتساب: ${lead.phone}`,
    `طبيعة الشغل: ${lead.workTypeLabel}${lead.workDetail?` — ${lead.workDetail}`:''}`,
    `عنوان الشغل: ${lead.workAddress}`,
    `سجل السداد (حسب إفادة العميل): ${lead.creditHistoryLabel}`,
    `تاريخ الطلب: ${dateText(lead.createdAt)}`
  ].join('\n');
}

function renderLeads() {
  const query=search.value.trim().toLocaleLowerCase('ar');
  const filtered=leads.filter(lead=>`${lead.name} ${lead.phone} ${lead.id}`.toLocaleLowerCase('ar').includes(query));
  document.querySelector('#leadCount').textContent=String(leads.length);
  if(!filtered.length) {
    list.innerHTML='';
    const empty=document.querySelector('#emptyTemplate').content.cloneNode(true);
    if(leads.length) empty.querySelector('strong').textContent='مفيش نتائج مطابقة';
    if(leads.length) empty.querySelector('span').textContent='جرّب تبحث باسم أو رقم مختلف.';
    list.append(empty); return;
  }
  list.innerHTML=filtered.map(lead=>`<article class="lead-card">
    <div class="lead-head"><div><h2>${escapeHtml(lead.name)}</h2><div class="lead-time">${escapeHtml(dateText(lead.createdAt))}</div></div><div class="reference">${escapeHtml(lead.id)}</div></div>
    <div class="lead-fields">
      <div class="lead-field"><span>الموبايل / واتساب</span><strong dir="ltr">${escapeHtml(lead.phone)}</strong></div>
      <div class="lead-field"><span>طبيعة الشغل</span><strong>${escapeHtml(lead.workTypeLabel)}${lead.workDetail?` — ${escapeHtml(lead.workDetail)}`:''}</strong></div>
      <div class="lead-field"><span>عنوان الشغل</span><strong>${escapeHtml(lead.workAddress)}</strong></div>
      <div class="lead-field"><span>سجل السداد (حسب إفادة العميل)</span><strong>${escapeHtml(lead.creditHistoryLabel)}</strong></div>
    </div>
    <p class="screening-note">إجابة الآي سكور من العميل فقط؛ لا يوجد استعلام ائتماني أو قرار أهلية آلي.</p>
    <button class="copy-button" type="button" data-copy="${escapeHtml(lead.id)}">نسخ بيانات الطلب</button>
  </article>`).join('');
  list.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
    const lead=leads.find(item=>item.id===button.dataset.copy);
    try {
      await navigator.clipboard.writeText(copyText(lead));
      button.textContent='تم النسخ — جاهز للإرسال';
      setTimeout(()=>{button.textContent='نسخ بيانات الطلب';},2200);
    } catch {
      dashboardError.textContent='تعذر النسخ تلقائيًا. افتح الطلب وانسخ البيانات يدويًا.';
    }
  }));
}

document.querySelector('#loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.currentTarget.querySelector('button[type="submit"]');
  const token=document.querySelector('#adminToken').value;
  loginError.textContent=''; button.disabled=true; button.textContent='جارٍ التحقق...';
  try {
    const session=await fetch('/api/admin/session',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({token})});
    const sessionResult=await session.json();
    if(!session.ok) throw new Error(sessionResult.error||'تعذر تسجيل الدخول.');
    await loadLeads();
    loginCard.hidden=true; dashboard.hidden=false;
    document.querySelector('#adminToken').value='';
  } catch(error) { loginError.textContent=error.message; }
  finally { button.disabled=false; button.textContent='عرض الطلبات'; }
});
document.querySelector('#logoutBtn').addEventListener('click',async()=>{
  try { await fetch('/api/admin/session',{method:'DELETE',credentials:'same-origin'}); }
  finally { leads=[]; search.value=''; list.innerHTML=''; dashboard.hidden=true; loginCard.hidden=false; }
});
search.addEventListener('input',renderLeads);

loadLeads().then(()=>{
  loginCard.hidden=true; dashboard.hidden=false;
}).catch(()=>{});
