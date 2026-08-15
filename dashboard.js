// =========================================================================
// SUPABASE CLIENT INITIALIZATION
// Replace these with your actual Supabase Project credentials
// =========================================================================
const SUPABASE_URL = 'https://ygprsqehwnyvgzpxhqka.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlncHJzcWVod255dmd6cHhocWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDc3NDUsImV4cCI6MjEwMjM4Mzc0NX0.w4JJZUdYuyi358g6c6OsSHFR5PbjhZ8V3WA0w3vSjdM';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
const state = {
  config: null,
  targetDate: new Date("2026-08-15").toISOString().split('T')[0] // Default today's date
};

// Engineer category labels in Arabic
const CATEGORY_LABELS = {
  'engineer': 'مهندس',
  'consultant': 'مهندس استشاري',
  'consultant_concrete': 'مهندس استشاري تصميم و انشءات خرسانية',
  'specialized_office': 'مكتب نوعي',
  'multi_office': 'مكتب متعدد'
};

document.addEventListener('DOMContentLoaded', async () => {
  setupDateFilter();
  await loadDashboardData();
  setupSettingsForm();
});

// Configure date filter inputs
function setupDateFilter() {
  const dateInput = document.getElementById('date-select');
  if (dateInput) {
    dateInput.value = state.targetDate;
    dateInput.addEventListener('change', async (e) => {
      state.targetDate = e.target.value;
      await loadDashboardData();
    });
  }
}

// Main loader for all dashboard information
async function loadDashboardData() {
  try {
    // 1. Fetch Configuration
    const { data: config, error: configErr } = await supabase
      .from('syndicate_configuration')
      .select('*')
      .eq('id', 1)
      .single();

    if (configErr) throw configErr;
    state.config = config;
    populateSettingsFields(config);

    // 2. Fetch Applications for selected date
    const { data: apps, error: appsErr } = await supabase
      .from('applications')
      .select('*')
      .eq('pickup_date', state.targetDate)
      .order('created_at', { ascending: true }); // FIFO

    if (appsErr) throw appsErr;

    // Filter into slots
    const morningQueue = apps.filter(a => a.pickup_slot === 'morning');
    const eveningQueue = apps.filter(a => a.pickup_slot === 'evening');

    // Render stats and lists
    renderMetrics(morningQueue, eveningQueue);
    renderQueueTable('morning-table-body', morningQueue);
    renderQueueTable('evening-table-body', eveningQueue);

  } catch (err) {
    console.error('Error loading dashboard data:', err);
    alert('حدث خطأ أثناء تحميل بيانات لوحة التحكم.');
  }
}

// Populate stats numbers and widgets
function renderMetrics(morning, evening) {
  const morningCerts = morning.reduce((sum, item) => sum + item.certificate_count, 0);
  const eveningCerts = evening.reduce((sum, item) => sum + item.certificate_count, 0);

  document.getElementById('morning-total-val').textContent = `${morningCerts} / ${state.config.daily_limit_morning}`;
  document.getElementById('evening-total-val').textContent = `${eveningCerts} / ${state.config.daily_limit_evening}`;

  document.getElementById('morning-left-val').textContent = `المتبقي المتاح: ${Math.max(0, state.config.daily_limit_morning - morningCerts)} شهادة`;
  document.getElementById('evening-left-val').textContent = `المتبقي المتاح: ${Math.max(0, state.config.daily_limit_evening - eveningCerts)} شهادة`;

  document.getElementById('total-engineers-val').textContent = `${morning.length + evening.length} مهندس`;
  document.getElementById('total-certs-val').textContent = `إجمالي الشهادات المطلوبة: ${morningCerts + eveningCerts} شهادة`;

  document.getElementById('report-date-text').textContent = `تقرير تاريخ: ${state.targetDate}`;
}

// Render list rows inside tables
function renderQueueTable(tableBodyId, data) {
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;

  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
          لا توجد حجوزات مسجلة لهذه الفترة اليوم.
        </td>
      </tr>
    `;
    return;
  }

  data.forEach((app, index) => {
    const tr = document.createElement('tr');
    
    // Parse time
    const localTime = new Date(app.created_at).toLocaleTimeString('ar-EG', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    const categoryText = CATEGORY_LABELS[app.category] || app.category;

    tr.innerHTML = `
      <td><span class="queue-badge number">${index + 1}</span></td>
      <td style="font-weight: 700;">${escapeHtml(app.engineer_name)}</td>
      <td>${escapeHtml(app.registration_num)}</td>
      <td>${escapeHtml(app.division)}</td>
      <td>${categoryText}</td>
      <td style="font-weight: 700; color: var(--accent);">${app.certificate_count}</td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${localTime}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Setup and bind configuration settings updates to Supabase
function setupSettingsForm() {
  const form = document.getElementById('settings-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const updatedConfig = {
      daily_limit_morning: parseInt(document.getElementById('limit_morning').value),
      daily_limit_evening: parseInt(document.getElementById('limit_evening').value),
      monthly_limit_engineer: parseInt(document.getElementById('limit_engineer').value),
      monthly_limit_consultant: parseInt(document.getElementById('limit_consultant').value),
      monthly_limit_concrete_consultant: parseInt(document.getElementById('limit_concrete_consultant').value),
      monthly_limit_specialized_office: parseInt(document.getElementById('limit_specialized_office').value),
      monthly_limit_multi_office: parseInt(document.getElementById('limit_multi_office').value),
      telegram_bot_token: document.getElementById('telegram_token').value.trim(),
      telegram_chat_id: document.getElementById('telegram_chat_id').value.trim()
    };

    try {
      const { data, error } = await supabase
        .from('syndicate_configuration')
        .update(updatedConfig)
        .eq('id', 1);

      if (error) throw error;
      alert('تم حفظ التغييرات والحدود بنجاح!');
      await loadDashboardData();
    } catch (err) {
      console.error('Failed to update config:', err);
      alert('حدث خطأ أثناء حفظ التحديثات.');
    }
  });
}

function populateSettingsFields(config) {
  document.getElementById('limit_morning').value = config.daily_limit_morning;
  document.getElementById('limit_evening').value = config.daily_limit_evening;
  document.getElementById('limit_engineer').value = config.monthly_limit_engineer;
  document.getElementById('limit_consultant').value = config.monthly_limit_consultant;
  document.getElementById('limit_concrete_consultant').value = config.monthly_limit_concrete_consultant;
  document.getElementById('limit_specialized_office').value = config.monthly_limit_specialized_office;
  document.getElementById('limit_multi_office').value = config.monthly_limit_multi_office;
  document.getElementById('telegram_token').value = config.telegram_bot_token;
  document.getElementById('telegram_chat_id').value = config.telegram_chat_id;
}

// Helpers
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
