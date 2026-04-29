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
  trades: [],         // { id, symbol, side, pnl, note, date }
  journals: {},       // { 'YYYY-MM-DD': { wins, lessons, tomorrow } }
  streak: { count: 0, lastActive: null },
  lastSaved: null,
});

let S = defaultState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) S = { ...defaultState(), ...JSON.parse(raw) };
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

// ---------------- Trades ----------------
function renderTrades() {
  const ul = $('#trades');
  ul.innerHTML = '';
  const trades = S.trades.slice().sort((a, b) => b.date - a.date);
  trades.forEach(t => {
    const li = h('li', { class: 'trade' },
      h('span', { class: 'tr-sym' }, t.symbol.toUpperCase()),
      h('span', { class: `tr-side ${t.side}` }, t.side),
      h('span', { class: `tr-pnl ${t.pnl >= 0 ? 'pos' : 'neg'}` }, (t.pnl >= 0 ? '+' : '') + '$' + t.pnl.toFixed(2)),
      h('span', { class: 'tr-note' }, t.note || '—'),
      h('span', { class: 'tr-date' }, new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      h('button', { class: 'tr-del', onClick: () => deleteTrade(t.id) }, '✕')
    );
    ul.appendChild(li);
  });

  const wins = S.trades.filter(t => t.pnl > 0).length;
  const losses = S.trades.filter(t => t.pnl < 0).length;
  const total = wins + losses;
  const pnl = S.trades.reduce((s, t) => s + t.pnl, 0);
  $('#tsWL').textContent = `${wins}/${losses}`;
  $('#tsHit').textContent = total ? `${Math.round(wins/total*100)}%` : '—';
  const pnlEl = $('#tsPnl');
  pnlEl.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
  pnlEl.style.color = pnl >= 0 ? 'var(--success)' : 'var(--danger)';
}

function addTrade(data) {
  S.trades.push({ id: uid(), ...data, date: Date.now() });
  saveState();
  renderTrades();
}

function deleteTrade(id) {
  S.trades = S.trades.filter(t => t.id !== id);
  saveState();
  renderTrades();
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
    // Redraw chart with theme colors
    renderKPIs();
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

  // Trades
  $('#tradeAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const symbol = $('#trSymbol').value.trim();
    if (!symbol) return;
    addTrade({
      symbol,
      side: $('#trSide').value,
      pnl: parseFloat($('#trPnl').value || '0'),
      note: $('#trNote').value.trim(),
    });
    $('#trSymbol').value = '';
    $('#trPnl').value = '';
    $('#trNote').value = '';
  });

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
  renderKPIs();
}

// ---------------- Init ----------------
function init() {
  loadState();
  wireEvents();
  setQuote();
  renderAll();
  tick();
  setInterval(tick, 1000);
  setInterval(() => { renderReminders(); checkReminderFiring(); }, 30000);
  window.addEventListener('resize', () => renderKPIs());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
