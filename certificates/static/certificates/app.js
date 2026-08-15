// System configuration & state management
const state = {
  selectedDate: null, // Date object
  selectedSlot: null,  // 'morning' or 'evening'
  certificateCount: 1, // Default certificate quantity (1-20)
  currentMonth: new Date(), // For calendar navigation
  baseDate: new Date("2026-08-15T18:23:05+03:00") // Anchored current time as per system metadata
};

// Engineer categories
const CATEGORIES = [
  { id: 'engineer', name: 'مهندس' },
  { id: 'consultant', name: 'مهندس استشاري' },
  { id: 'consultant_concrete', name: 'مهندس استشاري تصميم و انشءات خرسانية' },
  { id: 'specialized_office', name: 'مكتب نوعي' },
  { id: 'multi_office', name: 'مكتب متعدد' }
];

document.addEventListener('DOMContentLoaded', () => {
  initDropdowns();
  initCertificateCounter();
  initCalendar();
  setupValidationListeners();
  
  // Submit action
  document.getElementById('syndicate-form').addEventListener('submit', handleFormSubmit);
  
  // Close modal action
  document.getElementById('close-modal').addEventListener('click', hideSuccessModal);
});

// Populate categories dropdown
function initDropdowns() {
  const categorySelect = document.getElementById('category');
  if (categorySelect) {
    categorySelect.innerHTML = '<option value="" disabled selected>اختر فئة المهندس</option>';
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id; // Send key to django
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }
}

// Certificate Counter Control (1 to 20)
function initCertificateCounter() {
  const valInput = document.getElementById('cert-count');
  const decreaseBtn = document.getElementById('decrease-certs');
  const increaseBtn = document.getElementById('increase-certs');

  if (!valInput || !decreaseBtn || !increaseBtn) return;

  const updateCounter = (val) => {
    let newVal = Math.min(20, Math.max(1, val));
    state.certificateCount = newVal;
    valInput.value = newVal;
    
    // Toggle button disabled states visually
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

  // Init
  updateCounter(1);
}

// Calendar Engine implementation
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

  // Arabic Months Names
  const arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  calTitle.textContent = `${arabicMonths[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 4 is Thursday, 5 is Friday
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Pad empty spots before the first day of month
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day disabled';
    calGrid.appendChild(emptyCell);
  }

  // Generate day elements
  for (let day = 1; day <= totalDays; day++) {
    const dateObj = new Date(year, month, day);
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    dayCell.textContent = day;

    const compareDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const sysDate = new Date(state.baseDate.getFullYear(), state.baseDate.getMonth(), state.baseDate.getDate());
    const dayOfWeek = dateObj.getDay();

    const isWeekend = (dayOfWeek === 4 || dayOfWeek === 5); // Thursday & Friday
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

  // 1. Morning Slot Item
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

  // 2. Evening Slot Item
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

// Field validations
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
    
    el.addEventListener('input', () => {
      item.validator(el);
      toggleSubmitBtnState();
    });
    el.addEventListener('blur', () => {
      item.validator(el);
      toggleSubmitBtnState();
    });
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
    if (errorEl) {
      errorEl.textContent = errorMsg;
      errorEl.style.display = 'flex';
    }
    return false;
  }
}

function validateEngineerName(el) {
  const val = el.value.trim();
  const arabicWordRegex = /^[\u0600-\u06FF\s]+$/;
  const words = val.split(/\s+/).filter(Boolean);
  
  if (val.length === 0) {
    return validateField(el, false, 'اسم المهندس مطلوب.');
  }
  if (!arabicWordRegex.test(val)) {
    return validateField(el, false, 'يجب كتابة الاسم باللغة العربية فقط.');
  }
  if (words.length < 3) {
    return validateField(el, false, 'يجب إدخال الاسم ثلاثياً على الأقل.');
  }
  return validateField(el, true);
}

function validateRegistrationNum(el) {
  const val = el.value.trim();
  const numRegex = /^[0-9]+$/;
  
  if (val.length === 0) {
    return validateField(el, false, 'رقم القيد مطلوب.');
  }
  if (!numRegex.test(val)) {
    return validateField(el, false, 'يجب إدخال أرقام فقط.');
  }
  if (val.length < 4 || val.length > 8) {
    return validateField(el, false, 'رقم القيد يجب أن يكون بين 4 و 8 أرقام.');
  }
  return validateField(el, true);
}

function validateDivision(el) {
  const val = el.value.trim();
  if (val.length === 0) {
    return validateField(el, false, 'الشعبة الهندسية مطلوبة.');
  }
  return validateField(el, true);
}

function validateRegistryNum(el) {
  const val = el.value.trim();
  const numRegex = /^[0-9]+$/;
  
  if (val.length === 0) {
    return validateField(el, false, 'رقم السجل مطلوب.');
  }
  if (!numRegex.test(val)) {
    return validateField(el, false, 'يجب إدخال أرقام فقط.');
  }
  return validateField(el, true);
}

function validateSelect(el) {
  const val = el.value;
  if (!val || val === "") {
    return validateField(el, false, 'يرجى تحديد اختيار.');
  }
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

  const engNameValid = validateEngineerName(nameEl);
  const regNumValid = validateRegistrationNum(regEl);
  const divisionValid = validateDivision(divEl);
  const registryValid = validateRegistryNum(registryEl);
  const categoryValid = validateSelect(catEl);
  const dateValid = state.selectedDate && state.selectedSlot;
  
  return engNameValid && regNumValid && divisionValid && registryValid && categoryValid && dateValid;
}

function toggleSubmitBtnState() {
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) {
    submitBtn.disabled = !checkFormValidity();
  }
}

// Form Submission over API to Django
function handleFormSubmit(e) {
  e.preventDefault();
  
  if (!checkFormValidity()) {
    return;
  }

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;

  // Format date to ISO
  const year = state.selectedDate.getFullYear();
  const month = String(state.selectedDate.getMonth() + 1).padStart(2, '0');
  const day = String(state.selectedDate.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;

  const payload = {
    engineer_name: document.getElementById('engineer-name').value.trim(),
    registration_num: document.getElementById('registration-num').value.trim(),
    division: document.getElementById('division').value.trim(),
    registry_num: document.getElementById('registry-num').value.trim(),
    category: document.getElementById('category').value,
    certificate_count: state.certificateCount,
    pickup_date: formattedDate,
    pickup_slot: state.selectedSlot
  };

  // Perform API Post
  fetch('/apply/submit/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  })
  .then(response => response.json().then(data => ({ status: response.status, body: data })))
  .then(res => {
    if (res.status === 200 && res.body.success) {
      showSuccessModal(res.body.data);
    } else {
      // Display backend validation error in a global form field or visual error
      alert(res.body.error || 'حدث خطأ أثناء حفظ الطلب.');
      submitBtn.disabled = false;
    }
  })
  .catch(err => {
    console.error('Error submitting application:', err);
    alert('تعذر الاتصال بالخادم. يرجى المحاولة لاحقاً.');
    submitBtn.disabled = false;
  });
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

  // Show queue rank in modal
  const existingRow = document.getElementById('receipt-queue-row');
  if (existingRow) {
    existingRow.remove();
  }
  
  const queueRow = document.createElement('div');
  queueRow.className = 'receipt-row';
  queueRow.id = 'receipt-queue-row';
  queueRow.innerHTML = `
    <span class="receipt-label">ترتيب الحجز للفترة:</span>
    <span class="receipt-val" style="color: var(--accent);">${data.queue_pos}</span>
  `;
  document.querySelector('.receipt-details').appendChild(queueRow);

  overlay.classList.add('active');
}

function hideSuccessModal() {
  const overlay = document.getElementById('success-overlay');
  if (!overlay) return;
  
  overlay.classList.remove('active');
  
  // Reset form
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
