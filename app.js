const answers = { name: '', phone: '', workType: '', workDetail: '', employmentSector: '', workplaceType: '', workplaceTypeOther: '', jobTitle: '', jobTitleOther: '', workAddress: '', creditHistory: '', consent: false };
const form = document.querySelector('#stepContent');
const formError = document.querySelector('#formError');
const workTypes = [
  ['shop', 'محل تجاري'],
  ['kiosk', 'كشك'],
  ['company', 'شركة'],
  ['restaurant', 'مطعم أو كافيه'],
  ['trade', 'تجارة وتوزيع'],
  ['workshop', 'ورشة أو نشاط صناعي'],
  ['service', 'خدمات أو عمل حر'],
  ['employee', 'موظف'],
  ['other', 'نشاط أو عمل آخر']
];
const creditOptions = [
  ['regular', 'ملتزم بالسداد'],
  ['sometimes_late', 'حصل تأخير أحيانًا'],
  ['currently_late', 'عندي تأخير حالي'],
  ['unknown', 'مش عارف أو ما تعاملتش ائتمانيًا']
];
const employmentSectors = [
  ['government', 'حكومي'],
  ['private', 'شركة / قطاع خاص'],
  ['public', 'قطاع عام']
];
const workplacesBySector = {
  government: [
    ['school', 'مدرسة أو جامعة حكومية'],
    ['government_authority', 'وزارة أو هيئة حكومية'],
    ['government_hospital', 'مستشفى أو وحدة صحية حكومية'],
    ['local_government', 'محافظة أو حي أو وحدة محلية'],
    ['other', 'جهة حكومية أخرى']
  ],
  private: [
    ['company', 'شركة أو مكتب خاص'],
    ['private_school', 'مدرسة أو جامعة خاصة'],
    ['private_hospital', 'مستشفى أو عيادة خاصة'],
    ['factory', 'مصنع أو شركة إنتاج'],
    ['private_shop', 'محل أو نشاط تجاري خاص'],
    ['other', 'جهة خاصة أخرى']
  ],
  public: [
    ['public_company', 'شركة قطاع عام'],
    ['public_authority', 'هيئة أو مؤسسة عامة'],
    ['public_hospital', 'مستشفى قطاع عام'],
    ['other', 'جهة قطاع عام أخرى']
  ]
};
const employeeRoles = [
  ['manager', 'مدير / مشرف'],
  ['teacher', 'مدرس / معلم'],
  ['accountant', 'محاسب / مراجع'],
  ['lawyer', 'محامي'],
  ['engineer', 'مهندس'],
  ['medical', 'طبيب / صيدلي'],
  ['sales', 'مبيعات / مندوب'],
  ['hr', 'موارد بشرية'],
  ['admin', 'إداري / سكرتارية'],
  ['technical', 'فني / تشغيل'],
  ['support', 'خدمة عملاء'],
  ['driver', 'سائق'],
  ['other', 'وظيفة أخرى']
];
let idempotencyKey = crypto.randomUUID();
let submissionInProgress = false;
let analyticsConsent = window.metaTracking?.hasConsent() ?? false;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function textField(name, label, placeholder, type = 'text', autocomplete = '') {
  return `<div class="field ${['workAddress','workDetail'].includes(name) ? 'full' : ''}"><label for="${name}">${label} <small class="required-tag">(مطلوب)</small></label><input id="${name}" name="${name}" type="${type}" placeholder="${placeholder}" value="${escapeHtml(answers[name])}" ${autocomplete ? `autocomplete="${autocomplete}"` : ''} ${name === 'phone' ? 'inputmode="tel" maxlength="15"' : ''} required /></div>`;
}

function optionGroup(name, label, options, hint = '') {
  const selectedValue = answers[name];
  const buttons = options.map(([value, text]) => `
    <button type="button" class="choice ${selectedValue === value ? 'selected' : ''}"
      data-choice="${name}" data-value="${value}" aria-pressed="${selectedValue === value}">
      ${text}
    </button>`).join('');
  return `<fieldset class="choice-field"><legend>${label} <small class="required-tag">(مطلوب)</small></legend>${hint ? `<p class="choice-hint">${hint}</p>` : ''}<div class="choice-grid" role="group" aria-label="${label}">${buttons}</div></fieldset>`;
}

function renderForm() {
  form.innerHTML = `
    <div class="field-grid one-page-fields">
      <div class="honeypot" aria-hidden="true"><label for="website">اترك الحقل ده فاضي</label><input id="website" name="website" tabindex="-1" autocomplete="off" /></div>
      ${textField('name', 'الاسم بالكامل', 'اكتب اسمك', 'text', 'name')}
      ${textField('phone', 'رقم الموبايل / واتساب', 'اكتب رقم تقدر نكلمك عليه', 'tel', 'tel')}
      <p class="field-hint full">لو رقم الموبايل هو نفسه رقم واتساب، اكتبه مرة واحدة.</p>
      ${optionGroup('workType', 'بتشتغل إيه؟', workTypes)}
      ${answers.workType === 'employee' ? optionGroup('employmentSector', 'جهة عملك تبع أي قطاع؟', employmentSectors) : ''}
      ${answers.workType === 'employee' && answers.employmentSector ? optionGroup('workplaceType', 'بتشتغل فين؟', workplacesBySector[answers.employmentSector], 'اختار نوع جهة العمل. مش محتاج تكتب اسم الشركة أو المؤسسة.') : ''}
      ${answers.workType === 'employee' && answers.workplaceType === 'other' ? textField('workplaceTypeOther', 'اكتب نوع جهة العمل', 'مثال: مركز شباب حكومي أو شركة مقاولات') : ''}
      ${answers.workType === 'employee' && answers.workplaceType ? optionGroup('jobTitle', 'وظيفتك إيه داخل الجهة؟', employeeRoles, 'مثال: في المدرسة اختار مدرس، وفي الشركة اختار محاسب أو مدير أو اكتب تخصصك.') : ''}
      ${answers.workType === 'employee' && answers.jobTitle === 'other' ? textField('jobTitleOther', 'اكتب المسمى الوظيفي والتخصص', 'مثال: مدير فرع، مدرس رياضيات، محاسب ضرائب') : ''}
      ${answers.workType === 'other' ? textField('workDetail', 'اكتب طبيعة شغلك', 'مثال: صيانة أجهزة أو توريدات') : ''}
      ${textField('workAddress', 'عنوان الشغل أو النشاط', 'المحافظة والمدينة أو الحي', 'text')}
      ${optionGroup('creditHistory', 'سجل السداد (الآي سكور) حسب معرفتك', creditOptions, 'اختار أقرب إجابة. ده سؤال مبدئي ومش بنعمل استعلام آي سكور هنا.')}
      <label class="consent full"><input type="checkbox" name="consent" ${answers.consent ? 'checked' : ''}><span>أوافق على استخدام بياناتي لمراجعة الطلب والتواصل معي بخصوصه. <a href="#" class="policy-link" aria-disabled="true">سياسة الخصوصية (الرابط غير متاح حاليًا)</a></span></label>
      <label class="consent analytics-consent full"><input type="checkbox" name="analyticsConsent" ${analyticsConsent ? 'checked' : ''}><span>اختياري: أوافق على استخدام Meta لقياس الزيارات والطلبات وتحسين الإعلانات.<small>Meta تستقبل معلومات تقنية عن الزيارة. موافقتك مش شرط لإرسال الطلب.</small></span></label>
      <div class="form-actions full"><button class="button primary" id="submitBtn" type="submit">إرسال الطلب <span>←</span></button></div>
    </div>`;

  form.querySelectorAll('input:not([type="checkbox"])').forEach(input => {
    input.addEventListener('input', () => { answers[input.name] = input.value; formError.textContent = ''; });
  });
  form.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => {
    const choice = button.dataset.choice;
    const value = button.dataset.value;
    if (choice === 'workType' && value !== answers.workType) {
      answers.workDetail = '';
      answers.employmentSector = '';
      answers.workplaceType = '';
      answers.workplaceTypeOther = '';
      answers.jobTitle = '';
      answers.jobTitleOther = '';
    } else if (choice === 'employmentSector' && value !== answers.employmentSector) {
      answers.workplaceType = '';
      answers.workplaceTypeOther = '';
      answers.jobTitle = '';
      answers.jobTitleOther = '';
    } else if (choice === 'workplaceType' && value !== answers.workplaceType) {
      answers.workplaceTypeOther = '';
      answers.jobTitle = '';
      answers.jobTitleOther = '';
    } else if (choice === 'jobTitle' && value !== answers.jobTitle) {
      answers.jobTitleOther = '';
    }
    answers[choice] = value;
    renderForm();
    formError.textContent = '';
    form.querySelector(`[data-choice="${choice}"][data-value="${value}"]`)?.focus();
  }));
  form.querySelector('[name="consent"]').addEventListener('change', event => { answers.consent = event.target.checked; });
  form.querySelector('[name="analyticsConsent"]').addEventListener('change', event => {
    analyticsConsent = event.target.checked;
    window.metaTracking?.setConsent(analyticsConsent);
  });
  form.querySelectorAll('a[href="#"]').forEach(link => link.addEventListener('click', event => event.preventDefault()));
}

function validEgyptianMobile(value) {
  const number = value.replace(/[\s()-]/g, '').replace(/^\+?20/, '').replace(/^0/, '');
  return /^1[0125]\d{8}$/.test(number);
}

async function submitForm(event) {
  event.preventDefault();
  if (submissionInProgress) return;
  formError.textContent = '';
  if (answers.name.trim().length < 3) formError.textContent = 'اكتب اسمك بالكامل من فضلك.';
  else if (!validEgyptianMobile(answers.phone)) formError.textContent = 'راجع رقم الموبايل. لازم يكون رقم مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015.';
  else if (!answers.workType) formError.textContent = 'اختار طبيعة شغلك من الاختيارات.';
  else if (answers.workType === 'employee' && !answers.employmentSector) formError.textContent = 'اختار قطاع جهة عملك.';
  else if (answers.workType === 'employee' && !answers.workplaceType) formError.textContent = 'اختار نوع جهة العمل.';
  else if (answers.workType === 'employee' && answers.workplaceType === 'other' && answers.workplaceTypeOther.trim().length < 2) formError.textContent = 'اكتب نوع جهة العمل باختصار.';
  else if (answers.workType === 'employee' && !answers.jobTitle) formError.textContent = 'اختار وظيفتك داخل جهة العمل.';
  else if (answers.workType === 'employee' && answers.jobTitle === 'other' && answers.jobTitleOther.trim().length < 2) formError.textContent = 'اكتب المسمى الوظيفي والتخصص باختصار.';
  else if (answers.workType === 'other' && answers.workDetail.trim().length < 2) formError.textContent = 'اكتب طبيعة شغلك باختصار.';
  else if (answers.workAddress.trim().length < 4) formError.textContent = 'اكتب عنوان الشغل أو النشاط بشكل مختصر.';
  else if (!answers.creditHistory) formError.textContent = 'اختار الإجابة الأقرب لحالة سجل السداد.';
  else if (!answers.consent) formError.textContent = 'وافق على استخدام البيانات والتواصل بخصوص الطلب قبل الإرسال.';
  else {
    submissionInProgress = true;
    const submitButton=document.querySelector('#submitBtn');
    submitButton.disabled=true;
    submitButton.textContent='جارٍ حفظ طلبك...';
    try {
      const response=await fetch('/api/leads',{method:'POST',headers:{'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify({...answers,website:form.querySelector('[name="website"]').value})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error || 'ماقدرناش نحفظ الطلب. حاول مرة تانية.');
      if (typeof result.id !== 'string' || !result.id) throw new Error('الخادم ما أكدش تسجيل الطلب. حاول مرة تانية.');
      window.metaTracking?.trackLead();
      document.querySelector('#wizard').hidden=true;
      const reference = escapeHtml(result.id);
      document.querySelector('#wizard').insertAdjacentHTML('afterend',`<div class="form-card confirmation-card" tabindex="-1"><div class="confirm-mark">✓</div><h3>طلبك دخل مرحلة المراجعة</h3><p>فريق One Way هيتواصل معاك خلال 5 لـ 45 دقيقة لتأكيد بياناتك ومراجعة الخطوة المناسبة.</p><p class="reference">رقم طلبك: <b>${reference}</b></p></div>`);
      showSuccessDialog(reference);
    } catch (error) {
      formError.textContent=error.message || 'تعذر الاتصال بالخادم. بياناتك لم يتم تأكيد حفظها؛ حاول مرة تانية.';
      submissionInProgress = false;
      submitButton.disabled=false;
      submitButton.textContent='إرسال الطلب ←';
    }
  }
}

function showSuccessDialog(reference) {
  const overlay = document.createElement('div');
  overlay.className = 'success-overlay';
  overlay.innerHTML = `
    <section class="success-dialog" role="dialog" aria-modal="true" aria-labelledby="successTitle" aria-describedby="successDescription" tabindex="-1">
      <button class="success-close" type="button" aria-label="إغلاق النافذة">×</button>
      <div class="success-sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="success-icon" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="m17 33 10 10 21-23" /></svg></div>
      <p class="success-kicker">تمام كده!</p>
      <h2 id="successTitle">طلبك وصلنا يا بطل</h2>
      <p id="successDescription">طلبك دخل مرحلة المراجعة. فريق One Way هيتواصل معاك خلال <strong>5 لـ 45 دقيقة</strong> لتأكيد بياناتك ومناقشة الخطوة المناسبة ليك. خليك قريب من موبايلك.</p>
      <ol class="success-steps" aria-label="الخطوات التالية">
        <li class="is-complete"><span>✓</span><b>طلبك وصل</b></li>
        <li class="is-current"><span>2</span><b>مراجعة البيانات</b></li>
        <li><span>3</span><b>نتواصل معاك</b></li>
      </ol>
      <div class="success-reference"><span>رقم الطلب</span><strong dir="ltr">${reference}</strong><button class="copy-reference" type="button">نسخ الرقم</button></div>
      <button class="button primary success-done" type="button">تمام، هستنى تواصلكم</button>
      <p class="success-note">المكالمة لتأكيد بياناتك ومراجعة احتياجك. الموافقة وشروط التمويل بتتحدد بعد المراجعة.</p>
    </section>`;
  document.body.append(overlay);
  document.body.classList.add('dialog-open');
  const dialog = overlay.querySelector('.success-dialog');
  let onKeydown;
  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.classList.add('is-closing');
    document.body.classList.remove('dialog-open');
    window.setTimeout(() => {
      overlay.remove();
      document.querySelector('.confirmation-card')?.focus();
    }, 180);
  };
  overlay.querySelector('.success-close').addEventListener('click', close);
  overlay.querySelector('.success-done').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.querySelector('.copy-reference').addEventListener('click', async event => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(reference);
    } catch {
      const field = document.createElement('textarea');
      field.value = reference;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    button.textContent = 'اتنسخ ✓';
    button.classList.add('copied');
  });
  onKeydown = event => {
    if (event.key === 'Escape') {
      close();
    }
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button')];
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault(); controls.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
        event.preventDefault(); controls[0].focus();
      }
    }
  };
  document.addEventListener('keydown', onKeydown);
  overlay.querySelector('.success-close').focus({ preventScroll: true });
}

document.querySelector('#wizard').addEventListener('submit', submitForm);
document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#application').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => document.querySelector('#name')?.focus({ preventScroll: true }), 350);
}));
renderForm();
