/* ============================================
   MERIDIAN — Life Command Dashboard
   Client-side state + interactivity
   ============================================ */

// ---------------- Storage ----------------
// Persists to localStorage so your data survives across sessions and reboots.
// Use Export JSON to back up or move data to another device.

const STORE_KEY = 'meridian_v1';

const defaultState = () => ({
  intention: '',
  tasks: [],          // { id, title, track, priority, due, done, quad, createdAt }
  habits: [],         // { id, name, log: { 'YYYY-MM-DD': true } }
  reminders: [],      // { id, text, time }
  trades: [],         // expanded — see addTrade()
  journals: {},       // { 'YYYY-MM-DD': { wins, lessons, tomorrow } }
  equity: {           // portfolio balance series
    startDate: '2026-01-01',
    startBalance: 0,
    history: {},      // { 'YYYY-MM-DD': balance }
  },
  streak: { count: 0, lastActive: null },
  handbook: { lastIndex: null, check: {} },
  subs: { items: [], baseCurrency: 'USD' },
  lastSaved: null,
});

let S = defaultState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const loaded = JSON.parse(raw);
      S = { ...defaultState(), ...loaded };
      // Defensive merge for nested objects
      S.equity = { ...defaultState().equity, ...(loaded.equity || {}) };
      S.streak = { ...defaultState().streak, ...(loaded.streak || {}) };
      S.handbook = { ...defaultState().handbook, ...(loaded.handbook || {}) };
      S.subs = { ...defaultState().subs, ...(loaded.subs || {}) };
      if (!Array.isArray(S.subs.items)) S.subs.items = [];
    }
  } catch (e) { /* storage unavailable — fall back to in-memory */ }
}

let saveTimer;
function saveState() {
  S.lastSaved = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {}
    const el = document.getElementById('lastSaved');
    if (el) el.textContent = 'now';
  }, 200);
}

// ---------------- Utilities ----------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = (n) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const sameDate = (a, b) => dateKey(a) === dateKey(b);

// ---------------- Tracks config ----------------
const TRACKS = [
  { id: 'trading',    label: 'Trading prep',    icon: '₿',  blurb: 'Market research, watchlists, journaling' },
  { id: 'learning',   label: 'Online learning', icon: '◆',  blurb: 'ESG · tarot · cyber · certifications' },
  { id: 'health',     label: 'Health',          icon: '♡',  blurb: 'Movement, sleep, mindfulness' },
  { id: 'reading',    label: 'Reading',         icon: '❦',  blurb: 'Books, research, deep focus' },
  { id: 'linkedin',   label: 'LinkedIn',        icon: '◈',  blurb: 'Profile, content, visibility' },
  { id: 'networking', label: 'Networking',      icon: '✷',  blurb: 'Outreach, coffee chats, follow-ups' },
];
const trackMeta = (id) => TRACKS.find(t => t.id === id) || TRACKS[0];

// ---------------- Daily Schedule ----------------
/* Peak windows (HKT): 7-11 AM + 9 PM-12 AM.
   HK market: 09:30-12:00, 13:00-16:00. US market: 21:30-04:00 HKT. */
const SCHEDULE = [
  { start: 0,    end: 6,    label: 'Sleep · restore',         type: 'rest',   desc: 'Non-negotiable recovery block.' },
  { start: 6,    end: 7,    label: 'Wake · mindful start',    type: 'rest',   desc: 'Hydration, light, no phone.' },
  { start: 7,    end: 9.5,  label: 'Deep work · Learning',    type: 'peak',   desc: 'Algorithm dev, ESG coursework, reading.' },
  { start: 9.5,  end: 12,   label: 'HK open · execution',     type: 'market', desc: 'Watchlist scan, disciplined entries.' },
  { start: 12,   end: 13,   label: 'Lunch · reset',           type: 'rest',   desc: 'Walk, no screens. Eat slow.' },
  { start: 13,   end: 16,   label: 'HK afternoon session',    type: 'market', desc: 'Manage positions, review setups.' },
  { start: 16,   end: 18,   label: 'Networking · LinkedIn',   type: 'rest',   desc: 'Outreach, profile updates, follow-ups.' },
  { start: 18,   end: 21,   label: 'Family · health · dinner', type: 'rest',  desc: 'Protect this window. Present time.' },
  { start: 21,   end: 21.5, label: 'US pre-market prep',      type: 'peak',   desc: 'Catalyst review, gappers, bias set.' },
  { start: 21.5, end: 24,   label: 'US open · deep focus',    type: 'peak',   desc: 'Pattern work, setups, decisive execution.' },
];

// ---------------- Render helpers ----------------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'html' || k === 'innerHTML') el.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    }
    else if (k === 'data' && typeof attrs[k] === 'object') {
      for (const d in attrs[k]) el.dataset[d] = attrs[k][d];
    }
    else el.setAttribute(k, attrs[k]);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return el;
}

// ---------------- Clock + Markets ----------------
function tick() {
  const now = new Date();
  const hkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
  const h = hkTime.getHours();
  const m = hkTime.getMinutes();
  const s = hkTime.getSeconds();
  const dow = hkTime.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Hong_Kong' });
  $('#clock').textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  $('#clockMeta').textContent = `${dow} · Hong Kong`;

  // Hero greeting
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  $('#greetingPart').textContent = part;

  // Today date
  $('#todayDate').textContent = hkTime.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Hong_Kong'
  });
  $('#journalDate').textContent = todayKey();

  // Markets (HKT)
  const hm = h + m / 60;
  // HKEX: 09:30-12:00, 13:00-16:00; closed on Sat/Sun.
  const dow_num = hkTime.getDay();
  const hkOpen = (dow_num >= 1 && dow_num <= 5) && ((hm >= 9.5 && hm < 12) || (hm >= 13 && hm < 16));
  // NYSE: 09:30-16:00 ET = 21:30-04:00 HKT next day (approx, ignores DST edge cases)
  const usOpen = (hm >= 21.5 || hm < 4);
  const hkEl = $('#hkMkt'), usEl = $('#usMkt');
  hkEl.classList.toggle('mk-open', hkOpen);
  usEl.classList.toggle('mk-open', usOpen);
  hkEl.innerHTML = `<span class="dot"></span>HKEX · ${hkOpen ? 'OPEN' : 'closed'}`;
  usEl.innerHTML = `<span class="dot"></span>NYSE · ${usOpen ? 'OPEN' : 'closed'}`;

  // Active timeline block
  updateTimelineNow(hm);
  updateActiveBlock(hm);
}

// ---------------- Timeline ----------------
function renderTimeline() {
  const tl = $('#timeline');
  tl.innerHTML = '';
  // Hour labels
  const hours = h('div', { class: 'tl-hours' });
  for (let i = 0; i < 24; i++) {
    hours.appendChild(h('div', { class: 'tl-hour' }, i === 0 ? '' : pad(i)));
  }
  tl.appendChild(hours);

  // Blocks — minimal labels (only when segment wide enough). Hover for details.
  SCHEDULE.forEach((b) => {
    const left = (b.start / 24) * 100;
    const w = ((b.end - b.start) / 24) * 100;
    // Only show short typed label (PEAK / MARKET / REST) and only when there's room.
    const short = b.type === 'peak' ? 'PEAK' : b.type === 'market' ? 'MARKET' : 'REST';
    const block = h('div', {
      class: `tl-block ${b.type}`,
      style: `left:${left}%;width:${w}%;`,
      title: `${fmtHour(b.start)}–${fmtHour(b.end)} · ${b.label}`,
    }, w > 10 ? short : '');
    tl.appendChild(block);
  });

  // Now indicator
  const nowEl = h('div', { class: 'tl-now', id: 'tlNow' });
  tl.appendChild(nowEl);

  // Blocks list below
  const bl = $('#blocks');
  bl.innerHTML = '';
  SCHEDULE.forEach((b, i) => {
    const el = h('div', { class: 'block', data: { idx: i } },
      h('div', { class: 'block-time' }, `${fmtHour(b.start)}\u2009–\u2009${fmtHour(b.end)}`),
      h('div', { class: 'block-body' },
        h('div', { class: 'block-title' }, b.label),
        h('div', { class: 'block-desc' }, b.desc),
        h('span', { class: `block-tag ${b.type}` }, b.type === 'peak' ? 'Peak window' : b.type === 'market' ? 'Market' : 'Restore'),
      )
    );
    bl.appendChild(el);
  });
}

function fmtHour(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${pad(hh)}:${pad(mm)}`;
}

function updateTimelineNow(hm) {
  const el = $('#tlNow');
  if (el) el.style.left = `${(hm / 24) * 100}%`;
}

function updateActiveBlock(hm) {
  $$('.block').forEach((b, i) => {
    const s = SCHEDULE[i];
    b.classList.toggle('active', hm >= s.start && hm < s.end);
  });
}

// ---------------- Tasks ----------------
let taskFilter = 'all';

function renderTracks() {
  const container = $('#tracks');
  container.innerHTML = '';

  TRACKS.forEach(track => {
    const tasks = filterTasks(S.tasks.filter(t => t.track === track.id));
    const openCount = S.tasks.filter(t => t.track === track.id && !t.done).length;

    const section = h('div', { class: 'track', data: { track: track.id } },
      h('div', { class: 'track-head' },
        h('div', { class: 'track-name' },
          h('span', { class: 'track-icon' }, track.icon),
          track.label
        ),
        h('span', { class: 'track-count' }, `${openCount} open`)
      ),
      h('div', { class: 'track-tasks', data: { trackId: track.id } },
        tasks.length === 0
          ? h('div', { class: 'track-empty' }, 'No tasks yet — add one below.')
          : tasks.map(t => renderTaskCard(t))
      )
    );
    container.appendChild(section);
  });

  // Update hero focus counter
  const today = todayKey();
  const todays = S.tasks.filter(t => t.due === today);
  const openAll = S.tasks.filter(t => !t.done).length;
  const doneAll = S.tasks.filter(t => t.done).length;
  if (todays.length > 0) {
    $('#focusTotal').textContent = todays.length;
    $('#focusDone').textContent = todays.filter(t => t.done).length;
  } else {
    $('#focusTotal').textContent = S.tasks.length;
    $('#focusDone').textContent = doneAll;
  }

  // Week progress
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekTasks = S.tasks.filter(t => new Date(t.createdAt) >= weekAgo);
  const pct = weekTasks.length ? Math.round(weekTasks.filter(t => t.done).length / weekTasks.length * 100) : 0;
  $('#weekPct').textContent = pct;

  renderMatrix();
  renderKPIs();
}

function filterTasks(list) {
  if (taskFilter === 'today') return list.filter(t => t.due === todayKey());
  if (taskFilter === 'open') return list.filter(t => !t.done);
  if (taskFilter === 'done') return list.filter(t => t.done);
  return list.sort((a, b) => {
    if (a.done !== b.done) return a.done - b.done;
    return (a.priority || 3) - (b.priority || 3);
  });
}

function renderTaskCard(t) {
  const el = h('div', {
    class: `task ${t.done ? 'done' : ''}`,
    draggable: 'true',
    data: { id: t.id },
  },
    h('span', {
      class: 'task-check',
      onClick: (e) => { e.stopPropagation(); toggleTask(t.id); },
      html: t.done ? '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '',
    }),
    h('div', { class: 'task-main' },
      h('div', { class: 'task-title' }, t.title),
      h('div', { class: 'task-meta' },
        h('span', { class: `task-prio p${t.priority}` }, `P${t.priority}`),
        t.due ? h('span', {}, relDate(t.due)) : null,
      )
    ),
    h('button', { class: 'task-del', onClick: (e) => { e.stopPropagation(); deleteTask(t.id); } }, '✕')
  );

  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));

  return el;
}

function relDate(key) {
  const d = new Date(key + 'T00:00:00');
  const now = new Date();
  const diff = Math.round((d - new Date(now.toDateString())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff < 7) return `In ${diff}d`;
  if (diff < 0 && diff > -7) return `${-diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function addTask(data) {
  S.tasks.push({
    id: uid(),
    title: data.title,
    track: data.track,
    priority: +data.priority,
    due: data.due || null,
    done: false,
    quad: null,
    createdAt: Date.now(),
  });
  saveState();
  renderTracks();
}

function toggleTask(id) {
  const t = S.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) bumpStreak();
  saveState();
  renderTracks();
}

function deleteTask(id) {
  S.tasks = S.tasks.filter(t => t.id !== id);
  saveState();
  renderTracks();
}

function bumpStreak() {
  const today = todayKey();
  if (S.streak.lastActive === today) return;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  S.streak.count = S.streak.lastActive === dateKey(yesterday) ? S.streak.count + 1 : 1;
  S.streak.lastActive = today;
  $('#streakDays').textContent = S.streak.count;
}

// ---------------- Matrix ----------------
function renderMatrix() {
  ['q1','q2','q3','q4'].forEach(q => {
    const body = document.querySelector(`[data-drop="${q}"]`);
    body.innerHTML = '';
    const tasks = S.tasks.filter(t => t.quad === q && !t.done);
    tasks.forEach(t => body.appendChild(renderTaskCard(t)));
  });
}

function wireMatrix() {
  $$('.quad-body').forEach(body => {
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      body.parentElement.classList.add('drag-over');
    });
    body.addEventListener('dragleave', () => body.parentElement.classList.remove('drag-over'));
    body.addEventListener('drop', (e) => {
      e.preventDefault();
      body.parentElement.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const t = S.tasks.find(x => x.id === id);
      if (!t) return;
      t.quad = body.dataset.drop;
      saveState();
      renderTracks();
    });
  });

  $('#autoSort').addEventListener('click', () => {
    S.tasks.forEach(t => {
      if (t.done) return;
      // P1+due soon → Q1, P1-P2 → Q2, P3 → Q3, P4 → Q4
      const isSoon = t.due && new Date(t.due) - new Date() < 2 * 86400000;
      if (t.priority === 1 && isSoon) t.quad = 'q1';
      else if (t.priority <= 2) t.quad = 'q2';
      else if (t.priority === 3) t.quad = 'q3';
      else t.quad = 'q4';
    });
    saveState();
    renderTracks();
  });
}

// ---------------- Habits ----------------
let weekOffset = 0;

function getWeekDates(offset = 0) {
  const now = new Date();
  // Monday-start week
  const day = now.getDay(); // 0 Sun..6 Sat
  const monDiff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + monDiff + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function renderHabits() {
  const grid = $('#habitGrid');
  grid.innerHTML = '';
  const week = getWeekDates(weekOffset);
  const today = new Date(); today.setHours(0,0,0,0);

  $('#weekLabel').textContent =
    `${week[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${week[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  // Header row
  const header = h('div', { class: 'habit-header' },
    h('div', {}, 'Habit'),
    ...week.map(d => {
      const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
      return h('div', { innerHTML: `${wd}<br><span style="color:var(--text-faint);font-weight:400">${pad(d.getDate())}</span>` });
    }),
    h('div', {}, 'Σ')
  );
  grid.appendChild(header);

  if (S.habits.length === 0) {
    grid.appendChild(h('div', { class: 'track-empty', style: 'grid-column: 1 / -1;' },
      'No habits yet — try "Meditation", "Pre-market scan", "30m cardio"'));
    return;
  }

  S.habits.forEach(habit => {
    const row = h('div', { class: 'habit-row' });
    row.appendChild(h('div', { class: 'habit-label' },
      h('span', {}, habit.name),
      h('button', { class: 'hdel', onClick: () => deleteHabit(habit.id) }, '✕')
    ));
    let weekTotal = 0;
    week.forEach(d => {
      const key = dateKey(d);
      const done = !!habit.log[key];
      if (done) weekTotal++;
      const future = d > today;
      const cell = h('div', {
        class: `habit-cell ${done ? 'done' : ''} ${future ? 'future' : ''}`,
        onClick: () => toggleHabit(habit.id, key),
      }, done ? '✓' : '');
      row.appendChild(cell);
    });
    row.appendChild(h('div', { class: 'habit-total' }, `${weekTotal}/7`));
    grid.appendChild(row);
  });
}

function addHabit(name) {
  S.habits.push({ id: uid(), name, log: {} });
  saveState();
  renderHabits();
}

function toggleHabit(id, key) {
  const hb = S.habits.find(x => x.id === id);
  if (!hb) return;
  if (hb.log[key]) delete hb.log[key];
  else { hb.log[key] = true; bumpStreak(); }
  saveState();
  renderHabits();
}

function deleteHabit(id) {
  S.habits = S.habits.filter(h => h.id !== id);
  saveState();
  renderHabits();
}

// ---------------- Reminders ----------------
const defaultReminders = [
  { id: 'def1', text: 'Morning review · market scan', time: '07:00' },
  { id: 'def2', text: 'HK market open',               time: '09:30' },
  { id: 'def3', text: 'Midday reset · walk',          time: '12:00' },
  { id: 'def4', text: 'Afternoon position review',    time: '14:30' },
  { id: 'def5', text: 'LinkedIn · 1 outreach',        time: '17:00' },
  { id: 'def6', text: 'US pre-market prep',           time: '21:00' },
  { id: 'def7', text: 'Journal · tomorrow first move', time: '23:30' },
];

function renderReminders() {
  // Seed defaults on first run
  if (S.reminders.length === 0) S.reminders = [...defaultReminders];

  const ul = $('#reminders');
  ul.innerHTML = '';

  const now = new Date();
  const hkNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
  const nowMin = hkNow.getHours() * 60 + hkNow.getMinutes();

  S.reminders
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach(r => {
      const [hh, mm] = r.time.split(':').map(Number);
      const t = hh * 60 + mm;
      const delta = t - nowMin;
      const upcoming = delta >= 0 && delta <= 60;
      const past = delta < 0;

      const li = h('li', { class: `reminder ${upcoming ? 'upcoming' : ''} ${past ? 'past' : ''}` },
        h('span', { class: 'rem-time' }, r.time),
        h('span', { class: 'rem-text' }, r.text),
        upcoming ? h('span', { class: 'rem-badge' }, `in ${delta}m`) : null,
        h('button', { class: 'rem-del', onClick: () => deleteReminder(r.id) }, '✕')
      );
      ul.appendChild(li);
    });
}

function addReminder(text, time) {
  S.reminders.push({ id: uid(), text, time });
  saveState();
  renderReminders();
}

function deleteReminder(id) {
  S.reminders = S.reminders.filter(r => r.id !== id);
  saveState();
  renderReminders();
}

// Notification scheduling
const firedReminders = new Set();
function checkReminderFiring() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const hk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
  const key = `${dateKey(hk)}_${pad(hk.getHours())}:${pad(hk.getMinutes())}`;
  S.reminders.forEach(r => {
    const [hh, mm] = r.time.split(':').map(Number);
    if (hk.getHours() === hh && hk.getMinutes() === mm) {
      const fireKey = `${dateKey(hk)}_${r.id}`;
      if (!firedReminders.has(fireKey)) {
        firedReminders.add(fireKey);
        try { new Notification('Meridian · reminder', { body: r.text, silent: false }); } catch (e) {}
      }
    }
  });
}

// ---------------- Journal ----------------
function renderJournal() {
  const key = todayKey();
  const entry = S.journals[key] || {};
  $$('[data-j]').forEach(el => { el.value = entry[el.dataset.j] || ''; });
}

function wireJournal() {
  $$('[data-j]').forEach(el => {
    el.addEventListener('input', () => {
      const key = todayKey();
      if (!S.journals[key]) S.journals[key] = {};
      S.journals[key][el.dataset.j] = el.value;
      saveState();
    });
  });
}

// ---------------- Trades (Stonk Journal-inspired) ----------------
let tradeFilter = 'all';
let tradeSearch = '';
let expandedTradeId = null;

/* Compute derived metrics for a trade */
function tradeMetrics(t) {
  const sideMul = t.side === 'short' ? -1 : 1;
  const qty = +t.qty || 0;
  const entry = +t.entry || 0;
  const exit = t.exit !== '' && t.exit != null ? +t.exit : null;
  const stop = t.stop !== '' && t.stop != null ? +t.stop : null;
  const target = t.target !== '' && t.target != null ? +t.target : null;
  const fees = +t.fees || 0;

  const open = exit === null;
  let pnl = null, R = null, plannedRR = null;
  if (!open && entry && qty) {
    pnl = (exit - entry) * qty * sideMul - fees;
  }
  if (stop && entry && entry !== stop) {
    const risk = Math.abs(entry - stop);
    if (!open) R = ((exit - entry) * sideMul) / risk;
    if (target) plannedRR = Math.abs(target - entry) / risk;
  }
  return { open, pnl, R, plannedRR };
}

function matchesTradeSearch(t) {
  if (!tradeSearch) return true;
  const q = tradeSearch.toLowerCase();
  const tags = (t.tags || []).join(' ').toLowerCase();
  return (t.symbol || '').toLowerCase().includes(q)
      || (t.note || '').toLowerCase().includes(q)
      || (t.setup || '').toLowerCase().includes(q)
      || tags.includes(q);
}

function renderTrades() {
  const root = $('#tradesTable');
  root.innerHTML = '';

  // Sort: most recent first (closeDate, then openDate, then createdAt)
  const trades = S.trades.slice().sort((a, b) => {
    const ad = a.closeDate || a.openDate || 0;
    const bd = b.closeDate || b.openDate || 0;
    if (ad === bd) return (b.createdAt || 0) - (a.createdAt || 0);
    return ad < bd ? 1 : -1;
  });

  // Filter
  const filtered = trades.filter(t => {
    if (!matchesTradeSearch(t)) return false;
    const m = tradeMetrics(t);
    if (tradeFilter === 'open') return m.open;
    if (tradeFilter === 'win')  return !m.open && m.pnl > 0;
    if (tradeFilter === 'loss') return !m.open && m.pnl < 0;
    return true;
  });

  if (filtered.length === 0) {
    root.appendChild(h('div', { class: 'trades-empty' },
      S.trades.length === 0
        ? 'No trades yet. Log your first one above to start building your edge.'
        : 'No trades match this filter.'
    ));
  } else {
    // Header (11-column grid in CSS)
    root.appendChild(h('div', { class: 'trades-table-head' },
      h('span', {}, 'Date'),
      h('span', {}, 'Symbol'),
      h('span', {}, 'Side'),
      h('span', {}, 'Qty'),
      h('span', {}, 'Entry'),
      h('span', {}, 'Exit'),
      h('span', {}, 'Net P/L'),
      h('span', {}, 'R'),
      h('span', {}, 'Setup'),
      h('span', {}, 'Mood'),
      h('span', {}, '')
    ));

    filtered.forEach(t => {
      const m = tradeMetrics(t);
      const dateStr = t.closeDate || t.openDate || (t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : '—');
      const pnlClass = m.open ? 'open' : (m.pnl >= 0 ? 'pos' : 'neg');
      const pnlText = m.open ? 'open' : (m.pnl >= 0 ? '+' : '−') + '$' + Math.abs(m.pnl).toFixed(2);
      const rText = m.open || m.R == null ? '—' : (m.R >= 0 ? '+' : '') + m.R.toFixed(2) + 'R';

      const row = h('div', {
        class: `trade-row ${expandedTradeId === t.id ? 'expanded' : ''}`,
        data: { tradeId: t.id },
        onClick: () => {
          expandedTradeId = expandedTradeId === t.id ? null : t.id;
          renderTrades();
        }
      },
        h('span', { class: 'tr-date' }, dateStr.slice(5)),
        h('span', { class: 'tr-sym' }, (t.symbol || '—').toUpperCase()),
        h('span', { class: `tr-side ${t.side}` }, t.side || '—'),
        h('span', { class: 'tr-num' }, t.qty != null ? String(t.qty) : '—'),
        h('span', { class: 'tr-num' }, t.entry != null ? Number(t.entry).toFixed(2) : '—'),
        h('span', { class: 'tr-num' }, t.exit != null && t.exit !== '' ? Number(t.exit).toFixed(2) : '·'),
        h('span', { class: `tr-pnl ${pnlClass}` }, pnlText),
        h('span', { class: `tr-r ${m.R >= 0 ? 'pos' : 'neg'}` }, rText),
        h('span', { class: 'tr-num' }, t.setup || '—'),
        h('span', {}, t.mood ? h('span', { class: `tr-mood ${t.mood}` }, t.mood) : '—'),
        h('button', {
          class: 'tr-del',
          onClick: (e) => { e.stopPropagation(); deleteTrade(t.id); }
        }, '✕')
      );
      root.appendChild(row);

      // Expanded detail (uses .trade-detail with .td-item children)
      if (expandedTradeId === t.id) {
        const tags = (t.tags || []).filter(Boolean);
        const conf = t.confidence || 0;
        const item = (k, v) => h('div', { class: 'td-item' }, h('label', {}, k), h('span', {}, v));
        const detail = h('div', { class: 'trade-detail' },
          item('Market', t.market || '—'),
          item('Entry', t.entry != null ? '$' + Number(t.entry).toFixed(2) : '—'),
          item('Exit', t.exit != null && t.exit !== '' ? '$' + Number(t.exit).toFixed(2) : 'open'),
          item('Stop', t.stop != null && t.stop !== '' ? '$' + Number(t.stop).toFixed(2) : '—'),
          item('Target', t.target != null && t.target !== '' ? '$' + Number(t.target).toFixed(2) : '—'),
          item('Fees', '$' + (Number(t.fees) || 0).toFixed(2)),
          item('Opened', t.openDate || '—'),
          item('Closed', t.closeDate || '—'),
          item('Planned R/R', m.plannedRR != null ? m.plannedRR.toFixed(2) : '—'),
          h('div', { class: 'td-item' },
            h('label', {}, 'Confidence'),
            h('span', { class: 'tr-conf' },
              ...Array.from({ length: 5 }, (_, i) => h('span', { class: `dot ${i < conf ? 'on' : ''}` }))
            )
          ),
          h('div', { class: 'td-item' },
            h('label', {}, 'Tags'),
            h('span', {},
              tags.length
                ? tags.map(tag => h('span', { class: 'tr-tag' }, tag))
                : '—'
            )
          ),
          h('div', { class: 'td-item', style: 'grid-column: 1 / -1;' },
            h('label', {}, 'Notes / thesis'),
            h('span', { style: 'white-space: pre-wrap; font-family: var(--font-body);' }, t.note || '—')
          )
        );
        root.appendChild(detail);
      }
    });
  }

  renderTradeStats();
}

function renderTradeStats() {
  const closed = S.trades.map(t => ({ t, m: tradeMetrics(t) })).filter(x => !x.m.open && x.m.pnl != null);
  const wins = closed.filter(x => x.m.pnl > 0);
  const losses = closed.filter(x => x.m.pnl < 0);
  const total = closed.length;
  const totalPnl = closed.reduce((s, x) => s + x.m.pnl, 0);
  const grossWin = wins.reduce((s, x) => s + x.m.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, x) => s + x.m.pnl, 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const winRate = total ? wins.length / total : 0;
  const lossRate = total ? losses.length / total : 0;
  const expectancy = total ? (winRate * avgWin) - (lossRate * avgLoss) : 0;
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const rTrades = closed.filter(x => x.m.R != null);
  const avgR = rTrades.length ? rTrades.reduce((s, x) => s + x.m.R, 0) / rTrades.length : null;

  $('#tsWL').textContent = `${wins.length}/${losses.length}`;
  $('#tsHit').textContent = total ? `${Math.round(winRate * 100)}%` : '—';
  const pnlEl = $('#tsPnl');
  pnlEl.textContent = total ? (totalPnl >= 0 ? '+$' : '−$') + Math.abs(totalPnl).toFixed(2) : '—';
  pnlEl.style.color = totalPnl >= 0 ? 'var(--success)' : 'var(--danger)';

  const avgREl = $('#tsAvgR'); if (avgREl) avgREl.textContent = avgR == null ? '—' : (avgR >= 0 ? '+' : '') + avgR.toFixed(2) + 'R';
  const pfEl = $('#tsPF'); if (pfEl) pfEl.textContent = !total ? '—' : (pf === Infinity ? '∞' : pf.toFixed(2));
  const expEl = $('#tsExp'); if (expEl) expEl.textContent = !total ? '—' : (expectancy >= 0 ? '+$' : '−$') + Math.abs(expectancy).toFixed(2);
}

function addTrade(data) {
  // Capture and normalize fields
  const trade = {
    id: uid(),
    market: data.market || 'stock',
    symbol: (data.symbol || '').trim().toUpperCase(),
    side: data.side || 'long',
    qty: data.qty !== '' && data.qty != null ? +data.qty : null,
    entry: data.entry !== '' && data.entry != null ? +data.entry : null,
    exit: data.exit !== '' && data.exit != null ? +data.exit : null,
    stop: data.stop !== '' && data.stop != null ? +data.stop : null,
    target: data.target !== '' && data.target != null ? +data.target : null,
    fees: data.fees !== '' && data.fees != null ? +data.fees : 0,
    openDate: data.openDate || todayKey(),
    closeDate: data.closeDate || (data.exit !== '' && data.exit != null ? todayKey() : null),
    setup: data.setup || '',
    mood: data.mood || '',
    confidence: data.confidence ? +data.confidence : 3,
    tags: (data.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    note: (data.note || '').trim(),
    createdAt: Date.now(),
  };
  S.trades.push(trade);
  saveState();
  renderTrades();
}

function deleteTrade(id) {
  S.trades = S.trades.filter(t => t.id !== id);
  if (expandedTradeId === id) expandedTradeId = null;
  saveState();
  renderTrades();
}

function updateTradePreview() {
  const entry = parseFloat($('#trEntry').value);
  const exit = parseFloat($('#trExit').value);
  const stop = parseFloat($('#trStop').value);
  const target = parseFloat($('#trTarget').value);
  const qty = parseFloat($('#trQty').value);
  const fees = parseFloat($('#trFees').value) || 0;
  const sideMul = $('#trSide').value === 'short' ? -1 : 1;

  let netStr = '—', rStr = '—', rrStr = '—';
  if (!isNaN(entry) && !isNaN(exit) && !isNaN(qty)) {
    const pnl = (exit - entry) * qty * sideMul - fees;
    netStr = (pnl >= 0 ? '+$' : '−$') + Math.abs(pnl).toFixed(2);
  }
  if (!isNaN(entry) && !isNaN(stop) && entry !== stop) {
    const risk = Math.abs(entry - stop);
    if (!isNaN(exit)) {
      const R = ((exit - entry) * sideMul) / risk;
      rStr = (R >= 0 ? '+' : '') + R.toFixed(2) + 'R';
    }
    if (!isNaN(target)) {
      rrStr = (Math.abs(target - entry) / risk).toFixed(2);
    }
  }
  $('#trPreview').textContent = `Net P/L ${netStr} · R ${rStr} · R/R ${rrStr}`;
}

// ---------------- Equity Curve ----------------
let eqRange = 'all';

function equitySeries() {
  // Build sorted [{date, balance}] from start + history
  const arr = [];
  if (S.equity.startBalance > 0 || Object.keys(S.equity.history).length > 0) {
    arr.push({ date: S.equity.startDate, balance: S.equity.startBalance });
  }
  Object.keys(S.equity.history).forEach(d => {
    if (d !== S.equity.startDate) {
      arr.push({ date: d, balance: S.equity.history[d] });
    } else {
      // Replace start point with logged value if user logged a closing balance for the same day
      arr[0] = { date: d, balance: S.equity.history[d] };
    }
  });
  return arr.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

function filterEquityRange(series) {
  if (eqRange === 'all' || series.length === 0) return series;
  const last = new Date(series[series.length - 1].date + 'T00:00:00');
  let cutoff;
  if (eqRange === 'ytd') {
    cutoff = new Date(last.getFullYear(), 0, 1);
  } else if (eqRange === '3m') {
    cutoff = new Date(last); cutoff.setMonth(cutoff.getMonth() - 3);
  } else if (eqRange === '1m') {
    cutoff = new Date(last); cutoff.setMonth(cutoff.getMonth() - 1);
  } else {
    return series;
  }
  const cutoffKey = dateKey(cutoff);
  return series.filter(p => p.date >= cutoffKey);
}

function renderEquity() {
  const series = equitySeries();
  const filtered = filterEquityRange(series);

  // Stats use full series (start & current always reflect overall)
  const start = series.length ? series[0].balance : S.equity.startBalance;
  const current = series.length ? series[series.length - 1].balance : S.equity.startBalance;
  const ret = start > 0 ? ((current - start) / start) * 100 : 0;

  // Max drawdown across full series
  let peak = -Infinity, maxDD = 0;
  series.forEach(p => {
    if (p.balance > peak) peak = p.balance;
    if (peak > 0) {
      const dd = ((peak - p.balance) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
  });

  $('#eqStart').textContent = start > 0 ? '$' + start.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  $('#eqCurrent').textContent = series.length ? '$' + current.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  const retEl = $('#eqReturn');
  retEl.textContent = series.length > 1 ? (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%' : '—';
  retEl.style.color = ret >= 0 ? 'var(--success)' : 'var(--danger)';
  $('#eqDD').textContent = series.length > 1 ? '−' + maxDD.toFixed(2) + '%' : '—';

  // Sync inputs with state
  const sd = $('#eqStartDate'); if (sd && document.activeElement !== sd) sd.value = S.equity.startDate;
  const sa = $('#eqStartAmt'); if (sa && document.activeElement !== sa && S.equity.startBalance) sa.value = S.equity.startBalance;

  renderEquityTable(series);
  drawEquityChart(filtered);
}

function renderEquityTable(series) {
  const root = $('#eqTable');
  if (!root) return;
  $('#eqCount').textContent = Object.keys(S.equity.history).length;
  root.innerHTML = '';
  if (series.length === 0) {
    root.appendChild(h('div', { class: 'eq-empty' }, 'No balance entries yet. Set a starting balance, then log your daily closing balance to build your equity curve.'));
    return;
  }
  const reverse = series.slice().reverse();
  reverse.forEach((p, idx) => {
    const prev = reverse[idx + 1];
    const delta = prev ? p.balance - prev.balance : null;
    const isStart = p.date === S.equity.startDate && idx === reverse.length - 1;
    root.appendChild(h('div', { class: `eq-row ${isStart ? 'start' : ''}` },
      h('span', { class: 'eq-date' }, p.date),
      h('span', { class: 'eq-bal' }, '$' + p.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })),
      h('span', { class: `eq-change ${delta == null ? '' : delta >= 0 ? 'pos' : 'neg'}` },
        delta == null ? (isStart ? 'start' : '—') : (delta >= 0 ? '+$' : '−$') + Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 2 })
      ),
      h('button', {
        class: 'eq-del',
        title: 'Remove this entry',
        onClick: (e) => {
          e.stopPropagation();
          if (p.date === S.equity.startDate && S.equity.history[p.date] === undefined) return;
          delete S.equity.history[p.date];
          saveState();
          renderEquity();
        }
      }, '✕')
    ));
  });
}

function drawEquityChart(series) {
  const canvas = $('#equityCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600;
  const H = 260;
  canvas.width = w * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, H);

  const cs = getComputedStyle(document.documentElement);
  const get = (n) => cs.getPropertyValue(n).trim();
  const colorPrimary = get('--primary') || '#b78428';
  const colorMuted = get('--text-muted') || '#888';
  const colorBorder = get('--border') || '#ccc';
  const colorDanger = get('--danger') || '#a23b2c';
  const colorAccent = get('--accent') || '#0c6b72';

  if (series.length === 0) {
    ctx.fillStyle = colorMuted;
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Set a start balance to begin tracking your equity curve', w / 2, H / 2);
    return;
  }

  const padL = 56, padR = 16, padT = 16, padB = 32;
  const chartW = w - padL - padR;
  const chartH = H - padT - padB;

  const balances = series.map(p => p.balance);
  let minB = Math.min(...balances);
  let maxB = Math.max(...balances);
  const span = maxB - minB || Math.max(1, maxB * 0.1);
  minB -= span * 0.05; maxB += span * 0.05;

  const x = i => padL + (series.length === 1 ? chartW / 2 : (i / (series.length - 1)) * chartW);
  const y = b => padT + (1 - (b - minB) / (maxB - minB)) * chartH;

  // Y gridlines (4)
  ctx.strokeStyle = colorBorder;
  ctx.fillStyle = colorMuted;
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = minB + (maxB - minB) * (i / 4);
    const yy = y(v);
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText('$' + Math.round(v).toLocaleString(), padL - 6, yy + 3);
  }

  // Drawdown shading
  if ($('#eqShowDD') && $('#eqShowDD').checked && series.length > 1) {
    let peak = -Infinity;
    ctx.fillStyle = colorDanger;
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    let started = false;
    series.forEach((p, i) => {
      if (p.balance > peak) peak = p.balance;
      if (peak > p.balance) {
        const xi = x(i);
        if (!started) { ctx.moveTo(xi, y(peak)); started = true; }
        ctx.lineTo(xi, y(peak));
      }
    });
    // back along current line
    for (let i = series.length - 1; i >= 0; i--) {
      ctx.lineTo(x(i), y(series[i].balance));
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Filled gradient under main line
  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, colorPrimary + '55');
  grad.addColorStop(1, colorPrimary + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x(0), padT + chartH);
  series.forEach((p, i) => ctx.lineTo(x(i), y(p.balance)));
  ctx.lineTo(x(series.length - 1), padT + chartH);
  ctx.closePath();
  ctx.fill();

  // Main line
  ctx.strokeStyle = colorPrimary;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  series.forEach((p, i) => i === 0 ? ctx.moveTo(x(i), y(p.balance)) : ctx.lineTo(x(i), y(p.balance)));
  ctx.stroke();

  // Points
  ctx.fillStyle = colorPrimary;
  series.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(p.balance), 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // 10-day SMA
  if ($('#eqShowMA') && $('#eqShowMA').checked && series.length >= 3) {
    const window = Math.min(10, Math.max(2, Math.floor(series.length / 2)));
    ctx.strokeStyle = colorAccent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    let drew = false;
    for (let i = window - 1; i < series.length; i++) {
      let sum = 0;
      for (let j = i - window + 1; j <= i; j++) sum += series[j].balance;
      const ma = sum / window;
      if (!drew) { ctx.moveTo(x(i), y(ma)); drew = true; }
      else ctx.lineTo(x(i), y(ma));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // X axis date labels (start, mid, end)
  ctx.fillStyle = colorMuted;
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  const labelIdxs = series.length <= 2 ? [0, series.length - 1] : [0, Math.floor(series.length / 2), series.length - 1];
  [...new Set(labelIdxs)].forEach(i => {
    ctx.fillText(series[i].date.slice(5), x(i), padT + chartH + 18);
  });
}

function setEquityStart(date, amount) {
  if (date) S.equity.startDate = date;
  if (amount != null && !isNaN(amount)) S.equity.startBalance = +amount;
  saveState();
  renderEquity();
}

function logBalance(date, amount) {
  if (!date || isNaN(amount)) return;
  S.equity.history[date] = +amount;
  saveState();
  renderEquity();
}

// ---------------- KPI + Chart ----------------
let kpiRange = 'week';

function renderKPIs() {
  const grid = $('#kpiGrid');
  grid.innerHTML = '';

  const now = Date.now();
  const cutoff = kpiRange === 'week' ? now - 7*864e5 : kpiRange === 'month' ? now - 30*864e5 : 0;
  const tasks = S.tasks.filter(t => t.createdAt >= cutoff);

  const byTrack = {};
  TRACKS.forEach(t => { byTrack[t.id] = { total: 0, done: 0 }; });
  tasks.forEach(t => {
    if (!byTrack[t.track]) return;
    byTrack[t.track].total++;
    if (t.done) byTrack[t.track].done++;
  });

  const maxTotal = Math.max(1, ...Object.values(byTrack).map(v => v.total));

  TRACKS.forEach(track => {
    const d = byTrack[track.id];
    const pct = d.total ? Math.round(d.done / d.total * 100) : 0;
    const kpi = h('div', { class: 'kpi' },
      h('div', { class: 'kpi-label' }, track.label),
      h('div', { class: 'kpi-value' }, `${d.done}`, h('span', { class: 'unit' }, `/ ${d.total}`)),
      h('div', { class: 'kpi-bar' }, h('span', { style: `width: ${pct}%` }))
    );
    grid.appendChild(kpi);
  });

  drawDistributionChart(byTrack);
}

function drawDistributionChart(data) {
  const canvas = $('#distCanvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = 180;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const totals = TRACKS.map(t => data[t.id].total);
  const max = Math.max(1, ...totals);
  const colors = getTrackColors();

  const gap = 10;
  const barW = (w - gap * (TRACKS.length + 1)) / TRACKS.length;
  const topPad = 20;
  const chartH = h - 50;

  TRACKS.forEach((track, i) => {
    const total = data[track.id].total;
    const done = data[track.id].done;
    const x = gap + i * (barW + gap);
    const barH = chartH * (total / max);
    const doneH = chartH * (done / max);
    const y = h - 30 - barH;

    // Bg bar
    ctx.fillStyle = colors.soft;
    roundRect(ctx, x, y, barW, barH, 4); ctx.fill();

    // Done bar (overlay)
    if (done > 0) {
      ctx.fillStyle = colors[track.id] || colors.primary;
      roundRect(ctx, x, h - 30 - doneH, barW, doneH, 4); ctx.fill();
    }

    // Label
    ctx.fillStyle = colors.text;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(track.label.split(' ')[0], x + barW / 2, h - 14);

    // Value
    ctx.fillStyle = colors.muted;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(`${done}/${total}`, x + barW / 2, h - 2);
  });

  // Y axis label
  ctx.fillStyle = colors.muted;
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Task distribution — ${kpiRange}`, gap, 14);
}

function roundRect(ctx, x, y, w, h, r) {
  if (h <= 0 || w <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function getTrackColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n) => cs.getPropertyValue(n).trim();
  return {
    trading: get('--primary'),
    learning: get('--accent'),
    health: get('--success'),
    reading: get('--warn'),
    linkedin: get('--info'),
    networking: get('--danger'),
    soft: get('--surface-offset'),
    primary: get('--primary'),
    text: get('--text'),
    muted: get('--text-muted'),
  };
}

// ---------------- Theme toggle ----------------
function initTheme() {
  const saved = 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = $('[data-theme-toggle]');
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    btn.innerHTML = next === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
    // Redraw charts with theme colors
    renderKPIs();
    renderEquity();
  });
}

// ---------------- Trader's Handbook ----------------
// Curated principles distilled from JLaw Trader's Handbook (10 chapters).
// Each entry: { zh: original Chinese, en: English summary, cat: category tag }.
const HANDBOOK = [
  // --- 1. Market Cycles ---
  { cat: 'Market Cycles', zh: '交易系統的效能，取決於「交易引擎」與當前市場階段的對齊。',
    en: 'Edge depends on alignment between your trading engine and the current market regime.' },
  { cat: 'Market Cycles', zh: '200MA 斜率向上 · 股價在線之上 · 進入高勝率模式，專注做多強勢股。',
    en: '200MA sloping up with price above it = high-win regime. Focus only on the strongest names.' },
  { cat: 'Market Cycles', zh: '橫盤拉鋸期最易出現假突破 —— 減少頻率，收緊停損。',
    en: 'Sideways markets manufacture false breakouts. Trade less, tighten stops.' },
  { cat: 'Market Cycles', zh: '宏觀變量可以重啟通脹預期 —— 該縮曝險時就該縮。',
    en: 'When macro shifts the rate path, lower exposure. Survival first, conviction second.' },

  // --- 2. Stock Selection ---
  { cat: 'Selection', zh: '只買跑贏大盤的 H 股 —— 大盤回調時橫盤，企穩時率先突破。',
    en: 'Buy only High Relative Strength. They consolidate while the market drops, then lead the breakout.' },
  { cat: 'Selection', zh: '大型股：市值 > $10B · 日均成交 > $50M · 股價 > $15。',
    en: 'Liquidity floor: $10B cap, $50M ADV, $15 price. Below that = junk volatility.' },
  { cat: 'Selection', zh: '嚴禁交易 ETF、ETN、ADR 與低價股 —— 過濾雜訊是勝率的前提。',
    en: 'Filter out ETFs, ETNs, ADRs and sub-$15 names. Clean inputs make a clean edge.' },
  { cat: 'Selection', zh: 'IPO 上市 4–6 個月後的底部結構最穩固，超過 9 個月變老。',
    en: 'Best IPO bases form 4–6 months after listing. After 9 months the setup is stale.' },

  // --- 3. Setups ---
  { cat: 'Setups', zh: 'VCP：波幅縮減超過 50%，成交枯竭 —— 浮籌已洗淨，是動能發動前的壓縮彈簧。',
    en: 'VCP: range contracts >50% with dry volume. The float is washed; the spring is loaded.' },
  { cat: 'Setups', zh: '平行通道 2+1 繪圖法 —— 二點定主線，一點平行對照。',
    en: 'Parallel channel: two pivots define the trendline, one pivot draws the parallel. Anchor on close, not wicks.' },
  { cat: 'Setups', zh: 'Bible Gap：跳空漲幅 > 15% · 市值 > $10B —— 代表基本面有實質新敘事。',
    en: 'Bible Gap: >15% gap on a $10B+ name. A real fundamental story, not a low-volume squeeze.' },
  { cat: 'Setups', zh: 'Overshoot 超越通道 —— 往往是動能衰竭的反轉信號。',
    en: 'Overshoot beyond the channel often signals exhaustion, not strength.' },

  // --- 4. Entry ---
  { cat: 'Entry', zh: 'M.E.T.A. 進場：多個技術信號在同一時空重疊的區域。',
    en: 'M.E.T.A. = Multiple Edge Trading Area. Multiple signals stacking at the same price and time.' },
  { cat: 'Entry', zh: '開盤區間策略：5/15m 首根 K 線守住盤前低 · 回踩不破開盤 —— 即高品質進場點。',
    en: 'Opening range: hold the pre-market low on the 5/15m bar, retest without breaking the open.' },
  { cat: 'Entry', zh: '錯過 M.E.T.A. 進場點絕不追高 —— 等回踩 28MA。',
    en: 'Miss the M.E.T.A. trigger? Don’t chase. Wait for the 28MA pullback.' },
  { cat: 'Entry', zh: '所有進場必須有量價配合的證據。',
    en: 'Every entry needs price-volume confirmation. No volume, no edge.' },

  // --- 5. Risk ---
  { cat: 'Risk', zh: '單筆虧損嚴格限制在 8%–10% 以內 —— 這是交易引擎的煞車系統。',
    en: 'Cap any single trade loss at 8–10%. Risk control is the brake system of the engine.' },
  { cat: 'Risk', zh: '邏輯停損：跌破關鍵支撐（28MA 或 VCP 底部）即刻離場。看好的理由消失，不應有任何幻想。',
    en: 'Logical stop: thesis breaks, you exit. No hopes, no narratives, no second chances.' },
  { cat: 'Risk', zh: '損失調整練習：勝率下降時，強制將頭寸縮減至 1/2 或 1/3。',
    en: 'Loss-adjusted exercise: when the win rate drops, halve or third your size until the form returns.' },
  { cat: 'Risk', zh: '財務停損規則不因宏觀敘事變動。',
    en: 'Don’t move your stop because the macro story changed. Discipline is the only thesis.' },

  // --- 6. Selling ---
  { cat: 'Selling', zh: '買入是藝術，賣出是科學。利用分批套現鎖定勝果。',
    en: 'Buying is art. Selling is science. Scale out to lock in the win.' },
  { cat: 'Selling', zh: '放風箏：達目標盈虧比時賣出 50–75%，剩餘仓位以 28/50MA 作移動停損。',
    en: 'Kite flying: take 50–75% at the first R-target, trail the rest along the 28 or 50MA.' },
  { cat: 'Selling', zh: '股價收盤跌破 28MA · 拋物線頂部出現消耗性缺口 —— 防禦性賣出。',
    en: 'Defensive sell: close below 28MA, or a parabolic exhaustion gap. Don’t debate — exit.' },

  // --- 7. Position ---
  { cat: 'Position', zh: '單一個股仓位不超過組合的 15%。資金該流向相對強度最高的板塊。',
    en: 'Cap any name at 15% of the book. Capital flows to the strongest sectors.' },
  { cat: 'Position', zh: '總體未平倉風險：所有持仓同時觸發停損時，對總資產的影響限於 1–2%。',
    en: 'Total open risk: if every stop hit at once, the account loses no more than 1–2%.' },

  // --- 8. Rules ---
  { cat: 'Rules', zh: '絕不逆 200MA 斜率做多。',
    en: 'Never long against the 200MA slope. Period.' },
  { cat: 'Rules', zh: '始終保持相對強度思維 —— 只留最強的股票。',
    en: 'Pursue relative strength. Cull the weak. Hold only the strongest.' },

  // --- 9. Mindset ---
  { cat: 'Mindset', zh: '心理韌性源於對系統概率的終極信任。',
    en: 'Mental resilience comes from absolute trust in the system’s probabilities, not any single outcome.' },
  { cat: 'Mindset', zh: '正確的決策是「符合系統規則的決策」，而非單純盈利的決策。',
    en: 'A correct decision follows the rules — not necessarily one that made money. Process > outcome.' },
  { cat: 'Mindset', zh: '圖表上的量價是唯一真相 —— 專家預測只是噪音。',
    en: 'Price-volume on the chart is the only truth. Pundit forecasts are noise.' },
  { cat: 'Mindset', zh: '復仇交易禁令：連續虧損時強制進入冷靜期。',
    en: 'No revenge trading. After consecutive losses, force yourself into a cooling-off window.' },

  // --- 10. Routine ---
  { cat: 'Routine', zh: '穩定業績源於精確的重複。',
    en: 'Steady performance comes from precise repetition. The boring days build the engine.' },
  { cat: 'Routine', zh: 'Model Book：記錄所有符合 M.E.T.A. 且獲利的經典案例 —— 建立你的識別記憶庫。',
    en: 'Build a Model Book of every M.E.T.A. winner. Pattern recognition compounds with reps.' },
  { cat: 'Routine', zh: '系統與交易員合一之日，即是超績誕生之時。',
    en: 'When the system and the trader become one — that is the day super-performance is born.' },
];

// Persist current handbook index across sessions
let handbookIndex = 0;

function handbookDayIndex() {
  // Day-of-year so the principle changes daily by default
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = (d - start) + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000;
  const day = Math.floor(diff / 86400000);
  return day % HANDBOOK.length;
}

function renderHandbook() {
  const item = HANDBOOK[handbookIndex] || HANDBOOK[0];
  const zh = $('#hbZh'), en = $('#hbEn'), cat = $('#hbCategory'), cnt = $('#hbCounter');
  if (!zh) return;
  zh.textContent = item.zh;
  en.textContent = item.en;
  cat.textContent = item.cat;
  cnt.textContent = `${handbookIndex + 1} / ${HANDBOOK.length}`;
  // subtle fade for transitions
  [zh, en].forEach(el => {
    el.style.transition = 'none';
    el.style.opacity = '0';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.35s ease';
      el.style.opacity = '1';
    });
  });
}

function wireHandbook() {
  const initial = (S.handbook && Number.isInteger(S.handbook.lastIndex))
    ? S.handbook.lastIndex
    : handbookDayIndex();
  handbookIndex = ((initial % HANDBOOK.length) + HANDBOOK.length) % HANDBOOK.length;
  renderHandbook();

  const persist = () => {
    if (!S.handbook) S.handbook = {};
    S.handbook.lastIndex = handbookIndex;
    saveState();
  };
  $('#hbPrev')?.addEventListener('click', () => {
    handbookIndex = (handbookIndex - 1 + HANDBOOK.length) % HANDBOOK.length;
    renderHandbook(); persist();
  });
  $('#hbNext')?.addEventListener('click', () => {
    handbookIndex = (handbookIndex + 1) % HANDBOOK.length;
    renderHandbook(); persist();
  });
  $('#hbShuffle')?.addEventListener('click', () => {
    let next = handbookIndex;
    if (HANDBOOK.length > 1) {
      while (next === handbookIndex) next = Math.floor(Math.random() * HANDBOOK.length);
    }
    handbookIndex = next;
    renderHandbook(); persist();
  });

  // Restore checklist state
  $$('[data-hb-check]').forEach(cb => {
    const key = cb.dataset.hbCheck;
    if (S.handbook && S.handbook.check && S.handbook.check[key]) cb.checked = true;
    cb.addEventListener('change', () => {
      if (!S.handbook) S.handbook = {};
      if (!S.handbook.check) S.handbook.check = {};
      S.handbook.check[key] = cb.checked;
      saveState();
    });
  });
}

// ---------------- Subscriptions ----------------
// FX rates anchored to USD (approx, April 2026). User-editable in code.
// CNY ~ 7.20 per USD; HKD ~ 7.80 per USD.
const FX_TO_USD = { USD: 1, HKD: 1 / 7.80, CNY: 1 / 7.20 };
const CURRENCY_SYMBOL = { USD: '$', HKD: 'HK$', CNY: '¥' };

const NATURE_LABEL = {
  ai: 'AI',
  office: 'Office',
  patreon: 'Patreon',
  investment: 'Investment',
  news: 'News',
  cloud: 'Cloud',
  entertainment: 'Entertainment',
  health: 'Health',
  other: 'Other',
};

const PERIOD_MONTHS = {
  weekly: 12 / 52,      // ≈ 0.230 months
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

const PERIOD_DAYS = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  semiannual: 182,
  yearly: 365,
};

let subFilter = 'all';
let subSearch = '';

function toUSD(amount, currency) {
  return (+amount || 0) * (FX_TO_USD[currency] || 1);
}
function fromUSD(amountUsd, currency) {
  const rate = FX_TO_USD[currency] || 1;
  return amountUsd / rate;
}
function fmtMoney(amount, currency) {
  const sym = CURRENCY_SYMBOL[currency] || '';
  const v = Math.abs(amount) >= 1000
    ? amount.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${sym}${v}`;
}
function monthlyCostUSD(item) {
  const months = PERIOD_MONTHS[item.period] || 1;
  return toUSD(item.fee, item.currency) / months;
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}
function matchesSubSearch(s) {
  if (!subSearch) return true;
  const q = subSearch.toLowerCase();
  return (s.name || '').toLowerCase().includes(q)
      || (s.note || '').toLowerCase().includes(q)
      || (NATURE_LABEL[s.nature] || '').toLowerCase().includes(q);
}

function renderSubscriptions() {
  const root = $('#subsTable');
  if (!root) return;
  const base = S.subs.baseCurrency || 'USD';
  const items = (S.subs.items || []).slice();

  // Filter
  const visible = items.filter(s => {
    if (!matchesSubSearch(s)) return false;
    if (subFilter === 'all') return true;
    if (subFilter === 'other') {
      return !['ai','office','patreon','investment'].includes(s.nature);
    }
    return s.nature === subFilter;
  });

  // Sort: items with next-bill date first (soonest), then those without
  visible.sort((a, b) => {
    const da = daysUntil(a.nextDate);
    const db = daysUntil(b.nextDate);
    if (da == null && db == null) return (a.name || '').localeCompare(b.name || '');
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  root.innerHTML = '';

  if (items.length === 0) {
    root.appendChild(h('div', { class: 'subs-empty' },
      'No subscriptions yet. Add your first one above to start tracking recurring spend.'));
    renderSubsSummary();
    return;
  }

  // Header
  root.appendChild(h('div', { class: 'subs-table-head' },
    h('span', {}, 'Service'),
    h('span', {}, 'Nature'),
    h('span', {}, 'Fee'),
    h('span', {}, 'Period'),
    h('span', {}, `≈ / month (${base})`),
    h('span', {}, 'Next bill'),
    h('span', {}, '')
  ));

  if (visible.length === 0) {
    root.appendChild(h('div', { class: 'subs-empty' }, 'No subscriptions match this filter.'));
  } else {
    visible.forEach(s => {
      const days = daysUntil(s.nextDate);
      const cls = ['subs-row'];
      if (days != null && days < 0) cls.push('overdue');
      else if (days != null && days <= 7) cls.push('expiring');

      const monthlyDisplay = fromUSD(monthlyCostUSD(s), base);
      const periodLabel = (s.period || 'monthly').replace('semiannual', 'semi-annual');

      let nextLabel = '—', nextSub = '';
      if (s.nextDate) {
        nextLabel = s.nextDate;
        if (days != null) {
          if (days < 0) nextSub = `${Math.abs(days)} d overdue`;
          else if (days === 0) nextSub = 'today';
          else if (days === 1) nextSub = 'tomorrow';
          else nextSub = `in ${days} d`;
        }
      }

      root.appendChild(h('div', { class: cls.join(' ') },
        h('div', { class: 'subs-name' },
          h('strong', {}, s.name),
          s.note ? h('small', {}, s.note) : h('small', {}, ' ')
        ),
        h('span', { class: `sub-nature ${s.nature}` }, NATURE_LABEL[s.nature] || s.nature),
        h('span', { class: 'subs-fee' },
          fmtMoney(+s.fee, s.currency),
          h('small', {}, s.currency)
        ),
        h('span', { class: 'subs-period' }, periodLabel),
        h('span', { class: 'subs-monthly' }, fmtMoney(monthlyDisplay, base)),
        h('span', { class: 'subs-next' },
          nextLabel,
          nextSub ? h('small', {}, nextSub) : null
        ),
        h('button', {
          class: 'subs-del',
          title: 'Remove this subscription',
          onClick: (e) => { e.stopPropagation(); deleteSubscription(s.id); }
        }, '✕')
      ));
    });
  }

  renderSubsSummary();
}

function renderSubsSummary() {
  const base = S.subs.baseCurrency || 'USD';
  const items = S.subs.items || [];
  const totalMonthlyUsd = items.reduce((sum, s) => sum + monthlyCostUSD(s), 0);
  const monthlyDisplay = fromUSD(totalMonthlyUsd, base);
  const yearlyDisplay = monthlyDisplay * 12;

  $('#subsMonthly').textContent = items.length ? fmtMoney(monthlyDisplay, base) : '—';
  $('#subsYearly').textContent = items.length ? fmtMoney(yearlyDisplay, base) : '—';
  $('#subsCount').textContent = String(items.length);
  const baseSel = $('#subsBaseCurrency');
  if (baseSel && baseSel.value !== base) baseSel.value = base;
}

function addSubscription(data) {
  if (!data.name || !data.fee) return;
  const item = {
    id: uid(),
    name: data.name.trim(),
    nature: data.nature || 'other',
    fee: parseFloat(data.fee) || 0,
    currency: data.currency || 'USD',
    period: data.period || 'monthly',
    nextDate: data.nextDate || '',
    note: (data.note || '').trim(),
    createdAt: Date.now(),
  };
  S.subs.items.push(item);
  saveState();
  renderSubscriptions();
}

function deleteSubscription(id) {
  S.subs.items = (S.subs.items || []).filter(s => s.id !== id);
  saveState();
  renderSubscriptions();
}

function updateSubPreview() {
  const fee = parseFloat($('#subFee').value);
  const currency = $('#subCurrency').value;
  const period = $('#subPeriod').value;
  const base = S.subs.baseCurrency || 'USD';
  if (isNaN(fee) || fee <= 0) {
    $('#subPreview').textContent = '≈ — / month';
    return;
  }
  const months = PERIOD_MONTHS[period] || 1;
  const monthlyUsd = toUSD(fee, currency) / months;
  const display = fromUSD(monthlyUsd, base);
  $('#subPreview').innerHTML = `≈ <strong>${fmtMoney(display, base)}</strong> / month`;
}

function wireSubscriptions() {
  $('#subForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addSubscription({
      name: $('#subName').value,
      nature: $('#subNature').value,
      fee: $('#subFee').value,
      currency: $('#subCurrency').value,
      period: $('#subPeriod').value,
      nextDate: $('#subNextDate').value,
      note: $('#subNote').value,
    });
    // Reset entry-specific fields, keep nature/currency/period for fast batch entry
    ['#subName','#subFee','#subNextDate','#subNote'].forEach(s => { const el = $(s); if (el) el.value = ''; });
    $('#subPreview').textContent = '≈ — / month';
  });

  ['#subFee','#subCurrency','#subPeriod'].forEach(sel => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('input', updateSubPreview);
    el.addEventListener('change', updateSubPreview);
  });

  $$('[data-sub-filter]').forEach(p => {
    p.addEventListener('click', () => {
      $$('[data-sub-filter]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      subFilter = p.dataset.subFilter;
      renderSubscriptions();
    });
  });

  $('#subSearch')?.addEventListener('input', (e) => {
    subSearch = e.target.value.trim();
    renderSubscriptions();
  });

  $('#subsBaseCurrency')?.addEventListener('change', (e) => {
    S.subs.baseCurrency = e.target.value;
    saveState();
    renderSubscriptions();
    updateSubPreview();
  });
}

// ---------------- Quotes ----------------
const quotes = [
  'Discipline is freedom. — Aristotle',
  'Patience and discipline — the edge compounds silently.',
  'Don\'t find customers for your products, find products for your customers. — Seth Godin',
  'The market can stay irrational longer than you can stay solvent. — John Maynard Keynes',
  'The trend is your friend until the end when it bends. — Ed Seykota',
  'Amateurs think about how much money they can make. Professionals think about how much money they could lose. — Jack Schwager',
  'Energy flows where attention goes.',
  'You cannot cross the sea merely by standing and staring at the water. — Tagore',
  '吾日三省吾身 — 為人謀而不忠乎？與朋友交而不信乎？傳不習乎？ — 曾子',
  'Cut your losses short and let your profits run. — David Ricardo',
];

function setQuote() {
  const day = new Date().getDate();
  $('#footerQuote').textContent = quotes[day % quotes.length];
}

// ---------------- Import / Export / Reset ----------------
function exportJSON() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meridian-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      S = { ...defaultState(), ...data };
      saveState();
      renderAll();
    } catch (err) { alert('Invalid file'); }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!confirm('Reset all data? This cannot be undone.')) return;
  S = defaultState();
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  renderAll();
}

// ---------------- Wiring ----------------
function wireEvents() {
  // Theme
  initTheme();

  // Intention
  const intEl = $('#intention');
  intEl.value = S.intention || '';
  intEl.addEventListener('input', () => { S.intention = intEl.value; saveState(); });
  $$('.chip').forEach(c => {
    c.addEventListener('click', () => {
      intEl.value = c.dataset.intent;
      S.intention = c.dataset.intent;
      saveState();
    });
  });

  // Task filters
  $$('.track-filter .pill').forEach(p => {
    p.addEventListener('click', () => {
      $$('.track-filter .pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      taskFilter = p.dataset.filter;
      renderTracks();
    });
  });

  // Task add
  $('#taskAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#taskTitle').value.trim();
    if (!title) return;
    addTask({
      title,
      track: $('#taskTrack').value,
      priority: $('#taskPriority').value,
      due: $('#taskDue').value,
    });
    $('#taskTitle').value = '';
    $('#taskDue').value = '';
  });

  // Matrix
  wireMatrix();

  // Habit add
  $('#habitAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#habitName').value.trim();
    if (!name) return;
    addHabit(name);
    $('#habitName').value = '';
  });
  $('#weekPrev').addEventListener('click', () => { weekOffset--; renderHabits(); });
  $('#weekNext').addEventListener('click', () => { if (weekOffset < 0) weekOffset++; renderHabits(); });

  // Reminders
  $('#reminderAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#remText').value.trim();
    const time = $('#remTime').value;
    if (!text || !time) return;
    addReminder(text, time);
    $('#remText').value = '';
    $('#remTime').value = '';
  });
  $('#enableNotif').addEventListener('click', async () => {
    if (!('Notification' in window)) return alert('Notifications not supported');
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      $('#enableNotif').textContent = 'Notifications on';
      $('#enableNotif').disabled = true;
    }
  });

  // Journal
  wireJournal();

  // Trades — expanded Stonk Journal-style form
  $('#tradeAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const symbol = $('#trSymbol').value.trim();
    if (!symbol) return;
    addTrade({
      market: $('#trMarket').value,
      symbol,
      side: $('#trSide').value,
      qty: $('#trQty').value,
      entry: $('#trEntry').value,
      exit: $('#trExit').value,
      stop: $('#trStop').value,
      target: $('#trTarget').value,
      fees: $('#trFees').value,
      openDate: $('#trOpenDate').value,
      closeDate: $('#trCloseDate').value,
      setup: $('#trSetup').value,
      mood: $('#trMood').value,
      confidence: $('#trConf').value,
      tags: $('#trTags').value,
      note: $('#trNote').value,
    });
    // Reset only the entry-specific fields
    ['#trSymbol','#trQty','#trEntry','#trExit','#trStop','#trTarget','#trFees','#trTags','#trNote','#trOpenDate','#trCloseDate']
      .forEach(s => { const el = $(s); if (el) el.value = ''; });
    $('#trConf').value = 3;
    $('#trConfVal').textContent = '3/5';
    $('#trPreview').textContent = 'Net P/L — · R — · R/R —';
  });

  // Live preview as user types prices
  ['#trEntry','#trExit','#trStop','#trTarget','#trQty','#trFees','#trSide'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('input', updateTradePreview);
    if (el && el.tagName === 'SELECT') el.addEventListener('change', updateTradePreview);
  });

  // Confidence slider value display
  const trConf = $('#trConf');
  if (trConf) {
    trConf.addEventListener('input', () => {
      $('#trConfVal').textContent = `${trConf.value}/5`;
    });
  }

  // Trade filter pills
  $$('[data-trade-filter]').forEach(p => {
    p.addEventListener('click', () => {
      $$('[data-trade-filter]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      tradeFilter = p.dataset.tradeFilter;
      renderTrades();
    });
  });

  // Trade search
  const trSearch = $('#trSearch');
  if (trSearch) trSearch.addEventListener('input', () => {
    tradeSearch = trSearch.value.trim();
    renderTrades();
  });

  // ---- Equity Curve ----
  const eqSetStart = $('#eqSetStart');
  if (eqSetStart) eqSetStart.addEventListener('click', () => {
    const date = $('#eqStartDate').value;
    const amt = parseFloat($('#eqStartAmt').value);
    if (!isNaN(amt)) setEquityStart(date, amt);
  });

  const eqLogBtn = $('#eqLogBtn');
  if (eqLogBtn) eqLogBtn.addEventListener('click', () => {
    const date = $('#eqLogDate').value || todayKey();
    const amt = parseFloat($('#eqLogAmt').value);
    if (!isNaN(amt)) {
      logBalance(date, amt);
      $('#eqLogAmt').value = '';
    }
  });

  ['#eqShowMA','#eqShowDD'].forEach(s => {
    const el = $(s);
    if (el) el.addEventListener('change', renderEquity);
  });
  const eqRangeEl = $('#eqRange');
  if (eqRangeEl) eqRangeEl.addEventListener('change', () => {
    eqRange = eqRangeEl.value;
    renderEquity();
  });

  // Default the log date input to today
  const eqLogDate = $('#eqLogDate');
  if (eqLogDate && !eqLogDate.value) eqLogDate.value = todayKey();

  // Range tabs
  $$('.range-tabs .pill').forEach(p => {
    p.addEventListener('click', () => {
      $$('.range-tabs .pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      kpiRange = p.dataset.range;
      renderKPIs();
    });
  });

  // Controls
  $('#exportBtn').addEventListener('click', exportJSON);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
  });
  $('#resetBtn').addEventListener('click', resetAll);
}

function renderAll() {
  $('#streakDays').textContent = S.streak.count || 0;
  $('#intention').value = S.intention || '';
  renderTimeline();
  renderTracks();
  renderHabits();
  renderReminders();
  renderJournal();
  renderTrades();
  renderEquity();
  renderSubscriptions();
  renderKPIs();
}

// ---------------- Init ----------------
function init() {
  loadState();
  wireEvents();
  wireHandbook();
  wireSubscriptions();
  setQuote();
  renderAll();
  tick();
  setInterval(tick, 1000);
  setInterval(() => { renderReminders(); checkReminderFiring(); }, 30000);
  window.addEventListener('resize', () => { renderKPIs(); renderEquity(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
