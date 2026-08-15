// =========================================================================
// SUPABASE CLIENT INITIALIZATION
// Replace these with your actual Supabase Project credentials
// =========================================================================
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// System state management
const state = {
  selectedDate: null,
  selectedSlot: null,
  certificateCount: 1,
  currentMonth: new Date(),
  baseDate: new Date("2026-08-15T18:23:05+03:00"), // Anchored system date
  config: null
};

// Engineer categories
const CATEGORIES = [
  { id: 'engineer', name: 'مهندس' },
  { id: 'consultant', name: 'مهندس استشاري' },
  { id: 'consultant_concrete', name: 'مهندس استشاري تصميم و انشءات خرسانية' },
  { id: 'specialized_office', name: 'مكتب نوعي' },
  { id: 'multi_office', name: 'مكتب متعدد' }
];

document.addEventListener('DOMContentLoaded', async () => {
  await fetchConfiguration();
  initDropdowns();
  initCertificateCounter();
  initCalendar();
  setupValidationListeners();
  
  document.getElementById('syndicate-form').addEventListener('submit', handleFormSubmit);
  document.getElementById('close-modal').addEventListener('click', hideSuccessModal);
});

// Fetch settings from Supabase
async function fetchConfiguration() {
  try {
    const { data, error } = await supabase
      .from('syndicate_configuration')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (error) throw error;
    state.config = data;
    
    // Update daily limits text in the HTML banner
    const limitBannerText = document.getElementById('limit-info-text');
    if (limitBannerText) {
      limitBannerText.innerHTML = `• السعة اليومية القصوى للفترات: <strong>${data.daily_limit_morning}</strong> شهادة صباحاً / <strong>${data.daily_limit_evening}</strong> شهادة مساءً.`;
    }
  } catch (err) {
    console.error('Error fetching Supabase configuration:', err);
  }
}

function initDropdowns() {
  const categorySelect = document.getElementById('category');
  if (categorySelect) {
    categorySelect.innerHTML = '<option value="" disabled selected>اختر فئة المهندس</option>';
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }
}

function initCertificateCounter() {
  const valInput = document.getElementById('cert-count');
  const decreaseBtn = document.getElementById('decrease-certs');
  const increaseBtn = document.getElementById('increase-certs');

  if (!valInput || !decreaseBtn || !increaseBtn) return;

  const updateCounter = (val) => {
    let newVal = Math.min(20, Math.max(1, val));
    state.certificateCount = newVal;
    valInput.value = newVal;
    decreaseBtn.disabled = newVal <= 1;
    increaseBtn.disabled = newVal >= 20;
    validateField(valInput, true);
  };

  decreaseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    updateCounter(state.certificateCount - 1);
  });

  increaseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    updateCounter(state.certificateCount + 1);
  });

  updateCounter(1);
}

function initCalendar() {
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');

  if (!prevBtn || !nextBtn) return;

  prevBtn.addEventListener('click', (e) => {
    e.preventDefault();
    state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
    renderCalendar();
  });

  nextBtn.addEventListener('click', (e) => {
    e.preventDefault();
    state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
    renderCalendar();
  });

  renderCalendar();
}

function renderCalendar() {
  const calTitle = document.getElementById('cal-month-title');
  const calGrid = document.getElementById('cal-days-grid');
  if (!calTitle || !calGrid) return;
  
  calGrid.innerHTML = '';
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();

  const arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  calTitle.textContent = `${arabicMonths[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day disabled';
    calGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateObj = new Date(year, month, day);
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    dayCell.textContent = day;

    const compareDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const sysDate = new Date(state.baseDate.getFullYear(), state.baseDate.getMonth(), state.baseDate.getDate());
    const dayOfWeek = dateObj.getDay();

    const isWeekend = (dayOfWeek === 4 || dayOfWeek === 5);
    const isPast = compareDate < sysDate;

    let isTodayShiftsClosed = false;
    const isToday = compareDate.getTime() === sysDate.getTime();
    if (isToday) {
      dayCell.classList.add('today');
      const currentHour = state.baseDate.getHours();
      if (currentHour >= 17) {
        isTodayShiftsClosed = true;
      }
    }

    if (isWeekend) {
      dayCell.classList.add('weekend');
    } else if (isPast || isTodayShiftsClosed) {
      dayCell.classList.add('disabled');
    } else {
      dayCell.addEventListener('click', () => selectCalendarDate(dateObj));
    }

    if (state.selectedDate && compareDate.getTime() === new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth(), state.selectedDate.getDate()).getTime()) {
      dayCell.classList.add('selected');
    }

    calGrid.appendChild(dayCell);
  }
}

function selectCalendarDate(date) {
  state.selectedDate = date;
  renderCalendar();
  state.selectedSlot = null;
  renderTimeSlots(date);
  validateDateSelection();
}

function renderTimeSlots(date) {
  const slotsSection = document.getElementById('slots-section');
  const slotsGrid = document.getElementById('slots-grid');
  if (!slotsSection || !slotsGrid) return;
  
  slotsGrid.innerHTML = '';
  slotsSection.style.display = 'block';
  
  const sysDate = new Date(state.baseDate.getFullYear(), state.baseDate.getMonth(), state.baseDate.getDate());
  const isToday = date.getFullYear() === sysDate.getFullYear() &&
                  date.getMonth() === sysDate.getMonth() &&
                  date.getDate() === sysDate.getDate();
                  
  const currentHour = state.baseDate.getHours();
  
  const isMorningClosed = isToday && (currentHour >= 9);
  const isEveningClosed = isToday && (currentHour >= 17);

  const morningSlot = document.createElement('div');
  morningSlot.className = `slot-option ${isMorningClosed ? 'disabled' : ''}`;
  morningSlot.innerHTML = `
    <span class="slot-badge morning">صباحي</span>
    <div class="slot-title">
      <span>الفترة الصباحية</span>
    </div>
    <div class="slot-desc">من 9:00 ص إلى 1:00 م (آخر موعد للتسجيل: 9:00 ص اليوم)</div>
  `;
  if (isMorningClosed) {
    const badge = morningSlot.querySelector('.slot-badge');
    badge.className = 'slot-badge closed';
    badge.textContent = 'مغلق';
  } else {
    morningSlot.addEventListener('click', () => selectSlot('morning', morningSlot));
  }
  slotsGrid.appendChild(morningSlot);

  const eveningSlot = document.createElement('div');
  eveningSlot.className = `slot-option ${isEveningClosed ? 'disabled' : ''}`;
  eveningSlot.innerHTML = `
    <span class="slot-badge evening">مسائي</span>
    <div class="slot-title">
      <span>الفترة المسائية</span>
    </div>
    <div class="slot-desc">من 1:00 م إلى 5:00 م (آخر موعد للتسجيل: 5:00 م اليوم)</div>
  `;
  if (isEveningClosed) {
    const badge = eveningSlot.querySelector('.slot-badge');
    badge.className = 'slot-badge closed';
    badge.textContent = 'مغلق';
  } else {
    eveningSlot.addEventListener('click', () => selectSlot('evening', eveningSlot));
  }
  slotsGrid.appendChild(eveningSlot);
}

function selectSlot(type, element) {
  state.selectedSlot = type;
  const siblings = element.parentNode.querySelectorAll('.slot-option');
  siblings.forEach(sib => sib.classList.remove('selected'));
  element.classList.add('selected');
  validateDateSelection();
}

function setupValidationListeners() {
  const inputs = [
    { id: 'engineer-name', validator: validateEngineerName },
    { id: 'registration-num', validator: validateRegistrationNum },
    { id: 'division', validator: validateDivision },
    { id: 'registry-num', validator: validateRegistryNum },
    { id: 'category', validator: validateSelect }
  ];

  inputs.forEach(item => {
    const el = document.getElementById(item.id);
    if (!el) return;
    el.addEventListener('input', () => { item.validator(el); toggleSubmitBtnState(); });
    el.addEventListener('blur', () => { item.validator(el); toggleSubmitBtnState(); });
  });
}

function validateField(inputEl, isValid, errorMsg) {
  const parent = inputEl.closest('.form-group');
  if (!parent) return isValid;
  const errorEl = parent.querySelector('.error-msg');
  if (isValid) {
    inputEl.classList.remove('input-error');
    if (errorEl) errorEl.style.display = 'none';
    return true;
  } else {
    inputEl.classList.add('input-error');
    if (errorEl) { errorEl.textContent = errorMsg; errorEl.style.display = 'flex'; }
    return false;
  }
}

function validateEngineerName(el) {
  const val = el.value.trim();
  const arabicWordRegex = /^[\u0600-\u06FF\s]+$/;
  const words = val.split(/\s+/).filter(Boolean);
  if (val.length === 0) return validateField(el, false, 'اسم المهندس مطلوب.');
  if (!arabicWordRegex.test(val)) return validateField(el, false, 'يجب كتابة الاسم باللغة العربية فقط.');
  if (words.length < 3) return validateField(el, false, 'يجب إدخال الاسم ثلاثياً على الأقل.');
  return validateField(el, true);
}

function validateRegistrationNum(el) {
  const val = el.value.trim();
  const numRegex = /^[0-9]+$/;
  if (val.length === 0) return validateField(el, false, 'رقم القيد مطلوب.');
  if (!numRegex.test(val)) return validateField(el, false, 'يجب إدخال أرقام فقط.');
  if (val.length < 4 || val.length > 8) return validateField(el, false, 'رقم القيد يجب أن يكون بين 4 و 8 أرقام.');
  return validateField(el, true);
}

function validateDivision(el) {
  const val = el.value.trim();
  if (val.length === 0) return validateField(el, false, 'الشعبة الهندسية مطلوبة.');
  return validateField(el, true);
}

function validateRegistryNum(el) {
  const val = el.value.trim();
  const numRegex = /^[0-9]+$/;
  if (val.length === 0) return validateField(el, false, 'رقم السجل مطلوب.');
  if (!numRegex.test(val)) return validateField(el, false, 'يجب إدخال أرقام فقط.');
  return validateField(el, true);
}

function validateSelect(el) {
  const val = el.value;
  if (!val || val === "") return validateField(el, false, 'يرجى تحديد اختيار.');
  return validateField(el, true);
}

function validateDateSelection() {
  const errorEl = document.getElementById('date-error');
  if (!errorEl) return false;
  if (!state.selectedDate) {
    errorEl.textContent = 'يرجى اختيار تاريخ استلام.';
    errorEl.style.display = 'flex';
    return false;
  }
  if (!state.selectedSlot) {
    errorEl.textContent = 'يرجى اختيار الفترة الزمنية المفضلة.';
    errorEl.style.display = 'flex';
    return false;
  }
  errorEl.style.display = 'none';
  toggleSubmitBtnState();
  return true;
}

function checkFormValidity() {
  const nameEl = document.getElementById('engineer-name');
  const regEl = document.getElementById('registration-num');
  const divEl = document.getElementById('division');
  const registryEl = document.getElementById('registry-num');
  const catEl = document.getElementById('category');
  
  if (!nameEl || !regEl || !divEl || !registryEl || !catEl) return false;

  return validateEngineerName(nameEl) &&
         validateRegistrationNum(regEl) &&
         validateDivision(divEl) &&
         validateRegistryNum(registryEl) &&
         validateSelect(catEl) &&
         state.selectedDate && state.selectedSlot;
}

function toggleSubmitBtnState() {
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.disabled = !checkFormValidity();
}

// Submit directly to Supabase Database
async function handleFormSubmit(e) {
  e.preventDefault();
  
  if (!checkFormValidity()) return;

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;

  const year = state.selectedDate.getFullYear();
  const month = String(state.selectedDate.getMonth() + 1).padStart(2, '0');
  const day = String(state.selectedDate.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;

  const row = {
    engineer_name: document.getElementById('engineer-name').value.trim(),
    registration_num: document.getElementById('registration-num').value.trim(),
    division: document.getElementById('division').value.trim(),
    registry_num: document.getElementById('registry-num').value.trim(),
    category: document.getElementById('category').value,
    certificate_count: state.certificateCount,
    pickup_date: formattedDate,
    pickup_slot: state.selectedSlot
  };

  try {
    // 1. Insert into Supabase table
    const { data, error } = await supabase
      .from('applications')
      .insert([row])
      .select();

    if (error) throw error; // Trigger constraints will throw Postgres exception which lands here

    // 2. Fetch the queue position to show on receipt
    const { count, error: qError } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('pickup_date', formattedDate)
      .eq('pickup_slot', state.selectedSlot)
      .lte('created_at', data[0].created_at);

    if (qError) throw qError;

    // Display success receipt details
    const categoryName = CATEGORIES.find(c => c.id === row.category)?.name || row.category;
    const slotName = row.pickup_slot === 'morning' ? 'فترة صباحية (9 ص - 1 م)' : 'فترة مسائية (1 م - 5 م)';

    showSuccessModal({
      name: row.engineer_name,
      reg_num: row.registration_num,
      division: row.division,
      certs: row.certificate_count,
      date: row.pickup_date,
      slot: slotName,
      queue_pos: count
    });

  } catch (err) {
    console.error('Submission failed:', err);
    // Show database validation trigger messages
    alert(err.message || 'حدث خطأ أثناء الاتصال بقاعدة البيانات.');
    submitBtn.disabled = false;
  }
}

function showSuccessModal(data) {
  const overlay = document.getElementById('success-overlay');
  if (!overlay) return;

  document.getElementById('receipt-name').textContent = data.name;
  document.getElementById('receipt-reg').textContent = data.reg_num;
  document.getElementById('receipt-division').textContent = data.division;
  document.getElementById('receipt-certs').textContent = data.certs;
  document.getElementById('receipt-date').textContent = data.date;
  document.getElementById('receipt-slot').textContent = data.slot;

  const existingRow = document.getElementById('receipt-queue-row');
  if (existingRow) existingRow.remove();
  
  const queueRow = document.createElement('div');
  queueRow.className = 'receipt-row';
  queueRow.id = 'receipt-queue-row';
  queueRow.innerHTML = `
    <span class="receipt-label">ترتيبك في طابور الفترة:</span>
    <span class="receipt-val" style="color: var(--accent);">${data.queue_pos}</span>
  `;
  document.querySelector('.receipt-details').appendChild(queueRow);

  overlay.classList.add('active');
}

function hideSuccessModal() {
  const overlay = document.getElementById('success-overlay');
  if (!overlay) return;
  
  overlay.classList.remove('active');
  document.getElementById('syndicate-form').reset();
  state.selectedDate = null;
  state.selectedSlot = null;
  state.certificateCount = 1;
  initCertificateCounter();
  renderCalendar();
  
  const slotsSection = document.getElementById('slots-section');
  if (slotsSection) slotsSection.style.display = 'none';
  toggleSubmitBtnState();
}
