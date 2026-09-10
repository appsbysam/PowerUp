const $ = s => document.querySelector(s);
let jobs = [], currentUser = null, quickFilter = 'all', pinUnlocked = false;
let calendarCursor = new Date();
calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1, 12);

const AUTH_REDIRECT_URL = 'https://appsbysam.github.io/PowerUp/';
const APP_SW_VERSION = '0.3.0';

const authView = $('#authView');
const pinView = $('#pinView');
const appView = $('#appView');
const jobsList = $('#jobsList');
const dialog = $('#jobDialog');
const pinDialog = $('#pinDialog');
const dayJobsDialog = $('#dayJobsDialog');

const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const labelStatus = s => ({new:'New',to_schedule:'To schedule',scheduled:'Scheduled',in_progress:'In progress',waiting:'Follow-Up',completed:'Completed'}[s] || s);
const pinKey = id => `powerup_pin_${id}`;

async function pinHash(pin, id) {
  const data = new TextEncoder().encode(`PowerUp:${id}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function localDate(d = new Date()) {
  const x = new Date(d), o = x.getTimezoneOffset();
  return new Date(x - o * 60000).toISOString().slice(0, 10);
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return localDate(x);
}
function formatDay(d) {
  return new Intl.DateTimeFormat('en-AU', {weekday:'short',day:'numeric',month:'short'}).format(new Date(`${d}T12:00:00`));
}
function formatLongDate(d) {
  return new Intl.DateTimeFormat('en-AU', {weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${d}T12:00:00`));
}
function suburbFromAddress(a = '') {
  const p = a.split(',').map(x => x.trim()).filter(Boolean);
  return p.length >= 2 ? p[p.length - 2].replace(/\b(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*\d{4}\b/i, '').trim() : '';
}

async function init() {
  const {data:{session}} = await supabaseClient.auth.getSession();
  await setSession(session, true);
  supabaseClient.auth.onAuthStateChange((_e, s) => setSession(s, false));
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register(`./sw.js?v=${APP_SW_VERSION}`, {updateViaCache:'none'});
      await reg.update();
    } catch (err) {
      console.warn(err);
    }
  }
}

async function setSession(session, initial = false) {
  currentUser = session?.user || null;
  if (!currentUser) {
    pinUnlocked = false;
    pinView.classList.add('hidden');
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
    return;
  }
  const hasPin = !!localStorage.getItem(pinKey(currentUser.id));
  if (initial && hasPin && !pinUnlocked) {
    authView.classList.add('hidden');
    appView.classList.add('hidden');
    pinView.classList.remove('hidden');
    return;
  }
  pinUnlocked = true;
  authView.classList.add('hidden');
  pinView.classList.add('hidden');
  appView.classList.remove('hidden');
  await loadJobs();
}

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#authMessage').textContent = '';
  const {error} = await supabaseClient.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
  if (error) $('#authMessage').textContent = error.message;
});

$('#signUpBtn').onclick = async () => {
  const email = $('#email').value.trim(), password = $('#password').value;
  if (!email || password.length < 6) {
    $('#authMessage').textContent = 'Enter an email and password (minimum 6 characters).';
    return;
  }
  const {error} = await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:AUTH_REDIRECT_URL}});
  $('#authMessage').textContent = error ? error.message : 'Account created. Check your email to confirm it.';
};

$('#resendBtn').onclick = async () => {
  const email = $('#email').value.trim();
  if (!email) {
    $('#authMessage').textContent = 'Enter your email address first.';
    return;
  }
  const {error} = await supabaseClient.auth.resend({type:'signup',email,options:{emailRedirectTo:AUTH_REDIRECT_URL}});
  $('#authMessage').textContent = error ? error.message : 'Confirmation email sent. Check your inbox and junk folder.';
};

$('#signOutBtn').onclick = async () => {
  pinUnlocked = false;
  await supabaseClient.auth.signOut();
};

$('#pinUnlockForm').onsubmit = async e => {
  e.preventDefault();
  const pin = $('#pinUnlock').value, stored = localStorage.getItem(pinKey(currentUser.id));
  if (!stored || await pinHash(pin, currentUser.id) !== stored) {
    $('#pinMessage').textContent = 'Incorrect PIN.';
    $('#pinUnlock').value = '';
    return;
  }
  pinUnlocked = true;
  $('#pinMessage').textContent = '';
  $('#pinUnlock').value = '';
  pinView.classList.add('hidden');
  appView.classList.remove('hidden');
  await loadJobs();
};

$('#usePasswordBtn').onclick = async () => {
  pinUnlocked = false;
  await supabaseClient.auth.signOut();
  pinView.classList.add('hidden');
  authView.classList.remove('hidden');
};

$('#pinSettingsBtn').onclick = () => {
  if (!currentUser) return;
  $('#newPin').value = '';
  $('#confirmPin').value = '';
  $('#pinSetupMessage').textContent = '';
  $('#removePinBtn').classList.toggle('hidden', !localStorage.getItem(pinKey(currentUser.id)));
  pinDialog.showModal();
};
$('#closePinBtn').onclick = () => pinDialog.close();
$('#pinSetupForm').onsubmit = async e => {
  e.preventDefault();
  const a = $('#newPin').value, b = $('#confirmPin').value;
  if (!/^\d{4}$/.test(a)) {
    $('#pinSetupMessage').textContent = 'PIN must be exactly 4 digits.';
    return;
  }
  if (a !== b) {
    $('#pinSetupMessage').textContent = 'PINs do not match.';
    return;
  }
  localStorage.setItem(pinKey(currentUser.id), await pinHash(a, currentUser.id));
  pinDialog.close();
  alert('PIN access is now enabled on this device.');
};
$('#removePinBtn').onclick = () => {
  if (!currentUser) return;
  localStorage.removeItem(pinKey(currentUser.id));
  pinDialog.close();
  alert('PIN access removed from this device.');
};

function openMenu() { sideMenu.classList.add('open'); drawerBackdrop.classList.remove('hidden'); }
function closeMenu() { sideMenu.classList.remove('open'); drawerBackdrop.classList.add('hidden'); }
const sideMenu = $('#sideMenu'), drawerBackdrop = $('#drawerBackdrop');
$('#menuBtn').onclick = openMenu;
$('#closeMenuBtn').onclick = closeMenu;
drawerBackdrop.onclick = closeMenu;

document.querySelectorAll('.nav-item').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  const cal = b.dataset.view === 'calendar';
  $('#dashboardView').classList.toggle('hidden', cal);
  $('#calendarView').classList.toggle('hidden', !cal);
  if (cal) renderCalendar();
  closeMenu();
});

async function loadJobs() {
  const {data,error} = await supabaseClient.from('jobs').select('*').order('scheduled_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false});
  if (error) {
    jobsList.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  jobs = data || [];
  render();
  renderCalendar();
}

function filtered() {
  const q = $('#searchInput').value.toLowerCase().trim(), status = $('#statusFilter').value;
  return jobs.filter(j => {
    if (status && j.status !== status) return false;
    if (quickFilter === 'scheduled' && (!j.scheduled_date || j.status === 'waiting')) return false;
    if (quickFilter === 'unscheduled' && j.scheduled_date) return false;
    if (quickFilter === 'followup' && j.status !== 'waiting') return false;
    if (q && !`${j.title} ${j.customer_name} ${j.suburb || ''} ${j.address_line || ''} ${j.description || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function durationLabel(minutes) {
  if (!minutes) return '';
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h.toFixed(1) : h} hr${h === 1 ? '' : 's'}`;
}

function render() {
  const scheduled = jobs.filter(j => j.scheduled_date && j.status !== 'waiting' && j.status !== 'completed').length;
  const unscheduled = jobs.filter(j => !j.scheduled_date && j.status !== 'completed').length;
  const followup = jobs.filter(j => j.status === 'waiting').length;
  $('#countAll').textContent = jobs.length;
  $('#countScheduled').textContent = scheduled;
  $('#countUnscheduled').textContent = unscheduled;
  $('#countFollowup').textContent = followup;
  const rows = filtered();
  jobsList.innerHTML = rows.length ? rows.map(j => `<article class="job-card" data-id="${j.id}"><div class="job-top"><div><div class="job-title">${esc(j.title)}</div><div class="muted">${esc(j.customer_name || 'No customer')}${j.suburb ? ` · ${esc(j.suburb)}` : j.address_line ? ` · ${esc(suburbFromAddress(j.address_line))}` : ''}</div></div><span class="chip">${esc(labelStatus(j.status))}</span></div><div class="chips">${j.scheduled_date ? `<span class="chip">📅 ${esc(j.scheduled_date)}${j.scheduled_start ? ` ${esc(j.scheduled_start.slice(0,5))}` : ''}</span>` : '<span class="chip">Unscheduled</span>'}${j.priority !== 'normal' ? `<span class="chip">${esc(j.priority)}</span>` : ''}${j.estimated_minutes ? `<span class="chip">⏱ ${durationLabel(j.estimated_minutes)}</span>` : ''}</div></article>`).join('') : '<div class="empty">No jobs here yet.</div>';
  document.querySelectorAll('.job-card').forEach(c => c.onclick = () => openJob(jobs.find(j => j.id === c.dataset.id)));
}

function jobsForDate(date) {
  return jobs.filter(j => j.scheduled_date === date).sort((a,b) => (a.scheduled_start || '99:99').localeCompare(b.scheduled_start || '99:99'));
}

function renderCalendar() {
  const root = $('#monthCalendar');
  if (!root) return;
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const first = new Date(year, month, 1, 12);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const today = localDate();
  $('#calendarMonthLabel').textContent = new Intl.DateTimeFormat('en-AU', {month:'long',year:'numeric'}).format(first);

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push('<div class="month-day blank" aria-hidden="true"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day, 12);
    const key = dateKey(d);
    const dayJobs = jobsForDate(key);
    const hasJobs = dayJobs.length > 0;
    cells.push(`<button class="month-day${hasJobs ? ' has-jobs' : ''}${key === today ? ' today' : ''}" type="button" data-date="${key}" aria-label="${esc(formatLongDate(key))}${hasJobs ? `, ${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'}` : ', no jobs'}"><span class="month-day-number">${day}</span>${hasJobs ? `<span class="month-job-count">${dayJobs.length}</span><span class="month-job-label">${dayJobs.length === 1 ? 'job' : 'jobs'}</span>` : ''}</button>`);
  }
  const remainder = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < remainder; i++) cells.push('<div class="month-day blank" aria-hidden="true"></div>');
  root.innerHTML = cells.join('');
  root.querySelectorAll('.month-day[data-date]').forEach(b => b.onclick = () => openCalendarDay(b.dataset.date));
}

function openCalendarDay(date) {
  const dayJobs = jobsForDate(date);
  $('#dayJobsDialogTitle').textContent = formatLongDate(date);
  $('#dayJobsDialogSub').textContent = dayJobs.length ? `${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'} scheduled` : 'No jobs scheduled';
  $('#dayJobsList').innerHTML = dayJobs.length ? dayJobs.map(j => `<button class="day-job-card" type="button" data-id="${j.id}"><span><strong>${esc(j.customer_name || j.title)}</strong><small>${esc(j.title)}${j.suburb ? ` · ${esc(j.suburb)}` : ''}</small></span><span class="day-job-meta">${j.scheduled_start ? esc(j.scheduled_start.slice(0,5)) : 'Any time'}<small>${esc(labelStatus(j.status))}</small></span></button>`).join('') : '<div class="empty compact-empty">No jobs on this day.</div>';
  $('#dayAddJobBtn').dataset.date = date;
  dayJobsDialog.showModal();
  $('#dayJobsList').querySelectorAll('.day-job-card').forEach(b => b.onclick = () => {
    const job = jobs.find(j => j.id === b.dataset.id);
    dayJobsDialog.close();
    openJob(job);
  });
}

$('#calendarPrevBtn').onclick = () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1, 12);
  renderCalendar();
};
$('#calendarNextBtn').onclick = () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1, 12);
  renderCalendar();
};
$('#calendarTodayBtn').onclick = () => {
  const d = new Date();
  calendarCursor = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  renderCalendar();
};
$('#closeDayJobsBtn').onclick = () => dayJobsDialog.close();
$('#dayAddJobBtn').onclick = e => {
  const date = e.currentTarget.dataset.date;
  dayJobsDialog.close();
  openJob(null, date);
};

$('#searchInput').oninput = render;
$('#statusFilter').onchange = render;
document.querySelectorAll('.stat').forEach(b => b.onclick = () => {
  document.querySelectorAll('.stat').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  quickFilter = b.dataset.filter;
  render();
});

function openJob(j = null, defaultDate = null) {
  $('#jobForm').reset();
  $('#jobId').value = j?.id || '';
  $('#jobDialogTitle').textContent = j ? 'Edit job' : 'New job';
  $('#deleteJobBtn').classList.toggle('hidden', !j);
  if (j) {
    $('#jobTitle').value = ['Battery','Solar','Battery + Solar'].includes(j.title) ? j.title : '';
    $('#customerName').value = j.customer_name || '';
    $('#customerPhone').value = j.customer_phone || '';
    $('#addressLine').value = j.address_line || '';
    $('#description').value = j.description || '';
    $('#status').value = j.status || 'new';
    $('#priority').value = j.priority || 'normal';
    $('#scheduledDate').value = j.scheduled_date || '';
    $('#scheduledStart').value = j.scheduled_start || '';
    $('#estimatedHours').value = j.estimated_minutes ? String(j.estimated_minutes / 60) : '';
  } else {
    $('#status').value = defaultDate ? 'scheduled' : 'new';
    $('#priority').value = 'normal';
    if (defaultDate) $('#scheduledDate').value = defaultDate;
  }
  dialog.showModal();
}

$('#newJobBtn').onclick = () => openJob();
$('#calendarNewJobBtn').onclick = () => openJob();
$('#closeJobBtn').onclick = () => dialog.close();
$('#mapsLookupBtn').onclick = () => {
  const a = $('#addressLine').value.trim();
  if (!a) {
    alert('Enter an address first.');
    return;
  }
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`, '_blank', 'noopener');
};

$('#jobForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('#jobId').value, hours = Number($('#estimatedHours').value) || 0, address = $('#addressLine').value.trim();
  const payload = {
    user_id: currentUser.id,
    title: $('#jobTitle').value,
    customer_name: $('#customerName').value.trim() || null,
    customer_phone: $('#customerPhone').value.trim() || null,
    address_line: address || null,
    suburb: suburbFromAddress(address) || null,
    postcode: null,
    description: $('#description').value.trim() || null,
    notes: null,
    status: $('#status').value,
    priority: $('#priority').value,
    scheduled_date: $('#scheduledDate').value || null,
    scheduled_start: $('#scheduledStart').value || null,
    estimated_minutes: hours ? Math.round(hours * 60) : null
  };
  payload.completed_at = payload.status === 'completed' ? new Date().toISOString() : null;
  const q = id ? supabaseClient.from('jobs').update(payload).eq('id', id) : supabaseClient.from('jobs').insert(payload);
  const {error} = await q;
  if (error) {
    alert(error.message);
    return;
  }
  dialog.close();
  await loadJobs();
});

$('#deleteJobBtn').onclick = async () => {
  const id = $('#jobId').value;
  if (!id || !confirm('Delete this job?')) return;
  const {error} = await supabaseClient.from('jobs').delete().eq('id', id);
  if (error) {
    alert(error.message);
    return;
  }
  dialog.close();
  await loadJobs();
};

init();
