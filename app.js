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
  tasks: [],          // { id, title, track, priority, due, done, quad, skillId, createdAt }
  habits: [],         // { id, name, log: { 'YYYY-MM-DD': true } }
  reminders: [],      // { id, text, time }
  trades: [],         // POSITIONS — { id, symbol, side, market, status, theme, tradeType, executions[], stop, target, tags, notes, createdAt }
  plans: [],          // BATTLE PLANS — { id, symbol, market, side, entry, stop, target, riskAmt, theme, tradeType, tags, notes, createdAt }
  journals: {},       // { 'YYYY-MM-DD': { wins, lessons, tomorrow } }
  equity: {           // portfolio balance series
    startDate: '2026-01-01',
    startBalance: 0,
    nav: 0,           // current account value (manual entry, drives True Equity calc)
    history: {},      // { 'YYYY-MM-DD': balance }
  },
  streak: { count: 0, lastActive: null },
  handbook: { lastIndex: null, check: {} },
  subs: { items: [], baseCurrency: 'USD' },
  skills: [],         // { id, name, category, level (0-5), note, createdAt }
  books: [],          // { id, title, author, status, progress, started, finished, rating, notes }
  quotes: null,       // null → use defaults; otherwise array of strings (user-managed)
  // ---- Second-Brain layer ----
  inbox: [],          // { id, text, createdAt }  — fast capture; triaged later
  projects: [],       // { id, name, goal, deadline, area, status, createdAt }
  notes: [],          // { id, title, body, tags, linkedSymbol, createdAt, updatedAt }
  reviews: {},        // { 'YYYY-Www': { wins, losses, lessons, nextWeek } } — weekly review
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
      if (!Array.isArray(S.skills)) S.skills = [];
      if (!Array.isArray(S.books)) S.books = [];
      if (!Array.isArray(S.plans)) S.plans = [];
      if (!Array.isArray(S.inbox)) S.inbox = [];
      if (!Array.isArray(S.projects)) S.projects = [];
      if (!Array.isArray(S.notes)) S.notes = [];
      if (!S.reviews || typeof S.reviews !== 'object') S.reviews = {};
      if (loaded.quotes !== undefined) S.quotes = loaded.quotes;
      // ---- Trade migration: old single-execution rows → new position shape ----
      if (Array.isArray(S.trades)) {
        S.trades = S.trades.map(t => migrateTrade(t)).filter(Boolean);
      }
    }
  } catch (e) { /* storage unavailable — fall back to in-memory */ }
}

// Convert old single-execution row to new position shape; pass through if already migrated.
function migrateTrade(t) {
  if (!t || typeof t !== 'object') return null;
  if (Array.isArray(t.executions)) return t; // already migrated
  // Old fields: { id, market, symbol, side, qty, entry, exit, stop, target, fees, openDate, closeDate, setup, mood, confidence, tags, note, createdAt }
  const sideIsLong = (t.side || 'long') === 'long';
  const openAction = sideIsLong ? 'buy' : 'sell';
  const closeAction = sideIsLong ? 'sell' : 'buy';
  const execs = [];
  if (t.entry != null && t.qty != null) {
    execs.push({
      id: uid(), action: openAction,
      qty: +t.qty, price: +t.entry,
      date: t.openDate || (t.createdAt ? new Date(t.createdAt).toISOString().slice(0,10) : todayKey()),
      fees: +(t.fees || 0) / (t.exit != null && t.exit !== '' ? 2 : 1),
      note: ''
    });
  }
  if (t.exit != null && t.exit !== '' && t.qty != null) {
    execs.push({
      id: uid(), action: closeAction,
      qty: +t.qty, price: +t.exit,
      date: t.closeDate || todayKey(),
      fees: +(t.fees || 0) / 2,
      note: ''
    });
  }
  return {
    id: t.id || uid(),
    symbol: (t.symbol || '').toUpperCase(),
    market: t.market || 'stock',
    side: t.side || 'long',
    status: (t.exit != null && t.exit !== '') ? 'closed' : 'open',
    tradeType: 'swing',                  // default — user can re-tag
    theme: '',                            // user-supplied, e.g. AI / Energy / China
    executions: execs,
    stop: t.stop != null && t.stop !== '' ? +t.stop : null,
    target: t.target != null && t.target !== '' ? +t.target : null,
    tags: Array.isArray(t.tags) ? t.tags : [],
    notes: t.note || '',
    setup: t.setup || '',
    mood: t.mood || '',
    confidence: t.confidence || 3,
    createdAt: t.createdAt || Date.now(),
  };
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
// Diablo-style icons: each track has an item-rarity tier (legendary/rare/magic/common)
const TRACKS = [
  { id: 'trading',    label: 'Trading prep',    icon: '⚔',  blurb: 'Market research, watchlists, journaling',  tier: 'legendary' },
  { id: 'wealth',     label: 'Wealth',          icon: '◈',  blurb: 'Net worth, savings, financial planning',    tier: 'legendary' },
  { id: 'learning',   label: 'Online learning', icon: '⌬',  blurb: 'ESG · tarot · cyber · certifications',     tier: 'rare' },
  { id: 'health',     label: 'Health',          icon: '♥',  blurb: 'Movement, sleep, mindfulness',              tier: 'rare' },
  { id: 'reading',    label: 'Reading',         icon: '❦',  blurb: 'Books, research, deep focus',               tier: 'magic' },
  { id: 'linkedin',   label: 'LinkedIn',        icon: '◆',  blurb: 'Profile, content, visibility',              tier: 'magic' },
  { id: 'networking', label: 'Networking',      icon: '✷',  blurb: 'Outreach, coffee chats, follow-ups',        tier: 'magic' },
  { id: 'hobby',      label: 'Hobby',           icon: '✦',  blurb: 'Creative pursuits, play, joy',              tier: 'common' },
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
  const skill = t.skillId ? S.skills.find(s => s.id === t.skillId) : null;
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
        skill ? h('span', { class: 'task-skill', title: 'Linked skill' }, '◈ ' + skill.name) : null,
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
    skillId: data.skillId || null,
    done: false,
    quad: null,
    createdAt: Date.now(),
  });
  saveState();
  renderTracks();
  renderSkills();
}

function toggleTask(id) {
  const t = S.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) bumpStreak();
  saveState();
  renderTracks();
  renderSkills();
}

function deleteTask(id) {
  S.tasks = S.tasks.filter(t => t.id !== id);
  saveState();
  renderTracks();
  renderSkills();
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

// ---------------- Positions & Battle Plans (Stonk Journal-inspired) ----------------
// Data model:
//   position = { id, symbol, market, side: long|short, status: open|closed,
//                tradeType: swing|position, theme, executions: [{id, action: buy|sell, qty, price, date, fees, note}],
//                stop, target, tags, notes, setup, mood, confidence, createdAt }
//   plan     = { id, symbol, market, side, entry, stop, target, riskAmt,
//                tradeType, theme, tags, notes, createdAt }

let tradeTab = 'open';            // 'open' | 'plan' | 'closed'
let tradeFilter = 'all';
let tradeSearch = '';
let expandedTradeId = null;
let closedRange = 'all';          // 'all' | '30d' | '60d'

/* -------- Position math -------- */
function posMetrics(p) {
  const sideMul = p.side === 'short' ? -1 : 1;
  const execs = (p.executions || []).slice().sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);

  // For longs: buys = opens, sells = closes. For shorts: sells = opens, buys = closes.
  const openSide = p.side === 'short' ? 'sell' : 'buy';
  const closeSide = p.side === 'short' ? 'buy' : 'sell';

  let openedQty = 0, openedCost = 0;
  let closedQty = 0, closedProceeds = 0;
  let totalFees = 0;
  for (const e of execs) {
    const q = +e.qty || 0;
    const px = +e.price || 0;
    const f = +e.fees || 0;
    totalFees += f;
    if (e.action === openSide) {
      openedQty += q;
      openedCost += q * px;
    } else if (e.action === closeSide) {
      closedQty += q;
      closedProceeds += q * px;
    }
  }

  const avgOpen = openedQty > 0 ? openedCost / openedQty : 0;
  const avgClose = closedQty > 0 ? closedProceeds / closedQty : 0;
  const currentQty = Math.max(0, openedQty - closedQty);

  // Realized P/L: per-share (avg open vs close) * matched qty * sideMul, minus fees on closed portion (proportional)
  const matchedQty = Math.min(openedQty, closedQty);
  const closedFeesShare = openedQty > 0 ? totalFees * (matchedQty * 2 / Math.max(1, openedQty + closedQty)) : 0;
  const realized = matchedQty > 0 ? (avgClose - avgOpen) * matchedQty * sideMul - closedFeesShare : 0;

  // Unrealized = (last_price - avgOpen) * currentQty * sideMul. We don't have a live price,
  // so unrealized is computed against `target` (best case) and `stop` (worst case).
  const stop = (p.stop != null && p.stop !== '') ? +p.stop : null;
  const target = (p.target != null && p.target !== '') ? +p.target : null;
  // Pretend "current price" = avgOpen for the headline unrealized (i.e. flat) until user adds an exit.
  // The real story is told by upside/downside vs avgOpen.
  const upside = (target != null && currentQty > 0) ? (target - avgOpen) * currentQty * sideMul : null;
  const downside = (stop != null && currentQty > 0) ? (stop - avgOpen) * currentQty * sideMul : null;
  // maxLoss = magnitude of the downside if stop hit (positive number for display)
  const maxLoss = downside != null && downside < 0 ? Math.abs(downside) : 0;

  // R-multiple on realized portion (uses avg open vs avg close vs initial stop distance)
  let R = null;
  if (stop != null && avgOpen && stop !== avgOpen && matchedQty > 0) {
    const riskPerShare = Math.abs(avgOpen - stop);
    R = ((avgClose - avgOpen) * sideMul) / riskPerShare;
  }
  let plannedRR = null;
  if (stop != null && target != null && avgOpen && stop !== avgOpen) {
    plannedRR = Math.abs(target - avgOpen) / Math.abs(avgOpen - stop);
  }

  // Total exposure (open shares × avg open)
  const exposure = currentQty * avgOpen;
  const totalBought = (p.side === 'short' ? closedQty : openedQty);
  const totalSold = (p.side === 'short' ? openedQty : closedQty);

  return {
    avgOpen, avgClose, currentQty, openedQty, closedQty, matchedQty,
    realized, upside, downside, maxLoss, R, plannedRR, exposure,
    totalBought, totalSold, totalFees,
    isOpen: currentQty > 0,
    isClosed: openedQty > 0 && currentQty === 0,
  };
}

/* -------- Search/filter helpers -------- */
function matchesTradeSearch(t) {
  if (!tradeSearch) return true;
  const q = tradeSearch.toLowerCase();
  const tags = (t.tags || []).join(' ').toLowerCase();
  return (t.symbol || '').toLowerCase().includes(q)
      || (t.notes || '').toLowerCase().includes(q)
      || (t.setup || '').toLowerCase().includes(q)
      || (t.theme || '').toLowerCase().includes(q)
      || tags.includes(q);
}

function isWithinRange(dateStr, range) {
  if (!dateStr || range === 'all') return true;
  const days = range === '30d' ? 30 : 60;
  const d = new Date(dateStr + 'T00:00:00');
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

function lastExecDate(p) {
  const execs = p.executions || [];
  if (!execs.length) return p.createdAt ? new Date(p.createdAt).toISOString().slice(0,10) : '';
  return execs.reduce((acc, e) => e.date > acc ? e.date : acc, '');
}

function firstExecDate(p) {
  const execs = p.executions || [];
  if (!execs.length) return p.createdAt ? new Date(p.createdAt).toISOString().slice(0,10) : '';
  return execs.reduce((acc, e) => (acc === '' || e.date < acc) ? e.date : acc, '');
}

/* -------- Format helpers (trade-scoped) -------- */
const fmtPnl = (n) => (n >= 0 ? '+$' : '−$') + Math.abs(n).toFixed(2);
const pnlClass = (n) => n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat';

/* -------- Render: tab switching -------- */
function renderTrades() {
  // Show/hide tab panels
  $$('.trade-tab-panel').forEach(el => {
    el.style.display = el.dataset.tabPanel === tradeTab ? '' : 'none';
  });
  $$('[data-trade-tab]').forEach(b => b.classList.toggle('active', b.dataset.tradeTab === tradeTab));

  if (tradeTab === 'open') renderOpenPositions();
  else if (tradeTab === 'plan') renderPlans();
  else renderClosedPositions();

  renderRollups();
  renderTrueEquity();
  renderTradeStats();
}

/* -------- Open positions (table with expandable executions) -------- */
function renderOpenPositions() {
  const root = $('#tradesTable');
  root.innerHTML = '';

  const items = S.trades.slice().filter(p => {
    if (!matchesTradeSearch(p)) return false;
    const m = posMetrics(p);
    if (tradeFilter === 'open' && !m.isOpen) return false;
    if (tradeFilter === 'closed' && !m.isClosed) return false;
    return m.isOpen; // open tab only shows open positions
  }).sort((a, b) => {
    const da = lastExecDate(a) || '';
    const db = lastExecDate(b) || '';
    return da < db ? 1 : -1;
  });

  if (items.length === 0) {
    root.appendChild(h('div', { class: 'trades-empty' },
      S.trades.length === 0
        ? 'No positions yet. Inscribe your first execution above to begin the campaign.'
        : 'No open positions match this filter.'
    ));
    return;
  }

  root.appendChild(h('div', { class: 'trades-table-head pos-head' },
    h('span', {}, 'Sym'),
    h('span', {}, 'Side'),
    h('span', {}, 'Type'),
    h('span', {}, 'Theme'),
    h('span', {}, 'Qty'),
    h('span', {}, 'Avg in'),
    h('span', {}, 'Stop'),
    h('span', {}, 'Target'),
    h('span', {}, 'Downside'),
    h('span', {}, 'R/R'),
    h('span', {}, '')
  ));

  items.forEach(p => {
    const m = posMetrics(p);
    const expanded = expandedTradeId === p.id;
    const row = h('div', {
      class: `trade-row pos-row ${expanded ? 'expanded' : ''}`,
      data: { tradeId: p.id },
      onClick: () => { expandedTradeId = expanded ? null : p.id; renderTrades(); }
    },
      h('span', { class: 'tr-sym' }, (p.symbol || '—').toUpperCase()),
      h('span', { class: `tr-side ${p.side}` }, p.side || '—'),
      h('span', { class: 'tr-tagchip' }, p.tradeType || 'swing'),
      h('span', { class: 'tr-theme' }, p.theme || '—'),
      h('span', { class: 'tr-num' }, m.currentQty.toString()),
      h('span', { class: 'tr-num' }, m.avgOpen ? '$' + m.avgOpen.toFixed(2) : '—'),
      h('span', { class: 'tr-num' }, p.stop != null ? '$' + (+p.stop).toFixed(2) : '—'),
      h('span', { class: 'tr-num' }, p.target != null ? '$' + (+p.target).toFixed(2) : '—'),
      h('span', { class: `tr-pnl ${m.maxLoss > 0 ? 'neg' : 'flat'}` },
        m.downside != null ? (m.downside >= 0 ? '+$' : '−$') + Math.abs(m.downside).toFixed(0) : '—'),
      h('span', { class: 'tr-r' }, m.plannedRR != null ? m.plannedRR.toFixed(2) : '—'),
      h('button', {
        class: 'tr-del', title: 'Vanquish position',
        onClick: (e) => { e.stopPropagation(); if (confirm('Delete this position and all its executions?')) deletePosition(p.id); }
      }, '✕')
    );
    root.appendChild(row);

    if (expanded) root.appendChild(renderPositionDetail(p, m));
  });
}

/* -------- Closed positions (table) -------- */
function renderClosedPositions() {
  const root = $('#closedTable');
  if (!root) return;
  root.innerHTML = '';

  const items = S.trades.slice().filter(p => {
    if (!matchesTradeSearch(p)) return false;
    const m = posMetrics(p);
    if (!m.isClosed) return false;
    if (!isWithinRange(lastExecDate(p), closedRange)) return false;
    return true;
  }).sort((a, b) => {
    const da = lastExecDate(a) || '';
    const db = lastExecDate(b) || '';
    return da < db ? 1 : -1;
  });

  if (items.length === 0) {
    root.appendChild(h('div', { class: 'trades-empty' }, 'No vanquished trades in this window.'));
    return;
  }

  root.appendChild(h('div', { class: 'trades-table-head closed-head' },
    h('span', {}, 'Closed'),
    h('span', {}, 'Sym'),
    h('span', {}, 'Side'),
    h('span', {}, 'Type'),
    h('span', {}, 'Theme'),
    h('span', {}, 'Qty'),
    h('span', {}, 'Avg in'),
    h('span', {}, 'Avg out'),
    h('span', {}, 'Realized'),
    h('span', {}, 'R'),
    h('span', {}, '')
  ));

  items.forEach(p => {
    const m = posMetrics(p);
    const expanded = expandedTradeId === p.id;
    const closed = lastExecDate(p) || '—';
    const row = h('div', {
      class: `trade-row closed-row ${expanded ? 'expanded' : ''}`,
      data: { tradeId: p.id },
      onClick: () => { expandedTradeId = expanded ? null : p.id; renderTrades(); }
    },
      h('span', { class: 'tr-date' }, closed.slice(5)),
      h('span', { class: 'tr-sym' }, (p.symbol || '—').toUpperCase()),
      h('span', { class: `tr-side ${p.side}` }, p.side || '—'),
      h('span', { class: 'tr-tagchip' }, p.tradeType || 'swing'),
      h('span', { class: 'tr-theme' }, p.theme || '—'),
      h('span', { class: 'tr-num' }, String(m.matchedQty)),
      h('span', { class: 'tr-num' }, m.avgOpen ? '$' + m.avgOpen.toFixed(2) : '—'),
      h('span', { class: 'tr-num' }, m.avgClose ? '$' + m.avgClose.toFixed(2) : '—'),
      h('span', { class: `tr-pnl ${pnlClass(m.realized)}` }, fmtPnl(m.realized)),
      h('span', { class: `tr-r ${pnlClass(m.R || 0)}` }, m.R != null ? (m.R >= 0 ? '+' : '') + m.R.toFixed(2) + 'R' : '—'),
      h('button', {
        class: 'tr-del',
        onClick: (e) => { e.stopPropagation(); if (confirm('Delete this trade?')) deletePosition(p.id); }
      }, '✕')
    );
    root.appendChild(row);
    if (expanded) root.appendChild(renderPositionDetail(p, m));
  });
}

/* -------- Position expanded detail (executions log + edit) -------- */
function renderPositionDetail(p, m) {
  const execs = (p.executions || []).slice().sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);

  const execList = h('div', { class: 'exec-list' },
    h('div', { class: 'exec-head' },
      h('span', {}, 'Date'), h('span', {}, 'Action'), h('span', {}, 'Qty'),
      h('span', {}, 'Price'), h('span', {}, 'Fees'), h('span', {}, 'Cash flow'), h('span', {}, '')
    ),
    ...execs.map(e => {
      const cf = (e.action === 'buy' ? -1 : 1) * (+e.qty || 0) * (+e.price || 0) - (+e.fees || 0);
      return h('div', { class: 'exec-row' },
        h('span', { class: 'tr-date' }, (e.date || '—').slice(5)),
        h('span', { class: `exec-action ${e.action}` }, e.action),
        h('span', { class: 'tr-num' }, String(e.qty)),
        h('span', { class: 'tr-num' }, '$' + (+e.price).toFixed(2)),
        h('span', { class: 'tr-num' }, '$' + (+e.fees || 0).toFixed(2)),
        h('span', { class: `tr-num ${pnlClass(cf)}` }, fmtPnl(cf)),
        h('button', {
          class: 'tr-del',
          onClick: (ev) => { ev.stopPropagation(); deleteExecution(p.id, e.id); }
        }, '✕')
      );
    })
  );

  // Inline form to add an execution
  const form = h('form', {
    class: 'exec-form',
    onClick: (e) => e.stopPropagation(),
    onSubmit: (e) => {
      e.preventDefault();
      const action = form.querySelector('[name="action"]').value;
      const qty = +form.querySelector('[name="qty"]').value;
      const price = +form.querySelector('[name="price"]').value;
      const date = form.querySelector('[name="date"]').value || todayKey();
      const fees = +form.querySelector('[name="fees"]').value || 0;
      if (!qty || !price) return;
      addExecution(p.id, { action, qty, price, date, fees });
    }
  },
    h('select', { name: 'action' },
      h('option', { value: 'buy' }, 'Buy'),
      h('option', { value: 'sell' }, 'Sell')
    ),
    h('input', { name: 'qty', type: 'number', step: 'any', placeholder: 'Qty', required: 'required' }),
    h('input', { name: 'price', type: 'number', step: 'any', placeholder: 'Price', required: 'required' }),
    h('input', { name: 'date', type: 'date', value: todayKey() }),
    h('input', { name: 'fees', type: 'number', step: 'any', placeholder: 'Fees' }),
    h('button', { type: 'submit', class: 'btn-primary' }, 'Inscribe')
  );

  // Stop/Target/tags edit row
  const meta = h('form', {
    class: 'pos-meta-form',
    onClick: (e) => e.stopPropagation(),
    onSubmit: (e) => {
      e.preventDefault();
      const stop = meta.querySelector('[name="stop"]').value;
      const target = meta.querySelector('[name="target"]').value;
      const theme = meta.querySelector('[name="theme"]').value.trim();
      const tradeType = meta.querySelector('[name="tradeType"]').value;
      const tags = meta.querySelector('[name="tags"]').value;
      const notes = meta.querySelector('[name="notes"]').value;
      updatePosition(p.id, {
        stop: stop !== '' ? +stop : null,
        target: target !== '' ? +target : null,
        theme, tradeType,
        tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        notes,
      });
    }
  },
    h('div', { class: 'meta-grid' },
      h('label', {}, 'Stop $', h('input', { name: 'stop', type: 'number', step: 'any', value: p.stop != null ? p.stop : '' })),
      h('label', {}, 'Target $', h('input', { name: 'target', type: 'number', step: 'any', value: p.target != null ? p.target : '' })),
      h('label', {}, 'Type',
        h('select', { name: 'tradeType' },
          h('option', { value: 'swing', ...(p.tradeType === 'swing' ? { selected: 'selected' } : {}) }, 'Swing'),
          h('option', { value: 'position', ...(p.tradeType === 'position' ? { selected: 'selected' } : {}) }, 'Position')
        )
      ),
      h('label', {}, 'Theme', h('input', { name: 'theme', type: 'text', placeholder: 'AI / Energy / China', value: p.theme || '' })),
      h('label', { class: 'meta-wide' }, 'Tags (comma)', h('input', { name: 'tags', type: 'text', value: (p.tags || []).join(', ') })),
      h('label', { class: 'meta-wide' }, 'Thesis / notes', h('input', { name: 'notes', type: 'text', value: p.notes || '' }))
    ),
    h('button', { type: 'submit', class: 'btn-secondary' }, 'Save changes')
  );

  // Summary chips
  const summary = h('div', { class: 'pos-summary' },
    chip('Bought', m.totalBought + ' sh'),
    chip('Sold', m.totalSold + ' sh'),
    chip('Avg in', m.avgOpen ? '$' + m.avgOpen.toFixed(2) : '—'),
    chip('Avg out', m.avgClose ? '$' + m.avgClose.toFixed(2) : '—'),
    chip('Realized', fmtPnl(m.realized), pnlClass(m.realized)),
    chip('Upside', m.upside != null ? fmtPnl(m.upside) : '—', m.upside != null ? pnlClass(m.upside) : ''),
    chip('Max loss', m.maxLoss ? '−$' + m.maxLoss.toFixed(0) : '—', m.maxLoss ? 'neg' : ''),
    chip('R', m.R != null ? (m.R >= 0 ? '+' : '') + m.R.toFixed(2) + 'R' : '—', m.R != null ? pnlClass(m.R) : ''),
    chip('Planned R/R', m.plannedRR != null ? m.plannedRR.toFixed(2) : '—'),
  );

  return h('div', {
    class: 'trade-detail pos-detail',
    onClick: (e) => e.stopPropagation()
  },
    summary,
    h('div', { class: 'detail-section-title' }, 'Executions log'),
    execList,
    h('div', { class: 'detail-section-title' }, 'Add execution'),
    form,
    h('div', { class: 'detail-section-title' }, 'Position details'),
    meta
  );
}

function chip(label, value, mod) {
  return h('span', { class: `pos-chip ${mod || ''}` },
    h('span', { class: 'pc-l' }, label),
    h('span', { class: 'pc-v' }, value)
  );
}

/* -------- Battle plans (Trading Plan tab) -------- */
function renderPlans() {
  const root = $('#plansList');
  if (!root) return;
  root.innerHTML = '';

  if (!S.plans || S.plans.length === 0) {
    root.appendChild(h('div', { class: 'trades-empty' }, 'No battle plans yet. Draft one above — discipline lives here.'));
    return;
  }

  S.plans.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(plan => {
    root.appendChild(renderPlanCard(plan));
  });
}

function planMetrics(pl) {
  const entry = +pl.entry || 0;
  const stop = +pl.stop || 0;
  const target = +pl.target || 0;
  const risk = +pl.riskAmt || 0;
  const sideMul = pl.side === 'short' ? -1 : 1;
  const perShareRisk = entry && stop && entry !== stop ? Math.abs(entry - stop) : 0;
  const shares = perShareRisk > 0 && risk > 0 ? Math.floor(risk / perShareRisk) : 0;
  const rr = perShareRisk > 0 && target ? Math.abs(target - entry) / perShareRisk : 0;
  const maxLoss = perShareRisk * shares;
  const exposure = shares * entry;
  const reward = perShareRisk > 0 && target && shares > 0 ? (target - entry) * shares * sideMul : 0;
  return { perShareRisk, shares, rr, maxLoss, exposure, reward };
}

function renderPlanCard(pl) {
  const m = planMetrics(pl);
  return h('div', { class: 'plan-card' },
    h('div', { class: 'plan-head' },
      h('div', { class: 'plan-title' },
        h('span', { class: 'tr-sym' }, (pl.symbol || '—').toUpperCase()),
        h('span', { class: `tr-side ${pl.side}` }, pl.side || 'long'),
        h('span', { class: 'tr-tagchip' }, pl.tradeType || 'swing'),
        pl.theme ? h('span', { class: 'tr-theme' }, pl.theme) : null
      ),
      h('div', { class: 'plan-actions' },
        h('button', {
          class: 'btn-primary',
          title: 'Convert plan into a real position with first execution',
          onClick: () => convertPlanToPosition(pl.id)
        }, 'Convert to position'),
        h('button', {
          class: 'tr-del-x',
          title: 'Discard plan',
          onClick: () => { if (confirm('Discard this plan?')) deletePlan(pl.id); }
        }, '✕')
      )
    ),
    h('div', { class: 'plan-grid' },
      stat('Entry', '$' + (+pl.entry || 0).toFixed(2)),
      stat('Stop', '$' + (+pl.stop || 0).toFixed(2)),
      stat('Target', pl.target ? '$' + (+pl.target).toFixed(2) : '—'),
      stat('Risk $', '$' + (+pl.riskAmt || 0).toFixed(0)),
      stat('Risk/share', '$' + m.perShareRisk.toFixed(2)),
      stat('Shares', String(m.shares), 'big'),
      stat('Exposure', '$' + m.exposure.toFixed(0)),
      stat('Max loss', '−$' + m.maxLoss.toFixed(0), 'neg'),
      stat('Reward', m.reward ? fmtPnl(m.reward) : '—', pnlClass(m.reward)),
      stat('R/R', m.rr ? m.rr.toFixed(2) : '—', m.rr >= 2 ? 'pos' : (m.rr > 0 ? '' : 'neg'))
    ),
    pl.notes ? h('div', { class: 'plan-notes' }, pl.notes) : null,
    pl.tags && pl.tags.length ? h('div', { class: 'plan-tags' },
      ...pl.tags.map(t => h('span', { class: 'tr-tag' }, t))
    ) : null
  );
}

function stat(label, value, mod) {
  return h('div', { class: `plan-stat ${mod || ''}` },
    h('div', { class: 'ps-l' }, label),
    h('div', { class: 'ps-v' }, value)
  );
}

/* -------- Rollups (above table): theme & trade-type exposure -------- */
function renderRollups() {
  const root = $('#tradeRollups');
  if (!root) return;
  root.innerHTML = '';
  const open = S.trades.filter(p => posMetrics(p).isOpen);
  if (open.length === 0) { root.style.display = 'none'; return; }
  root.style.display = '';

  const groupBy = (arr, keyFn) => {
    const o = {};
    arr.forEach(p => { const k = keyFn(p) || '—'; (o[k] = o[k] || []).push(p); });
    return o;
  };

  const summarize = (positions) => {
    let exposure = 0, maxLoss = 0, upside = 0, count = positions.length;
    positions.forEach(p => {
      const m = posMetrics(p);
      exposure += m.exposure;
      maxLoss += m.maxLoss;
      if (m.upside != null) upside += m.upside;
    });
    return { count, exposure, maxLoss, upside };
  };

  // By trade type (swing / position)
  const byType = groupBy(open, p => p.tradeType || 'swing');
  const typeRow = h('div', { class: 'rollup-row' },
    h('div', { class: 'rollup-label' }, 'By trade type'),
    ...Object.keys(byType).map(k => {
      const s = summarize(byType[k]);
      return h('div', { class: 'rollup-card' },
        h('div', { class: 'rollup-name' }, `${k} (${s.count})`),
        h('div', { class: 'rollup-stats' },
          h('span', {}, 'Exposure $' + s.exposure.toFixed(0)),
          h('span', { class: 'neg' }, 'Max loss −$' + s.maxLoss.toFixed(0)),
          h('span', { class: 'pos' }, 'Upside +$' + s.upside.toFixed(0))
        )
      );
    })
  );

  // By theme
  const byTheme = groupBy(open, p => p.theme || 'untagged');
  const themeRow = h('div', { class: 'rollup-row' },
    h('div', { class: 'rollup-label' }, 'By theme'),
    ...Object.keys(byTheme).map(k => {
      const s = summarize(byTheme[k]);
      return h('div', { class: 'rollup-card' },
        h('div', { class: 'rollup-name' }, `${k} (${s.count})`),
        h('div', { class: 'rollup-stats' },
          h('span', {}, '$' + s.exposure.toFixed(0)),
          h('span', { class: 'neg' }, '−$' + s.maxLoss.toFixed(0))
        )
      );
    })
  );

  root.appendChild(typeRow);
  root.appendChild(themeRow);
}

/* -------- True Equity card -------- */
function renderTrueEquity() {
  const navEl = $('#teNav');
  const tlEl = $('#teTotalLoss');
  const trueEl = $('#teTrueEquity');
  const expEl = $('#teExposure');
  if (!navEl || !tlEl || !trueEl) return;

  const nav = +(S.equity.nav || 0);
  const open = S.trades.filter(p => posMetrics(p).isOpen);
  let totalMaxLoss = 0, totalExposure = 0;
  open.forEach(p => {
    const m = posMetrics(p);
    totalMaxLoss += m.maxLoss;
    totalExposure += m.exposure;
  });
  const trueEquity = nav - totalMaxLoss;

  navEl.textContent = nav ? '$' + nav.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  tlEl.textContent = totalMaxLoss ? '−$' + totalMaxLoss.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '$0';
  trueEl.textContent = nav ? '$' + trueEquity.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  if (expEl) expEl.textContent = totalExposure ? '$' + totalExposure.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '$0';
  // Color the true equity vs nav
  if (nav && trueEquity < nav) trueEl.style.color = 'var(--danger)';
  else trueEl.style.color = 'var(--text)';

  const navInput = $('#teNavInput');
  if (navInput && document.activeElement !== navInput) navInput.value = nav || '';
}

/* -------- Closed-trade stats panel -------- */
function renderTradeStats() {
  const closed = S.trades.map(p => ({ p, m: posMetrics(p) })).filter(x => x.m.isClosed);
  // Date filter for stats also follows closedRange
  const filtered = closed.filter(({ p }) => isWithinRange(lastExecDate(p), closedRange));

  const wins = filtered.filter(x => x.m.realized > 0);
  const losses = filtered.filter(x => x.m.realized < 0);
  const total = filtered.length;
  const totalPnl = filtered.reduce((s, x) => s + x.m.realized, 0);
  const grossWin = wins.reduce((s, x) => s + x.m.realized, 0);
  const grossLoss = Math.abs(losses.reduce((s, x) => s + x.m.realized, 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const winRate = total ? wins.length / total : 0;
  const lossRate = total ? losses.length / total : 0;
  const expectancy = total ? (winRate * avgWin) - (lossRate * avgLoss) : 0;
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const rTrades = filtered.filter(x => x.m.R != null);
  const avgR = rTrades.length ? rTrades.reduce((s, x) => s + x.m.R, 0) / rTrades.length : null;

  const set = (id, v, color) => {
    const el = $('#' + id);
    if (!el) return;
    el.textContent = v;
    if (color) el.style.color = color;
  };
  set('tsWL', `${wins.length}/${losses.length}`);
  set('tsHit', total ? `${Math.round(winRate * 100)}%` : '—');
  set('tsPnl', total ? fmtPnl(totalPnl) : '—', totalPnl >= 0 ? 'var(--success)' : 'var(--danger)');
  set('tsAvgR', avgR == null ? '—' : (avgR >= 0 ? '+' : '') + avgR.toFixed(2) + 'R');
  set('tsPF', !total ? '—' : (pf === Infinity ? '∞' : pf.toFixed(2)));
  set('tsExp', !total ? '—' : (expectancy >= 0 ? '+$' : '−$') + Math.abs(expectancy).toFixed(2));
  set('tsAvgWin', wins.length ? '+$' + avgWin.toFixed(0) : '—', 'var(--success)');
  set('tsAvgLoss', losses.length ? '−$' + avgLoss.toFixed(0) : '—', 'var(--danger)');

  // Breakdown table by tag/theme/type
  const breakdown = $('#tsBreakdown');
  if (breakdown) {
    breakdown.innerHTML = '';
    const groupBy = (key) => {
      const groups = {};
      filtered.forEach(x => {
        const arr = key === 'tags' ? (x.p.tags && x.p.tags.length ? x.p.tags : ['untagged'])
                  : key === 'theme' ? [x.p.theme || 'untagged']
                  : [x.p.tradeType || 'swing'];
        arr.forEach(k => {
          (groups[k] = groups[k] || []).push(x);
        });
      });
      return groups;
    };
    const dim = ($('#tsDim') && $('#tsDim').value) || 'theme';
    const groups = groupBy(dim);
    const keys = Object.keys(groups).sort();
    if (keys.length === 0) {
      breakdown.appendChild(h('div', { class: 'trades-empty' }, 'No closed trades in this window.'));
    } else {
      breakdown.appendChild(h('div', { class: 'breakdown-head' },
        h('span', {}, dim === 'tags' ? 'Tag' : dim === 'theme' ? 'Theme' : 'Type'),
        h('span', {}, '#'),
        h('span', {}, 'Win%'),
        h('span', {}, 'Avg R'),
        h('span', {}, 'Expect'),
        h('span', {}, 'Net P/L')
      ));
      keys.forEach(k => {
        const arr = groups[k];
        const w = arr.filter(x => x.m.realized > 0).length;
        const l = arr.filter(x => x.m.realized < 0).length;
        const tot = arr.length;
        const wr = tot ? w / tot : 0;
        const lr = tot ? l / tot : 0;
        const pnl = arr.reduce((s, x) => s + x.m.realized, 0);
        const aw = w ? arr.filter(x => x.m.realized > 0).reduce((s, x) => s + x.m.realized, 0) / w : 0;
        const al = l ? Math.abs(arr.filter(x => x.m.realized < 0).reduce((s, x) => s + x.m.realized, 0)) / l : 0;
        const exp = (wr * aw) - (lr * al);
        const rArr = arr.filter(x => x.m.R != null);
        const ar = rArr.length ? rArr.reduce((s, x) => s + x.m.R, 0) / rArr.length : null;
        breakdown.appendChild(h('div', { class: 'breakdown-row' },
          h('span', { class: 'tr-tagchip' }, k),
          h('span', { class: 'tr-num' }, String(tot)),
          h('span', { class: 'tr-num' }, Math.round(wr * 100) + '%'),
          h('span', { class: 'tr-num' }, ar == null ? '—' : (ar >= 0 ? '+' : '') + ar.toFixed(2) + 'R'),
          h('span', { class: `tr-num ${pnlClass(exp)}` }, (exp >= 0 ? '+$' : '−$') + Math.abs(exp).toFixed(0)),
          h('span', { class: `tr-num ${pnlClass(pnl)}` }, fmtPnl(pnl))
        ));
      });
    }
  }
}

/* -------- Mutators -------- */
function addPosition(data) {
  // Creates a new position with first execution
  const action = data.side === 'short' ? 'sell' : 'buy';
  const exec = {
    id: uid(), action,
    qty: +data.qty, price: +data.price,
    date: data.date || todayKey(),
    fees: +data.fees || 0,
    note: ''
  };
  const pos = {
    id: uid(),
    symbol: (data.symbol || '').trim().toUpperCase(),
    market: data.market || 'stock',
    side: data.side || 'long',
    status: 'open',
    tradeType: data.tradeType || 'swing',
    theme: (data.theme || '').trim(),
    executions: [exec],
    stop: data.stop !== '' && data.stop != null ? +data.stop : null,
    target: data.target !== '' && data.target != null ? +data.target : null,
    tags: (data.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    notes: (data.notes || '').trim(),
    setup: data.setup || '',
    mood: data.mood || '',
    confidence: data.confidence ? +data.confidence : 3,
    createdAt: Date.now(),
  };
  S.trades.push(pos);
  saveState();
  renderTrades();
}

function addExecution(positionId, e) {
  const p = S.trades.find(x => x.id === positionId);
  if (!p) return;
  p.executions = p.executions || [];
  p.executions.push({
    id: uid(),
    action: e.action,
    qty: +e.qty,
    price: +e.price,
    date: e.date || todayKey(),
    fees: +e.fees || 0,
    note: e.note || ''
  });
  // Re-evaluate status
  const m = posMetrics(p);
  p.status = m.isClosed ? 'closed' : 'open';
  saveState();
  renderTrades();
}

function deleteExecution(positionId, execId) {
  const p = S.trades.find(x => x.id === positionId);
  if (!p) return;
  p.executions = (p.executions || []).filter(e => e.id !== execId);
  if (p.executions.length === 0) {
    if (confirm('No executions remain. Delete the entire position?')) {
      S.trades = S.trades.filter(x => x.id !== positionId);
    }
  }
  const m = posMetrics(p);
  p.status = m.isClosed ? 'closed' : 'open';
  saveState();
  renderTrades();
}

function updatePosition(positionId, patch) {
  const p = S.trades.find(x => x.id === positionId);
  if (!p) return;
  Object.assign(p, patch);
  saveState();
  renderTrades();
}

function deletePosition(id) {
  S.trades = S.trades.filter(t => t.id !== id);
  if (expandedTradeId === id) expandedTradeId = null;
  saveState();
  renderTrades();
}

function addPlan(data) {
  S.plans = S.plans || [];
  S.plans.push({
    id: uid(),
    symbol: (data.symbol || '').trim().toUpperCase(),
    market: data.market || 'stock',
    side: data.side || 'long',
    entry: +data.entry || 0,
    stop: +data.stop || 0,
    target: data.target ? +data.target : 0,
    riskAmt: +data.riskAmt || 0,
    tradeType: data.tradeType || 'swing',
    theme: (data.theme || '').trim(),
    tags: (data.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    notes: (data.notes || '').trim(),
    createdAt: Date.now(),
  });
  saveState();
  renderTrades();
}

function deletePlan(id) {
  S.plans = (S.plans || []).filter(p => p.id !== id);
  saveState();
  renderTrades();
}

function convertPlanToPosition(planId) {
  const pl = (S.plans || []).find(p => p.id === planId);
  if (!pl) return;
  const m = planMetrics(pl);
  const qty = m.shares;
  if (!qty) { alert('Cannot convert: plan needs entry, stop, and risk $ to compute share size.'); return; }
  // Pre-fill the new-position form with plan values + computed qty, scroll into view
  $('#trSymbol').value = pl.symbol;
  $('#trMarket').value = pl.market || 'stock';
  $('#trSide').value = pl.side || 'long';
  $('#trQty').value = qty;
  $('#trPrice').value = pl.entry;
  $('#trStop').value = pl.stop;
  $('#trTarget').value = pl.target || '';
  $('#trTheme').value = pl.theme || '';
  $('#trTradeType').value = pl.tradeType || 'swing';
  $('#trTags').value = (pl.tags || []).join(', ');
  $('#trNote').value = pl.notes || '';
  // Switch to open tab so user sees the form
  tradeTab = 'open';
  renderTrades();
  // Scroll the form into view
  setTimeout(() => {
    const el = $('#tradeAdd');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Highlight briefly
    if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); }
  }, 50);
  // Stash the plan id so we can delete it once the position is created
  window.__planToConsume = planId;
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
    trading: get('--primary'),                  // gold/legendary
    wealth: get('--rarity-legendary') || get('--primary'),
    learning: get('--accent'),
    health: get('--success'),
    reading: get('--warn'),
    linkedin: get('--info'),
    networking: get('--danger'),
    hobby: get('--rarity-magic') || get('--info'),
    soft: get('--surface-offset'),
    primary: get('--primary'),
    text: get('--text'),
    muted: get('--text-muted'),
  };
}

// ---------------- Theme toggle ----------------
function initTheme() {
  const savedTheme = (function () {
    try { return localStorage.getItem('meridian_theme') || 'dark'; } catch (_) { return 'dark'; }
  })();
  document.documentElement.setAttribute('data-theme', savedTheme);
  const btn = $('[data-theme-toggle]');
  const setIcon = (mode) => {
    btn.innerHTML = mode === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  };
  setIcon(savedTheme);
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('meridian_theme', next); } catch (_) {}
    setIcon(next);
    // Redraw charts with theme colors
    renderKPIs();
    renderEquity();
  });
}

// ---------------- Skin picker (Diablo / D&D / Castlevania / EVA) ----------------
function initSkin() {
  const VALID = ['diablo', 'dnd', 'castlevania', 'eva'];
  const saved = (function () {
    try {
      const s = localStorage.getItem('meridian_skin');
      return VALID.indexOf(s) >= 0 ? s : 'diablo';
    } catch (_) { return 'diablo'; }
  })();
  const apply = (skin) => {
    if (skin === 'diablo') {
      document.documentElement.removeAttribute('data-skin');
    } else {
      document.documentElement.setAttribute('data-skin', skin);
    }
    $$('.skin-opt').forEach(b => {
      const on = b.dataset.skinOpt === skin;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    try { localStorage.setItem('meridian_skin', skin); } catch (_) {}
    // Redraw color-dependent charts
    if (typeof renderKPIs === 'function') renderKPIs();
    if (typeof renderEquity === 'function') renderEquity();
    if (typeof renderTracks === 'function') renderTracks();
    if (typeof renderSkills === 'function') renderSkills();
  };
  apply(saved);
  $$('.skin-opt').forEach(b => {
    b.addEventListener('click', () => apply(b.dataset.skinOpt));
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
const DEFAULT_QUOTES = [
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

function getQuotes() {
  return Array.isArray(S.quotes) && S.quotes.length ? S.quotes : DEFAULT_QUOTES;
}

function pickQuoteForToday() {
  const list = getQuotes();
  if (!list.length) return '—';
  const day = new Date().getDate();
  return list[day % list.length];
}

function setQuote() {
  const text = pickQuoteForToday();
  const footer = $('#footerQuote'); if (footer) footer.textContent = text;
  const today = $('#quoteToday'); if (today) today.textContent = text;
}

function renderQuotes() {
  setQuote();
  const list = $('#quotesList');
  if (!list) return;
  list.innerHTML = '';
  const quotes = getQuotes();
  $('#quotesCount').textContent = quotes.length;
  const todayIdx = new Date().getDate() % quotes.length;
  if (S.quotes === null) {
    list.appendChild(h('div', { class: 'quotes-hint' }, 'Showing the default mantras. Add or remove any to start your own rotation.'));
  }
  quotes.forEach((q, i) => {
    const isToday = i === todayIdx;
    const row = h('div', { class: 'quote-row' + (isToday ? ' today' : '') },
      h('span', { class: 'quote-rune' }, isToday ? '❁' : '•'),
      h('div', { class: 'quote-text', contenteditable: 'true', spellcheck: 'false', onBlur: (e) => editQuote(i, e.target.textContent.trim()) }, q),
      h('button', { class: 'quote-del', title: 'Remove', onClick: () => deleteQuote(i) }, '✕'),
    );
    list.appendChild(row);
  });
}

function ensureCustomQuotes() {
  if (!Array.isArray(S.quotes)) S.quotes = DEFAULT_QUOTES.slice();
}

function addQuote(text) {
  if (!text) return;
  ensureCustomQuotes();
  S.quotes.push(text);
  saveState();
  renderQuotes();
}
function editQuote(i, text) {
  ensureCustomQuotes();
  if (!text) { S.quotes.splice(i, 1); }
  else { S.quotes[i] = text; }
  saveState();
  renderQuotes();
}
function deleteQuote(i) {
  ensureCustomQuotes();
  S.quotes.splice(i, 1);
  saveState();
  renderQuotes();
}
function restoreDefaultQuotes() {
  S.quotes = null;
  saveState();
  renderQuotes();
}

function wireQuotes() {
  const form = $('#quoteAdd');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#quoteText');
    const text = inp.value.trim();
    if (!text) return;
    addQuote(text);
    inp.value = '';
  });
  const reset = $('#quotesReset');
  if (reset) reset.addEventListener('click', () => {
    if (confirm('Restore the default mantras? Your custom additions will be cleared.')) restoreDefaultQuotes();
  });
}

// ---------------- Skills (Codex) ----------------
const SKILL_CATEGORY_LABEL = {
  finance: 'Finance',
  tech: 'Tech',
  business: 'Business',
  creative: 'Creative',
  wellness: 'Wellness',
  language: 'Language',
  other: 'Other',
};
const SKILL_LEVEL_LABEL = ['Untrained', 'Apprentice', 'Journeyman', 'Adept', 'Master', 'Grandmaster'];

function renderSkillTaskOption() {
  const sel = $('#taskSkill');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— No skill —</option>';
  S.skills.slice().sort((a,b) => a.name.localeCompare(b.name)).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `◈ ${s.name}`;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

function skillXp(skillId) {
  return S.tasks.filter(t => t.skillId === skillId && t.done).length;
}

function renderSkills() {
  renderSkillTaskOption();
  const grid = $('#skillsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  $('#skillsCount').textContent = S.skills.length;
  let totalXp = 0;
  if (S.skills.length === 0) {
    grid.appendChild(h('div', { class: 'skills-empty' },
      'No skills inscribed yet. Add skills like Accounting, ESG, AI Agent, Cybersecurity, or Tarot — then link tasks to them to track XP.'));
    $('#skillsXp').textContent = 0;
    return;
  }
  const sorted = S.skills.slice().sort((a,b) => skillXp(b.id) - skillXp(a.id) || (b.level||0) - (a.level||0));
  sorted.forEach(s => {
    const xp = skillXp(s.id);
    totalXp += xp;
    const linked = S.tasks.filter(t => t.skillId === s.id).length;
    const card = h('div', { class: `skill-card cat-${s.category||'other'}`, data: { id: s.id } },
      h('div', { class: 'skill-head' },
        h('div', { class: 'skill-name' }, s.name),
        h('button', { class: 'skill-del', title: 'Remove', onClick: () => deleteSkill(s.id) }, '✕')
      ),
      h('div', { class: 'skill-meta' },
        h('span', { class: 'skill-cat' }, SKILL_CATEGORY_LABEL[s.category] || 'Other'),
        h('span', { class: 'skill-level', data: { level: s.level || 0 } },
          ...Array.from({ length: 5 }, (_, i) => h('span', { class: 'pip' + (i < (s.level||0) ? ' on' : '') })),
          h('span', { class: 'lvl-text' }, SKILL_LEVEL_LABEL[s.level || 0])
        )
      ),
      h('div', { class: 'skill-xp' },
        h('span', { class: 'xp-num' }, String(xp)),
        h('span', { class: 'xp-label' }, 'XP'),
        h('span', { class: 'xp-sub' }, `· ${linked} task${linked===1?'':'s'} linked`)
      ),
      s.note ? h('div', { class: 'skill-note' }, s.note) : null,
      h('div', { class: 'skill-actions' },
        h('button', { class: 'btn-ghost btn-tiny', onClick: () => bumpSkillLevel(s.id, -1) }, '−'),
        h('button', { class: 'btn-ghost btn-tiny', onClick: () => bumpSkillLevel(s.id, +1) }, '+'),
      )
    );
    grid.appendChild(card);
  });
  $('#skillsXp').textContent = totalXp;
}

function addSkill(data) {
  S.skills.push({
    id: 'sk_' + uid(),
    name: data.name.trim(),
    category: data.category || 'other',
    level: parseInt(data.level || 1, 10),
    note: (data.note || '').trim(),
    createdAt: Date.now(),
  });
  saveState();
  renderSkills();
}
function deleteSkill(id) {
  if (!confirm('Remove this skill? Tasks linked to it will become unlinked.')) return;
  S.skills = S.skills.filter(s => s.id !== id);
  S.tasks.forEach(t => { if (t.skillId === id) t.skillId = null; });
  saveState();
  renderSkills();
  renderTracks();
}
function bumpSkillLevel(id, delta) {
  const s = S.skills.find(x => x.id === id);
  if (!s) return;
  s.level = Math.max(0, Math.min(5, (s.level || 0) + delta));
  saveState();
  renderSkills();
}
function wireSkills() {
  const form = $('#skillAdd');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#skillName').value.trim();
    if (!name) return;
    addSkill({
      name,
      category: $('#skillCategory').value,
      level: $('#skillLevel').value,
      note: $('#skillNote').value,
    });
    $('#skillName').value = '';
    $('#skillNote').value = '';
  });
}

// ---------------- Reading list (Tome) ----------------
let bookFilter = 'all';
const BOOK_STATUS_LABEL = { queue: 'Queue', reading: 'Reading', done: 'Conquered' };

function renderBooks() {
  const list = $('#booksList');
  if (!list) return;
  list.innerHTML = '';
  const counts = { reading: 0, queue: 0, done: 0 };
  S.books.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });
  $('#booksReading').textContent = counts.reading || 0;
  $('#booksQueue').textContent = counts.queue || 0;
  $('#booksDone').textContent = counts.done || 0;

  let items = S.books.slice();
  if (bookFilter !== 'all') items = items.filter(b => b.status === bookFilter);
  // sort: reading > queue > done; within each by createdAt desc
  const order = { reading: 0, queue: 1, done: 2 };
  items.sort((a, b) => (order[a.status] - order[b.status]) || (b.createdAt - a.createdAt));

  if (items.length === 0) {
    list.appendChild(h('div', { class: 'books-empty' }, 'No books here yet — add one above to begin the tome.'));
    return;
  }
  items.forEach(b => list.appendChild(renderBookRow(b)));
}
function renderBookRow(b) {
  const progress = Math.max(0, Math.min(100, parseInt(b.progress || 0, 10)));
  const stars = '✯'.repeat(Math.max(0, Math.min(5, parseInt(b.rating || 0, 10))));
  return h('div', { class: `book-row status-${b.status}`, data: { id: b.id } },
    h('div', { class: 'book-cover' }, h('span', { class: 'book-glyph' }, b.title.charAt(0).toUpperCase() || '❦')),
    h('div', { class: 'book-main' },
      h('div', { class: 'book-title' }, b.title),
      h('div', { class: 'book-author' }, b.author || 'Unknown author'),
      h('div', { class: 'book-progress' },
        h('div', { class: 'bp-bar' }, h('div', { class: 'bp-fill', style: `width: ${progress}%` })),
        h('span', { class: 'bp-pct' }, progress + '%')
      ),
      b.notes ? h('div', { class: 'book-notes' }, b.notes) : null
    ),
    h('div', { class: 'book-side' },
      h('select', { class: 'book-status-sel', onChange: (e) => updateBook(b.id, { status: e.target.value }) },
        ...['queue','reading','done'].map(v => {
          const o = document.createElement('option');
          o.value = v; o.textContent = BOOK_STATUS_LABEL[v];
          if (v === b.status) o.selected = true;
          return o;
        })
      ),
      stars ? h('div', { class: 'book-rating' }, stars) : null,
      h('div', { class: 'book-dates' },
        b.started ? h('span', {}, 'started ' + b.started) : null,
        b.finished ? h('span', {}, 'finished ' + b.finished) : null,
      ),
      h('button', { class: 'book-del', title: 'Remove', onClick: () => deleteBook(b.id) }, '✕')
    )
  );
}
function addBook(data) {
  const today = todayKey();
  S.books.push({
    id: 'bk_' + uid(),
    title: data.title.trim(),
    author: (data.author || '').trim(),
    status: data.status || 'queue',
    progress: parseInt(data.progress || 0, 10) || 0,
    rating: parseInt(data.rating || 0, 10) || 0,
    started: data.status === 'reading' ? today : null,
    finished: data.status === 'done' ? today : null,
    notes: '',
    createdAt: Date.now(),
  });
  saveState();
  renderBooks();
}
function updateBook(id, patch) {
  const b = S.books.find(x => x.id === id);
  if (!b) return;
  Object.assign(b, patch);
  // Auto-set dates on status change
  if (patch.status === 'reading' && !b.started) b.started = todayKey();
  if (patch.status === 'done' && !b.finished) { b.finished = todayKey(); b.progress = 100; }
  saveState();
  renderBooks();
}
function deleteBook(id) {
  S.books = S.books.filter(b => b.id !== id);
  saveState();
  renderBooks();
}
function wireBooks() {
  const form = $('#bookAdd');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#bookTitle').value.trim();
    if (!title) return;
    addBook({
      title,
      author: $('#bookAuthor').value,
      status: $('#bookStatus').value,
      progress: $('#bookProgress').value,
      rating: $('#bookRating').value,
    });
    $('#bookTitle').value = '';
    $('#bookAuthor').value = '';
    $('#bookProgress').value = '';
    $('#bookRating').value = '';
  });
  $$('[data-book-filter]').forEach(p => {
    p.addEventListener('click', () => {
      $$('[data-book-filter]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      bookFilter = p.dataset.bookFilter;
      renderBooks();
    });
  });
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
  // Theme + Skin
  initTheme();
  initSkin();

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
    const skillSel = $('#taskSkill');
    addTask({
      title,
      track: $('#taskTrack').value,
      priority: $('#taskPriority').value,
      due: $('#taskDue').value,
      skillId: skillSel ? (skillSel.value || null) : null,
    });
    $('#taskTitle').value = '';
    $('#taskDue').value = '';
    if (skillSel) skillSel.value = '';
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

  // ---- Trade Journal: tabs ----
  $$('[data-trade-tab]').forEach(b => {
    b.addEventListener('click', () => {
      tradeTab = b.dataset.tradeTab;
      renderTrades();
    });
  });

  // ---- New position form (also accepts pre-filled values from plan conversion) ----
  const newPosForm = $('#tradeAdd');
  if (newPosForm) newPosForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const symbol = $('#trSymbol').value.trim();
    if (!symbol) return;
    addPosition({
      symbol,
      market: $('#trMarket').value,
      side: $('#trSide').value,
      tradeType: $('#trTradeType').value,
      theme: $('#trTheme').value,
      qty: $('#trQty').value,
      price: $('#trPrice').value,
      date: $('#trDate').value,
      fees: $('#trFees').value,
      stop: $('#trStop').value,
      target: $('#trTarget').value,
      tags: $('#trTags').value,
      notes: $('#trNote').value,
    });
    // If this came from a plan conversion, consume the plan now
    if (window.__planToConsume) {
      deletePlan(window.__planToConsume);
      window.__planToConsume = null;
    }
    // Reset entry-specific fields
    ['#trSymbol','#trQty','#trPrice','#trStop','#trTarget','#trFees','#trTags','#trNote','#trTheme']
      .forEach(s => { const el = $(s); if (el) el.value = ''; });
    $('#trDate').value = todayKey();
    if ($('#trPositionPreview')) $('#trPositionPreview').textContent = 'Cost basis — · Risk — · R/R —';
  });

  // Live preview for new-position form
  const updatePositionPreview = () => {
    const qty = parseFloat($('#trQty').value);
    const price = parseFloat($('#trPrice').value);
    const stop = parseFloat($('#trStop').value);
    const target = parseFloat($('#trTarget').value);
    const sideMul = $('#trSide').value === 'short' ? -1 : 1;
    let cost = '—', risk = '—', rr = '—';
    if (!isNaN(qty) && !isNaN(price)) cost = '$' + (qty * price).toFixed(0);
    if (!isNaN(qty) && !isNaN(price) && !isNaN(stop) && price !== stop) {
      risk = '−$' + (Math.abs(price - stop) * qty).toFixed(0);
    }
    if (!isNaN(price) && !isNaN(stop) && !isNaN(target) && price !== stop) {
      rr = (Math.abs(target - price) / Math.abs(price - stop)).toFixed(2);
    }
    if ($('#trPositionPreview')) $('#trPositionPreview').textContent = `Cost ${cost} · Risk ${risk} · R/R ${rr}`;
  };
  ['#trQty','#trPrice','#trStop','#trTarget','#trSide'].forEach(sel => {
    const el = $(sel);
    if (el) {
      el.addEventListener('input', updatePositionPreview);
      if (el.tagName === 'SELECT') el.addEventListener('change', updatePositionPreview);
    }
  });
  // default date
  if ($('#trDate') && !$('#trDate').value) $('#trDate').value = todayKey();

  // ---- Battle Plan form ----
  const planForm = $('#planAdd');
  if (planForm) planForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const symbol = $('#plSymbol').value.trim();
    if (!symbol) return;
    addPlan({
      symbol,
      market: $('#plMarket').value,
      side: $('#plSide').value,
      entry: $('#plEntry').value,
      stop: $('#plStop').value,
      target: $('#plTarget').value,
      riskAmt: $('#plRisk').value,
      tradeType: $('#plTradeType').value,
      theme: $('#plTheme').value,
      tags: $('#plTags').value,
      notes: $('#plNote').value,
    });
    ['#plSymbol','#plEntry','#plStop','#plTarget','#plRisk','#plTags','#plNote','#plTheme']
      .forEach(s => { const el = $(s); if (el) el.value = ''; });
    if ($('#plPreview')) $('#plPreview').textContent = 'Shares — · R/R — · Max loss —';
  });
  // Plan live preview
  const updatePlanPreview = () => {
    const entry = parseFloat($('#plEntry').value);
    const stop = parseFloat($('#plStop').value);
    const target = parseFloat($('#plTarget').value);
    const risk = parseFloat($('#plRisk').value);
    let shares = '—', rr = '—', ml = '—';
    if (!isNaN(entry) && !isNaN(stop) && entry !== stop && !isNaN(risk) && risk > 0) {
      const ps = Math.abs(entry - stop);
      const sh = Math.floor(risk / ps);
      shares = String(sh);
      ml = '−$' + (ps * sh).toFixed(0);
    }
    if (!isNaN(entry) && !isNaN(stop) && !isNaN(target) && entry !== stop) {
      rr = (Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(2);
    }
    if ($('#plPreview')) $('#plPreview').textContent = `Shares ${shares} · R/R ${rr} · Max loss ${ml}`;
  };
  ['#plEntry','#plStop','#plTarget','#plRisk'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('input', updatePlanPreview);
  });

  // ---- Filters ----
  $$('[data-trade-filter]').forEach(p => {
    p.addEventListener('click', () => {
      $$('[data-trade-filter]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      tradeFilter = p.dataset.tradeFilter;
      renderTrades();
    });
  });
  $$('[data-closed-range]').forEach(p => {
    p.addEventListener('click', () => {
      $$('[data-closed-range]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      closedRange = p.dataset.closedRange;
      renderTrades();
    });
  });
  const tsDim = $('#tsDim');
  if (tsDim) tsDim.addEventListener('change', renderTrades);

  // ---- Trade search ----
  const trSearch = $('#trSearch');
  if (trSearch) trSearch.addEventListener('input', () => {
    tradeSearch = trSearch.value.trim();
    renderTrades();
  });

  // ---- True Equity NAV input ----
  const navInput = $('#teNavInput');
  if (navInput) navInput.addEventListener('input', () => {
    const v = parseFloat(navInput.value);
    S.equity.nav = isNaN(v) ? 0 : v;
    saveState();
    renderTrueEquity();
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
  renderSkills();
  renderBooks();
  renderQuotes();
  renderKPIs();
  renderInbox();
  renderProjects();
  renderReview();
  renderNotes();
}

/* ============================================================
   SECOND-BRAIN LAYER — Inbox, Projects, Weekly Review, Notes Vault
   Inspired by Notion's Second Brain 6.2 (PARA + GTD)
   ============================================================ */

/* ---- ISO week helpers ---- */
function isoWeekKey(d) {
  // Returns 'YYYY-Www' (ISO 8601 week-of-year)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(weekNum)}`;
}
function weekRange(weekKey) {
  // Returns { start: Date (Mon), end: Date (Sun), label: 'Mon DD – Sun DD' }
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return null;
  const year = +m[1], week = +m[2];
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return { start: monday, end: sunday, label: `${fmt(monday)} – ${fmt(sunday)}` };
}

/* -------- INBOX (capture lane) -------- */
function renderInbox() {
  const list = $('#captureList');
  if (!list) return;
  list.innerHTML = '';
  if (!S.inbox.length) {
    list.innerHTML = '<div class="capture-empty">Captures route into Tasks, Ideas, Plans, or Notes.</div>';
    return;
  }
  // Newest first, max 6 visible
  S.inbox.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 6).forEach(item => {
    const row = document.createElement('div');
    row.className = 'capture-row';
    const text = document.createElement('span');
    text.className = 'capture-text';
    text.textContent = item.text;
    row.appendChild(text);
    const acts = document.createElement('div');
    acts.className = 'capture-actions';
    const routes = [
      { k: 'task', label: '→ Task' },
      { k: 'idea', label: '→ Idea' },
      { k: 'plan', label: '→ Plan' },
      { k: 'note', label: '→ Note' },
      { k: 'discard', label: '✕' },
    ];
    routes.forEach(r => {
      const b = document.createElement('button');
      b.className = 'capture-act' + (r.k === 'discard' ? ' discard' : '');
      b.textContent = r.label;
      b.title = r.k === 'discard' ? 'Discard' : `Route to ${r.k}`;
      b.addEventListener('click', () => triageInbox(item.id, r.k));
      acts.appendChild(b);
    });
    row.appendChild(acts);
    list.appendChild(row);
  });
  if (S.inbox.length > 6) {
    const more = document.createElement('div');
    more.className = 'capture-more';
    more.textContent = `+${S.inbox.length - 6} more in inbox`;
    list.appendChild(more);
  }
}
function addInbox(text) {
  const t = (text || '').trim();
  if (!t) return;
  S.inbox.push({ id: uid(), text: t, createdAt: Date.now() });
  saveState();
  renderInbox();
}
function triageInbox(id, route) {
  const item = S.inbox.find(x => x.id === id);
  if (!item) return;
  if (route === 'task') {
    addTask({ title: item.text, track: 'business', priority: 2, due: '' });
  } else if (route === 'idea') {
    S.notes.push({
      id: uid(),
      title: item.text.slice(0, 60),
      body: item.text,
      tags: ['idea', 'inbox'],
      linkedSymbol: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    renderNotes();
  } else if (route === 'plan') {
    // Pre-fill battle-plan symbol field from text (first all-caps token if any)
    const sym = (item.text.match(/[A-Z]{2,6}/) || [''])[0];
    addPlan({ symbol: sym, market: 'stock', side: 'long', notes: item.text });
    renderTrades();
  } else if (route === 'note') {
    S.notes.push({
      id: uid(),
      title: item.text.slice(0, 60),
      body: item.text,
      tags: ['note'],
      linkedSymbol: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    renderNotes();
  }
  // Always remove from inbox after triage (or discard)
  S.inbox = S.inbox.filter(x => x.id !== id);
  saveState();
  renderInbox();
}
function wireInbox() {
  const inp = $('#captureInput');
  if (!inp) return;
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addInbox(inp.value);
      inp.value = '';
    }
  });
}

/* -------- PROJECTS -------- */
function renderProjects() {
  const list = $('#projectList');
  if (!list) return;
  list.innerHTML = '';
  if (!S.projects.length) {
    list.innerHTML = '<div class="empty-block">No projects yet. Forge one above to start grouping tasks.</div>';
    return;
  }
  // Sort: active first, then by deadline
  const sorted = S.projects.slice().sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    return (a.deadline || 'z').localeCompare(b.deadline || 'z');
  });
  sorted.forEach(p => {
    const row = document.createElement('div');
    row.className = 'project-row' + (p.status === 'done' ? ' done' : '');
    // Progress: % of linked tasks done
    const linked = S.tasks.filter(t => t.projectId === p.id);
    const doneCount = linked.filter(t => t.done).length;
    const pct = linked.length ? Math.round((doneCount / linked.length) * 100) : 0;
    const daysLeft = p.deadline ? Math.ceil((new Date(p.deadline) - new Date()) / 86400000) : null;
    const dlClass = daysLeft != null ? (daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'soon' : '') : '';
    row.innerHTML = `
      <div class="proj-main">
        <div class="proj-head">
          <span class="proj-name">${escapeHtml(p.name)}</span>
          ${p.area ? `<span class="proj-area">${escapeHtml(p.area)}</span>` : ''}
          ${p.deadline ? `<span class="proj-deadline ${dlClass}">${p.deadline}${daysLeft != null && daysLeft >= 0 ? ` · ${daysLeft}d` : daysLeft != null ? ` · ${-daysLeft}d overdue` : ''}</span>` : ''}
        </div>
        ${p.goal ? `<div class="proj-goal">${escapeHtml(p.goal)}</div>` : ''}
        <div class="proj-progress">
          <div class="proj-bar"><div class="proj-bar-fill" style="width:${pct}%"></div></div>
          <span class="proj-pct">${pct}% · ${doneCount}/${linked.length} tasks</span>
        </div>
      </div>
      <div class="proj-actions">
        <button class="btn-ghost mini" data-toggle="${p.id}">${p.status === 'done' ? 'Reopen' : 'Mark done'}</button>
        <button class="btn-ghost mini danger" data-del="${p.id}">Delete</button>
      </div>
    `;
    row.querySelector(`[data-toggle="${p.id}"]`).addEventListener('click', () => {
      p.status = p.status === 'done' ? 'active' : 'done';
      saveState();
      renderProjects();
    });
    row.querySelector(`[data-del="${p.id}"]`).addEventListener('click', () => {
      if (!confirm(`Delete project "${p.name}"? Linked tasks stay.`)) return;
      S.projects = S.projects.filter(x => x.id !== p.id);
      // Detach tasks
      S.tasks.forEach(t => { if (t.projectId === p.id) t.projectId = null; });
      saveState();
      renderProjects();
      renderTracks();
    });
    list.appendChild(row);
  });
}
function addProject(data) {
  S.projects.push({
    id: uid(),
    name: data.name,
    goal: data.goal || '',
    deadline: data.deadline || '',
    area: data.area || '',
    status: 'active',
    createdAt: Date.now(),
  });
  saveState();
  renderProjects();
}
function wireProjects() {
  const f = $('#projectAdd');
  if (!f) return;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#projName').value.trim();
    if (!name) return;
    addProject({
      name,
      goal: $('#projGoal').value.trim(),
      deadline: $('#projDeadline').value,
      area: $('#projArea').value,
    });
    f.reset();
  });
}

/* -------- WEEKLY REVIEW -------- */
let rvOffset = 0; // 0 = current week, -1 = last week, etc.
function currentRvWeekKey() {
  const d = new Date();
  d.setDate(d.getDate() + rvOffset * 7);
  return isoWeekKey(d);
}
function renderReview() {
  const wk = currentRvWeekKey();
  const range = weekRange(wk);
  const lbl = $('#rvWeekLabel');
  if (lbl) lbl.textContent = range ? `${wk} · ${range.label}${rvOffset === 0 ? ' · this week' : ''}` : wk;
  const data = S.reviews[wk] || {};
  ['Wins', 'Losses', 'Lessons', 'Next'].forEach(k => {
    const el = $(`#rv${k}`);
    if (el) el.value = data[k.toLowerCase()] || '';
  });
  // Auto-rolled metrics: trades, win rate, avg R, habit %, tasks done
  const rolled = $('#reviewRolled');
  if (!rolled) return;
  const r = computeReviewRollups(wk);
  rolled.innerHTML = `
    <div class="rv-stat"><div class="rv-lbl">Trades</div><div class="rv-val">${r.tradeCount}</div></div>
    <div class="rv-stat"><div class="rv-lbl">Win rate</div><div class="rv-val">${r.winRate != null ? r.winRate + '%' : '—'}</div></div>
    <div class="rv-stat"><div class="rv-lbl">Avg R</div><div class="rv-val ${r.avgR > 0 ? 'pos' : r.avgR < 0 ? 'neg' : ''}">${r.avgR != null ? (r.avgR > 0 ? '+' : '') + r.avgR.toFixed(2) + 'R' : '—'}</div></div>
    <div class="rv-stat"><div class="rv-lbl">Tasks done</div><div class="rv-val">${r.tasksDone}/${r.tasksTotal}</div></div>
    <div class="rv-stat"><div class="rv-lbl">Habit %</div><div class="rv-val">${r.habitPct}%</div></div>
    <div class="rv-stat"><div class="rv-lbl">Journal days</div><div class="rv-val">${r.journalDays}/7</div></div>
  `;
}
function computeReviewRollups(weekKey) {
  const range = weekRange(weekKey);
  const out = { tradeCount: 0, winRate: null, avgR: null, tasksDone: 0, tasksTotal: 0, habitPct: 0, journalDays: 0 };
  if (!range) return out;
  const start = range.start.getTime();
  const end = range.end.getTime() + 86400000; // include Sunday
  // Closed trades whose last execution falls in the week
  const closedThisWeek = (S.trades || []).filter(p => p.status === 'closed' && (p.executions || []).length).filter(p => {
    const last = p.executions.slice().sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1).pop();
    if (!last || !last.date) return false;
    const t = new Date(last.date).getTime();
    return t >= start && t < end;
  });
  out.tradeCount = closedThisWeek.length;
  if (closedThisWeek.length) {
    let wins = 0, rSum = 0, rN = 0;
    closedThisWeek.forEach(p => {
      const m = posMetrics(p);
      if (m.realized > 0) wins++;
      if (m.R != null && isFinite(m.R)) { rSum += m.R; rN++; }
    });
    out.winRate = Math.round((wins / closedThisWeek.length) * 100);
    out.avgR = rN ? rSum / rN : null;
  }
  // Tasks: done flag + due-or-created within week (best-effort)
  const taskInWeek = (S.tasks || []).filter(t => {
    const ref = t.due ? new Date(t.due).getTime() : t.createdAt;
    return ref >= start && ref < end;
  });
  out.tasksTotal = taskInWeek.length;
  out.tasksDone = taskInWeek.filter(t => t.done).length;
  // Habits: total possible ticks over 7 days
  const dayKeys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(range.start);
    d.setUTCDate(d.getUTCDate() + i);
    dayKeys.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`);
  }
  if (S.habits.length) {
    let hits = 0, total = 0;
    S.habits.forEach(h => {
      dayKeys.forEach(dk => {
        total++;
        if (h.log && h.log[dk]) hits++;
      });
    });
    out.habitPct = total ? Math.round((hits / total) * 100) : 0;
  }
  // Journal: count days with any entry text
  out.journalDays = dayKeys.filter(dk => {
    const e = S.journals[dk] || {};
    return (e.wins || e.lessons || e.tomorrow || '').trim().length > 0;
  }).length;
  return out;
}
function wireReview() {
  ['Wins', 'Losses', 'Lessons', 'Next'].forEach(k => {
    const el = $(`#rv${k}`);
    if (!el) return;
    el.addEventListener('input', () => {
      const wk = currentRvWeekKey();
      if (!S.reviews[wk]) S.reviews[wk] = {};
      S.reviews[wk][k.toLowerCase()] = el.value;
      saveState();
    });
  });
  const prev = $('#rvPrev'), next = $('#rvNext');
  if (prev) prev.addEventListener('click', () => { rvOffset--; renderReview(); });
  if (next) next.addEventListener('click', () => { if (rvOffset < 0) { rvOffset++; renderReview(); } });
  const carry = $('#rvCarryBtn');
  if (carry) carry.addEventListener('click', () => {
    const next = $('#rvNext').value || '';
    const lines = next.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) { alert('Write at least one line in "Next week" first.'); return; }
    if (!confirm(`Convert ${lines.length} line(s) into tasks (track: business, priority: high)?`)) return;
    lines.forEach(line => addTask({ title: line, track: 'business', priority: 1, due: '' }));
    alert(`${lines.length} task(s) added. Find them in Task tracks.`);
  });
}

/* -------- NOTES VAULT -------- */
let notesQuery = '';
function renderNotes() {
  const list = $('#notesList');
  if (!list) return;
  list.innerHTML = '';
  const q = notesQuery.toLowerCase();
  const matches = S.notes.filter(n => {
    if (!q) return true;
    return (n.title + ' ' + n.body + ' ' + (n.tags || []).join(' ') + ' ' + (n.linkedSymbol || '')).toLowerCase().includes(q);
  }).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  if (!matches.length) {
    list.innerHTML = `<div class="empty-block">${q ? 'No notes match "' + escapeHtml(q) + '".' : 'No notes yet. Inscribe your first thesis.'}</div>`;
    return;
  }
  matches.forEach(n => {
    const card = document.createElement('div');
    card.className = 'note-card';
    const tagsHtml = (n.tags || []).map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('');
    const dateStr = new Date(n.updatedAt || n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    card.innerHTML = `
      <div class="note-head">
        <div class="note-title">${escapeHtml(n.title)}</div>
        <div class="note-meta">
          ${n.linkedSymbol ? `<span class="note-symbol">${escapeHtml(n.linkedSymbol)}</span>` : ''}
          <span class="note-date">${dateStr}</span>
          <button class="note-del" data-del="${n.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="note-body">${escapeHtml(n.body).replace(/\n/g, '<br>')}</div>
      ${tagsHtml ? `<div class="note-tags">${tagsHtml}</div>` : ''}
    `;
    card.querySelector(`[data-del="${n.id}"]`).addEventListener('click', () => {
      if (!confirm('Delete this note?')) return;
      S.notes = S.notes.filter(x => x.id !== n.id);
      saveState();
      renderNotes();
    });
    list.appendChild(card);
  });
}
function addNote(data) {
  S.notes.push({
    id: uid(),
    title: data.title,
    body: data.body,
    tags: (data.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    linkedSymbol: (data.linkedSymbol || '').trim().toUpperCase(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  saveState();
  renderNotes();
}
function wireNotes() {
  const f = $('#noteAdd');
  if (!f) return;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#noteTitle').value.trim();
    const body = $('#noteBody').value.trim();
    if (!title || !body) return;
    addNote({
      title,
      body,
      tags: $('#noteTags').value,
      linkedSymbol: $('#noteSymbol').value,
    });
    f.reset();
  });
  const search = $('#notesSearch');
  if (search) search.addEventListener('input', () => {
    notesQuery = search.value.trim();
    renderNotes();
  });
}

/* -------- QUICK-ACTION TOOLBAR -------- */
function wireQuickActions() {
  $$('.qa-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.qa;
      const targets = {
        task:    '#taskTitle',
        plan:    '#plSymbol',
        habit:   '#habitName',
        journal: '[data-j="wins"]',
        idea:    '#noteTitle',
        reading: '#bookTitle',
      };
      const sel = targets[action];
      if (!sel) return;
      const el = document.querySelector(sel);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Switch trade tab if needed
      if (action === 'plan') {
        const planTab = document.querySelector('[data-trade-tab="plan"]');
        if (planTab) planTab.click();
      }
      setTimeout(() => { try { el.focus(); } catch (e) {} }, 400);
    });
  });
}

/* -------- HTML escape helper -------- */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ---------------- Init ----------------
function init() {
  loadState();
  wireEvents();
  wireHandbook();
  wireSubscriptions();
  wireSkills();
  wireBooks();
  wireQuotes();
  wireInbox();
  wireProjects();
  wireReview();
  wireNotes();
  wireQuickActions();
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
