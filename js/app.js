/* BB Cash — personal cashflow, month by month.
   Data is one JSON document stored by api.php, with an offline copy in localStorage. */
'use strict';

/* ======================================================================
   Helpers
   ====================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const sum = (arr, fn = x => x) => round2(arr.reduce((s, x) => s + fn(x), 0));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ymNow = () => todayISO().slice(0, 7);
const ymOf = iso => iso.slice(0, 7);
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const ymShort = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`; };
const isoToDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((isoToDate(a) - isoToDate(b)) / 86400000);
const dateShort = iso => isoToDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function dayHeading(iso) {
  const diff = dayDiff(todayISO(), iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return isoToDate(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

function fmtNumber(n) {
  const d = S.data?.settings.decimals ?? 2;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(n));
}

/** "1,250.00 MT". sign: show + for positive values too. */
function money(n, sign = false) {
  const v = round2(n);
  const pre = v < 0 ? '−' : (sign && v > 0 ? '+' : '');
  return `${pre}${fmtNumber(v)} ${S.data?.settings.currency || 'MT'}`;
}

function moneyBig(n) {
  const v = round2(n);
  const [int, dec] = fmtNumber(v).split('.');
  return `${v < 0 ? '−' : ''}${int}${dec ? `<span class="dec">.${dec}</span>` : ''}<span class="cur">${esc(S.data.settings.currency)}</span>`;
}

const compact = n => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Accepts "1500", "1 500,50", "1,500.50", "1.500,50". */
function parseAmount(raw) {
  let s = String(raw).replace(/[\s ]/g, '').replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/,(?=.*,)/g, '').replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? round2(Math.abs(n)) : NaN;
}

const P = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  skip: '<path d="m5 4 10 8-10 8V4zM19 5v14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  next: '<path d="M4 12h13M13 6l6 6-6 6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
};

const ic = (name, size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;

/* ======================================================================
   State & data model
   ====================================================================== */

const S = {
  data: null,
  rev: 0,
  view: 'month',
  month: ymNow(),
  filter: 'all',
  search: '',
  dirty: false,
  saving: false,
  syncing: false,
  offline: false,
  seq: 0,
  undo: null,
  charts: [],
};

const CACHE_KEY = 'bbcash.cache';

function defaultData() {
  const c = (id, name, icon, color, type) => ({ id, name, icon, color, type, budget: 0 });
  return {
    version: 1,
    settings: { currency: 'MT', decimals: 2, startBalance: 0, theme: 'auto', iconStyle: 'initials' },
    categories: [
      c('salary', 'Salary', '💼', '#10b981', 'income'),
      c('business', 'Business', '🏪', '#0ea5e9', 'income'),
      c('freelance', 'Freelance', '🧑‍💻', '#8b5cf6', 'income'),
      c('other-in', 'Other income', '💰', '#22c55e', 'income'),
      c('housing', 'Housing & Rent', '🏠', '#f97316', 'expense'),
      c('food', 'Food & Groceries', '🛒', '#ef4444', 'expense'),
      c('transport', 'Transport & Fuel', '🚗', '#3b82f6', 'expense'),
      c('utilities', 'Electricity & Water', '💡', '#eab308', 'expense'),
      c('phone', 'Phone & Internet', '📱', '#06b6d4', 'expense'),
      c('health', 'Health', '🩺', '#ec4899', 'expense'),
      c('education', 'Education', '🎓', '#6366f1', 'expense'),
      c('family', 'Family & Support', '👨‍👩‍👧', '#a855f7', 'expense'),
      c('leisure', 'Eating out & Fun', '🍽️', '#f43f5e', 'expense'),
      c('shopping', 'Shopping', '🛍️', '#d946ef', 'expense'),
      c('savings', 'Savings & Goals', '🏦', '#14b8a6', 'expense'),
      c('debt', 'Debt payments', '💳', '#78716c', 'expense'),
      c('other-out', 'Other', '📦', '#64748b', 'expense'),
    ],
    recurring: [],
    transactions: [],
    goals: [],
    debts: [],
  };
}

/** Fill in anything missing so older/imported files always work. */
function normalize(d) {
  const base = defaultData();
  d = d && typeof d === 'object' ? d : {};
  return {
    version: 1,
    settings: { ...base.settings, ...(d.settings || {}) },
    categories: Array.isArray(d.categories) ? d.categories : base.categories,
    recurring: (Array.isArray(d.recurring) ? d.recurring : []).map(r => ({ skips: [], end: null, overrides: {}, ...r })),
    transactions: Array.isArray(d.transactions) ? d.transactions : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    debts: Array.isArray(d.debts) ? d.debts : [],
  };
}

// Settings → Category icons: 'initials' (default), 'emoji', or 'none' (plain text, just a colour stripe).
const useEmoji = () => S.data?.settings.iconStyle === 'emoji';
const plainCats = () => S.data?.settings.iconStyle === 'none';
/** Up to two initials from the name's words: "Rancho & Groceries" → "RG". */
const initials = name => (String(name).match(/[\p{L}\p{N}]+/gu) || ['?']).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const glyph = c => (useEmoji() && c.icon ? esc(c.icon) : `<b class="ini">${esc(initials(c.name))}</b>`);
/** Decorative emoji (empty states, toasts) — only when emojis are on. */
const deco = (e, after = '') => (useEmoji() ? e + after : '');

const UNCATEGORIZED = { id: '', name: 'Uncategorized', icon: '❔', color: '#94a3b8', type: 'expense', budget: 0 };
const cat = id => S.data.categories.find(c => c.id === id) || UNCATEGORIZED;
const catsOf = type => S.data.categories.filter(c => c.type === type);
/** The catch-all "Other" category of a type: new entries default to it so a category is never required. */
const otherCat = type => {
  const list = catsOf(type);
  return (list.find(c => c.id === (type === 'income' ? 'other-in' : 'other-out')) || list.find(c => /^other/i.test(c.name)))?.id || '';
};
/** Category tile; pass a type to add a small ↓ income / ↑ expense badge in the corner. */
const catIcon = (c, cls = '', type = '') => (plainCats()
  ? `<span class="cat-ic plain" style="--c:${esc(c.color)}"></span>`
  : `<span class="cat-ic ${cls}" style="--c:${esc(c.color)}"${type ? ` data-t="${type}"` : ''}>${glyph(c)}</span>`);
const signed = t => (t.type === 'income' ? t.amount : -t.amount);

/** Paid totals per month: Map<'YYYY-MM', {inc, exp}> */
function totalsByMonth() {
  const map = new Map();
  for (const t of S.data.transactions) {
    if (!t.paid) continue;
    const k = ymOf(t.date);
    const e = map.get(k) || { inc: 0, exp: 0 };
    if (t.type === 'income') e.inc += t.amount; else e.exp += t.amount;
    map.set(k, e);
  }
  return map;
}

const recurringActive = (r, ym) => r.start <= ym && (!r.end || r.end >= ym) && !(r.skips || []).includes(ym);
const dueDate = (r, ym) => `${ym}-${pad(Math.min(r.day, daysIn(ym)))}`;
// A fixed payment has a default amount, optionally replaced for single months (r.overrides['YYYY-MM']).
const hasOverride = (r, ym) => r.overrides?.[ym] != null;
const amountFor = (r, ym) => (hasOverride(r, ym) ? r.overrides[ym] : r.amount);

/** Fixed payments not yet paid this month (virtual) + unpaid one-off transactions. */
function pendingFor(ym) {
  const linked = new Set(S.data.transactions.filter(t => t.recurringId && ymOf(t.date) === ym).map(t => t.recurringId));
  const items = [];
  for (const r of S.data.recurring) {
    if (recurringActive(r, ym) && !linked.has(r.id)) {
      items.push({ virtual: true, id: 'v-' + r.id, rid: r.id, ym, type: r.type, amount: amountFor(r, ym), custom: hasOverride(r, ym), category: r.category, note: r.name, date: dueDate(r, ym) });
    }
  }
  for (const t of S.data.transactions) if (!t.paid && ymOf(t.date) === ym) items.push(t);
  return items.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

/** Progress = amount already there when created + every linked transaction that is paid. */
const linkedTotal = (key, id) => sum(S.data.transactions.filter(t => t[key] === id && t.paid), t => t.amount);
const goalSaved = g => round2((Number(g.initial) || 0) + linkedTotal('goalId', g.id));
const debtPaid = d => round2((Number(d.initial) || 0) + linkedTotal('debtId', d.id));
const debtLeft = d => Math.max(0, round2(d.total - debtPaid(d)));

/**
 * One month on its own — nothing carries over from earlier months.
 * In the current month only entries dated up to today count; later-dated ones go to the projection.
 */
function summary(ym) {
  const today = ym === ymNow() ? todayISO() : null;
  let inc = 0, exp = 0, later = 0;
  for (const t of S.data.transactions) {
    if (!t.paid || ymOf(t.date) !== ym) continue;
    const sign = t.type === 'income' ? 1 : -1;
    if (today && t.date > today) later += sign * t.amount;
    else if (sign > 0) inc += t.amount;
    else exp += t.amount;
  }
  const pending = pendingFor(ym);
  const pIn = sum(pending.filter(p => p.type === 'income'), p => p.amount);
  const pOut = sum(pending.filter(p => p.type === 'expense'), p => p.amount);
  const balance = round2(inc - exp);
  return { income: round2(inc), expense: round2(exp), balance, pIn, pOut, later, projected: round2(balance + later + pIn - pOut), pending };
}

/* ======================================================================
   Storage & sync
   ====================================================================== */

async function api(action, body) {
  const opts = { method: body ? 'POST' : 'GET', headers: { 'X-BBCash': '1' }, credentials: 'same-origin', cache: 'no-store' };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`api.php?action=${action}`, opts);
  let json = {};
  try { json = await res.json(); } catch (e) { /* non-JSON error page */ }
  if (!res.ok) {
    const err = new Error(json.error || `Server error (${res.status})`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
}

function writeCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rev: S.rev, dirty: S.dirty, data: S.data })); } catch (e) { /* storage full or blocked */ }
}

let saveTimer = null;

function persist() {
  S.dirty = true;
  S.seq++;
  writeCache();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
  updateSync();
}

async function flush() {
  if (!S.dirty || S.saving) return;
  S.saving = true;
  const seq = S.seq;
  updateSync();
  try {
    const res = await api('save', { rev: S.rev, data: S.data });
    S.rev = res.rev;
    S.offline = false;
    if (S.seq === seq) S.dirty = false;
    writeCache();
  } catch (e) {
    if (e.status === 409) {
      S.data = normalize(e.body.data);
      S.rev = e.body.rev;
      S.dirty = false;
      writeCache();
      render();
      toast('Updated on another device — loaded the latest version.');
    } else if (e.status === 401) {
      showAuth('login');
    } else {
      S.offline = true;
    }
  } finally {
    S.saving = false;
    updateSync();
    if (S.dirty && !S.offline) flush();
  }
}

/** Pull changes made on another device (e.g. phone → PC). */
async function refresh() {
  if (!S.data || S.dirty || S.saving || !$('#sheet').hidden) return;
  try {
    const res = await api('load');
    S.offline = false;
    if (res.rev !== S.rev && res.data) {
      S.data = normalize(res.data);
      S.rev = res.rev;
      writeCache();
      render();
    }
  } catch (e) {
    if (e.status === 401) showAuth('login'); else S.offline = true;
  }
  updateSync();
}

/** Force a full sync: push pending edits, then always reload the server copy. */
async function syncNow() {
  if (!S.data || S.syncing) return;
  S.syncing = true;
  S.offline = false;
  clearTimeout(saveTimer);
  updateSync();
  try {
    while (S.saving) await new Promise(r => setTimeout(r, 100));
    await flush();
    if (S.dirty) {
      toast(S.offline ? 'Offline — changes will sync when you reconnect' : 'Could not sync, try again');
      return;
    }
    const res = await api('load');
    S.offline = false;
    // Skip if an edit was made while loading; it will save on its own.
    if (res.data && !S.dirty) {
      const changed = res.rev !== S.rev;
      S.data = normalize(res.data);
      S.rev = res.rev;
      writeCache();
      if ($('#sheet').hidden) render();
      toast(changed ? 'Synced — loaded the latest changes' : 'Up to date');
    }
  } catch (e) {
    if (e.status === 401) showAuth('login');
    else { S.offline = true; toast('Offline — showing your saved copy'); }
  } finally {
    S.syncing = false;
    updateSync();
  }
}

/** Get the newest app files, bypassing every cache, then reload. Data is kept. */
async function forceUpdate() {
  if (S.syncing) return;
  toast('Updating…');
  if (S.data && S.dirty) await syncNow();
  if (S.offline) return toast('You are offline — connect to update the app');
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    if ('caches' in window) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    await Promise.all(['./', 'index.html', 'css/style.css', 'js/app.js', 'sw.js'].map(u => fetch(u, { cache: 'reload' }).catch(() => {})));
  } catch (e) { /* reload anyway */ }
  location.reload();
}

function updateSync() {
  const text = S.syncing ? 'Syncing…' : S.saving ? 'Saving…' : S.offline ? (S.dirty ? 'Offline · will sync' : 'Offline') : S.dirty ? 'Saving…' : 'All saved';
  const cls = S.syncing || S.saving || (S.dirty && !S.offline) ? 'saving' : S.offline ? 'offline' : '';
  $$('.sync').forEach(el => { el.className = `sync ${cls}`; el.textContent = text; });
}

/** Run a change, save it, re-render, and offer Undo. */
function mutate(fn, message) {
  const before = JSON.stringify(S.data);
  fn(S.data);
  persist();
  render();
  if (message) {
    toast(message, () => {
      S.data = JSON.parse(before);
      persist();
      render();
    });
  }
}

/* ======================================================================
   Shell & rendering
   ====================================================================== */

const VIEWS = {
  month: { label: 'Month', title: 'Cashflow', icon: 'calendar' },
  fixed: { label: 'Fixed', title: 'Fixed payments', icon: 'repeat' },
  goals: { label: 'Goals', title: 'Goals & debts', icon: 'target' },
  stats: { label: 'Insights', title: 'Insights', icon: 'chart' },
  settings: { label: 'Settings', title: 'Settings', icon: 'settings' },
};

function renderShell() {
  const nav = Object.entries(VIEWS).map(([k, v]) =>
    `<button class="nav-item" data-action="go" data-view="${k}">${ic(v.icon)}<span>${v.label}</span></button>`).join('');
  const tab = k => `<button class="tab" data-action="go" data-view="${k}">${ic(VIEWS[k].icon, 22)}<span>${VIEWS[k].label}</span></button>`;

  $('#app').innerHTML = `
    <div class="ptr" id="ptr" aria-hidden="true">${ic('refresh')}</div>
    <aside class="sidebar">
      <div class="brand"><img src="icon.svg" alt=""><div><b>BB Cash</b><small>Personal cashflow</small></div></div>
      <button class="btn btn-primary btn-lg btn-block" data-action="add">${ic('plus')} New entry</button>
      <nav class="nav">${nav}</nav>
      <div class="sidebar-foot">
        <button class="btn btn-sm" id="install-side" data-action="install" ${canInstall() ? '' : 'hidden'}>${ic('download', 16)} Install app</button>
        <span class="sync"></span>
        <span class="kbd-hint"><kbd>N</kbd> new entry · <kbd>←</kbd><kbd>→</kbd> months</span>
      </div>
    </aside>
    <div class="content">
      <header class="topbar">
        <div class="brand-mini"><img src="icon.svg" alt=""><h1 id="title"></h1></div>
        <h1 id="title-desk" class="desk-title"></h1>
        <div class="month-switch" id="month-switch">
          <button class="icon-btn" data-action="prev-month" aria-label="Previous month">${ic('left')}</button>
          <button class="label" data-action="this-month" id="month-label"></button>
          <button class="icon-btn" data-action="next-month" aria-label="Next month">${ic('right')}</button>
        </div>
        <button class="icon-btn mobile-only" data-action="go" data-view="settings" aria-label="Settings">${ic('settings', 22)}</button>
      </header>
      <main id="main"></main>
    </div>
    <nav class="tabbar">
      ${tab('month')}${tab('fixed')}
      <div class="fab-wrap"><button class="fab" data-action="add" aria-label="New entry">${ic('plus', 26)}</button></div>
      ${tab('goals')}${tab('stats')}
    </nav>`;
  // Desktop shows the title next to the month switch; mobile shows it beside the logo.
  const mq = window.matchMedia('(min-width: 960px)');
  const syncTitle = () => { $('#title-desk').hidden = !mq.matches; };
  mq.addEventListener('change', syncTitle);
  syncTitle();
}

function render() {
  if (!S.data) return;
  applyTheme();
  destroyCharts();
  const v = VIEWS[S.view];
  $('#title').textContent = v.title;
  $('#title-desk').textContent = v.title;
  const showMonth = S.view === 'month' || S.view === 'stats';
  $('#month-switch').hidden = !showMonth;
  $('#title').hidden = showMonth; // mobile: logo + month switch only, to fit narrow screens
  const isNow = S.month === ymNow();
  $('#month-label').innerHTML = `${ymLabel(S.month)}${isNow ? '' : '<small>Back to today</small>'}`;
  $$('[data-action="go"]').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));

  $('#main').innerHTML = { month: viewMonth, fixed: viewFixed, goals: viewGoals, stats: viewStats, settings: viewSettings }[S.view]();
  if (S.view === 'stats') drawCharts();
  updateSync();
}

/* ---------- Month view ---------- */

function viewMonth() {
  const s = summary(S.month);
  const txs = S.data.transactions.filter(t => t.paid && ymOf(t.date) === S.month);
  const banner = installBanner() + overdueBanner();
  return `
    ${banner}
    <div class="grid-month" ${banner ? 'style="margin-top:12px"' : ''}>
      <div class="col">
        ${heroCard(s)}
        ${txCard(txs)}
      </div>
      <div class="col">
        ${pendingCard(s)}
        ${budgetsCard(txs, s.pending)}
      </div>
    </div>`;
}

function overdueBanner() {
  const now = ymNow();
  if (S.month !== now) return '';
  let count = 0, first = null;
  for (let i = 6; i >= 1; i--) {
    const ym = ymAdd(now, -i);
    const n = pendingFor(ym).length;
    if (n) { count += n; first = first || ym; }
  }
  if (!count) return '';
  return `<button class="banner" data-action="goto-month" data-ym="${first}">${ic('alert')}<span>${count} unpaid item${count > 1 ? 's' : ''} from earlier months</span>${ic('right', 18)}</button>`;
}

function heroCard(s) {
  const now = ymNow();
  const label = S.month === now ? 'Balance today' : S.month < now ? 'Month balance' : 'Balance so far';
  const sub = S.month === now ? `Up to ${dateShort(todayISO())}` : ymLabel(S.month);
  const ratio = s.income > 0 ? Math.min(100, (s.expense / s.income) * 100) : s.expense > 0 ? 100 : 0;
  const saved = s.income - s.expense;
  let foot = 'No income recorded yet this month';
  if (s.income > 0) {
    foot = `Spent ${Math.round((s.expense / s.income) * 100)}% of income`;
    foot += saved >= 0 ? ` · kept ${money(saved)}` : ` · overspent ${money(-saved)}`;
  }
  return `
    <section class="card hero o1">
      <div class="hero-top">
        <span class="hero-label">${label}</span>
        <span class="hero-open">${sub}</span>
      </div>
      <div class="hero-amount">${moneyBig(s.balance)}</div>
      <div class="hero-proj">${s.pending.length || s.later
        ? `Projected end of month <b>${money(s.projected)}</b>`
        : 'Nothing pending — all planned items settled ✓'}</div>
      <div class="hero-stats">
        <div class="hero-stat"><small><span class="arrow in">${ic('down', 12)}</span>Income</small><b>${money(s.income)}</b></div>
        <div class="hero-stat"><small><span class="arrow out">${ic('up', 12)}</span>Expenses</small><b>${money(s.expense)}</b></div>
      </div>
      <div class="hero-bar"><span style="width:${ratio}%"></span></div>
      <div class="hero-foot">${foot}</div>
    </section>`;
}

const isFixed = p => !!(p.virtual || p.recurringId);

function pendingRow(p) {
  const today = todayISO();
  const c = cat(p.category);
  const late = dayDiff(today, p.date);
  let when = `Due ${dateShort(p.date)}`;
  if (late > 0) when = `<span class="tag red">${late === 1 ? '1 day late' : late + ' days late'}</span>`;
  else if (late === 0) when = '<span class="tag green">Due today</span>';
  else if (late >= -3) when = `Due in ${-late} day${late === -1 ? '' : 's'}`;
  const move = isFixed(p) ? '' :
    `<button class="icon-btn move" data-action="move-next" data-id="${p.id}" title="Move to ${ymLabel(ymAdd(ymOf(p.date), 1))}" aria-label="Move ${esc(p.note || c.name)} to next month">${ic('next', 17)}</button>`;
  return `
    <li class="row pend ${late > 0 ? 'overdue' : ''}">
      <button class="check ${p.type}" data-action="quickpay" data-id="${p.id}" aria-label="Mark ${esc(p.note || c.name)} as ${p.type === 'income' ? 'received' : 'paid'}">${ic('check', 15)}</button>
      <button class="row-btn" data-action="open-pending" data-id="${p.id}">
        ${catIcon(c, '', p.type)}
        <span class="row-text">
          <span class="row-title">${esc(p.note || c.name)}</span>
          <span class="row-sub">${when}${p.custom ? ' <span class="tag">Changed</span>' : ''}</span>
        </span>
        <span class="amt ${p.type}">${money(signed(p), true)}</span>
      </button>
      ${move}
    </li>`;
}

function pendingCard(s) {
  const today = todayISO();
  const groups = [
    { key: 'income', title: 'To receive', icon: 'down', items: s.pending.filter(p => p.type === 'income') },
    { key: 'fixed', title: 'Fixed expenses', icon: 'repeat', items: s.pending.filter(p => p.type === 'expense' && isFixed(p)) },
    { key: 'other', title: 'Other expenses', icon: 'up', items: s.pending.filter(p => p.type === 'expense' && !isFixed(p)) },
  ].filter(g => g.items.length);

  const body = groups.map(g => {
    const total = sum(g.items, p => p.amount);
    const bulk = g.key === 'other' && g.items.length > 1
      ? `<button class="link sm" data-action="move-all-next">Move all to ${ymShort(ymAdd(S.month, 1))} →</button>` : '';
    return `
      <div class="pgroup ${g.key}">
        <div class="pgroup-head">
          <span class="pgroup-ic">${ic(g.icon, 14)}</span>
          <span class="pgroup-title">${g.title} <span class="pgroup-count">${g.items.length}</span></span>
          <span class="pgroup-total num">${g.key === 'income' ? '+' : '−'}${fmtNumber(total)}</span>
        </div>
        <ul class="list">${g.items.map(pendingRow).join('')}</ul>
        ${bulk ? `<div class="pgroup-foot">${bulk}</div>` : ''}
      </div>`;
  }).join('');

  const net = round2(s.pIn - s.pOut);
  const content = s.pending.length
    ? `${body}<div class="pend-total"><span>If everything happens</span><span class="num ${net >= 0 ? 'pos' : 'neg'}">${money(net, true)}</span></div>`
    : `<div class="empty small">Nothing pending this month.<br><button class="link" data-action="new-recurring">+ Set up a fixed payment</button></div>`;

  return `
    <section class="card o2">
      <header class="card-head"><h2>Upcoming &amp; unpaid</h2>${s.pending.length ? `<span class="pill ${s.pending.some(p => p.date < today) ? 'warn' : ''}">${s.pending.length}</span>` : ''}</header>
      ${content}
    </section>`;
}

function budgetsCard(txs, pending) {
  const cats = catsOf('expense').filter(c => Number(c.budget) > 0);
  if (!cats.length) {
    return `<section class="card o3"><header class="card-head"><h2>Budgets</h2></header>
      <div class="empty small">Set a monthly limit per category to see how much is left.<br><button class="link" data-action="go" data-view="settings">Set budgets</button></div></section>`;
  }
  const rows = cats.map(c => {
    const spent = sum(txs.filter(t => t.type === 'expense' && t.category === c.id), t => t.amount);
    const planned = sum(pending.filter(p => p.type === 'expense' && p.category === c.id), p => p.amount);
    const pct = spent / c.budget;
    const state = pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : '';
    const left = round2(c.budget - spent);
    const wSpent = Math.min(100, pct * 100);
    const wPlanned = Math.max(0, Math.min(100 - wSpent, (planned / c.budget) * 100));
    return `
      <div class="budget ${state}" style="--c:${esc(c.color)}">
        <div class="budget-top">
          ${catIcon(c, 'sm')}
          <span class="row-text"><span class="row-title">${esc(c.name)}</span><span class="row-sub num">${fmtNumber(spent)} of ${fmtNumber(c.budget)}</span></span>
          <span class="amt">${left >= 0 ? money(left) : money(-left)}<small>${left >= 0 ? 'left' : 'over budget'}</small></span>
        </div>
        <div class="bar"><span class="spent" style="width:${wSpent}%"></span><span class="planned" style="width:${wPlanned}%"></span></div>
      </div>`;
  }).join('');
  const totalBudget = sum(cats, c => Number(c.budget));
  const totalSpent = sum(txs.filter(t => t.type === 'expense' && cats.some(c => c.id === t.category)), t => t.amount);
  return `
    <section class="card o3">
      <header class="card-head"><h2>Budgets</h2><span class="sub num">${fmtNumber(totalSpent)} / ${fmtNumber(totalBudget)}</span></header>
      ${rows}
    </section>`;
}

function txCard(txs) {
  const chip = (k, label) => `<button class="chip ${k} ${S.filter === k ? 'active' : ''}" data-action="filter" data-filter="${k}">${label}</button>`;
  const inc = txs.filter(t => t.type === 'income');
  const exp = txs.filter(t => t.type === 'expense');
  return `
    <section class="card o4">
      <header class="card-head"><h2>Transactions</h2><span class="sub">${txs.length} this month</span></header>
      <div class="inout">
        <div class="inout-box income"><span class="inout-ic">${ic('down', 14)}</span><span><small>Money in · ${inc.length}</small><b class="num">${inc.length ? '+' : ''}${fmtNumber(sum(inc, t => t.amount))}</b></span></div>
        <div class="inout-box expense"><span class="inout-ic">${ic('up', 14)}</span><span><small>Money out · ${exp.length}</small><b class="num">${exp.length ? '−' : ''}${fmtNumber(sum(exp, t => t.amount))}</b></span></div>
      </div>
      <div class="tx-tools">
        <div class="chips">${chip('all', 'All')}${chip('income', 'Income')}${chip('expense', 'Expenses')}</div>
        <label class="search">${ic('search', 16)}<input id="tx-search" type="search" placeholder="Search" value="${esc(S.search)}" aria-label="Search transactions"></label>
      </div>
      <div id="tx-list">${txListInner(txs)}</div>
    </section>`;
}

function txListInner(txs) {
  const q = S.search.trim().toLowerCase();
  let list = txs.filter(t => S.filter === 'all' || t.type === S.filter);
  if (q) list = list.filter(t => `${t.note || ''} ${cat(t.category).name} ${t.amount}`.toLowerCase().includes(q));
  if (!list.length) {
    return txs.length
      ? '<div class="empty small">No matches.</div>'
      : `<div class="empty">${deco('<div class="big">🧾</div>')}No transactions yet for ${ymLabel(S.month)}.<br><button class="link" data-action="add">+ Add the first one</button></div>`;
  }
  const groups = new Map();
  for (const t of [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0))) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  let html = '';
  for (const [date, items] of groups) {
    const net = sum(items, signed);
    html += `<div class="day-head"><span>${dayHeading(date)}</span><span class="num">${money(net, true)}</span></div><ul class="list">`;
    for (const t of items) {
      const c = cat(t.category);
      html += `
        <li class="tx ${t.type}"><button class="row-btn" data-action="edit-tx" data-id="${t.id}">
          ${catIcon(c, '', t.type)}
          <span class="row-text">
            <span class="row-title">${esc(t.note || c.name)}</span>
            <span class="row-sub">${esc(c.name)}${t.recurringId ? ' <span class="tag">Fixed</span>' : ''}${t.goalId ? ' <span class="tag">Goal</span>' : ''}${t.debtId ? ' <span class="tag">Debt</span>' : ''}</span>
          </span>
          <span class="amt ${t.type}">${money(signed(t), true)}</span>
        </button></li>`;
    }
    html += '</ul>';
  }
  return html;
}

/* ---------- Fixed payments view ---------- */

function viewFixed() {
  const now = ymNow();
  const live = S.data.recurring.filter(r => !r.end || r.end >= now);
  const inc = sum(live.filter(r => r.type === 'income' && r.start <= now), r => r.amount);
  const exp = sum(live.filter(r => r.type === 'expense' && r.start <= now), r => r.amount);
  const paidIds = new Set(S.data.transactions.filter(t => t.recurringId && ymOf(t.date) === now).map(t => t.recurringId));

  const section = (type, title) => {
    const list = S.data.recurring.filter(r => r.type === type).sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
    if (!list.length) return '';
    const rows = list.map(r => {
      const c = cat(r.category);
      const ended = r.end && r.end < now;
      let status = '';
      if (ended) status = `<span class="tag">Ended ${ymShort(r.end)}</span>`;
      else if (r.start > now) status = `<span class="tag">Starts ${ymShort(r.start)}</span>`;
      else if (paidIds.has(r.id)) status = `<span class="tag green">${type === 'income' ? 'Received' : 'Paid'} this month</span>`;
      else if ((r.skips || []).includes(now)) status = '<span class="tag">Skipped this month</span>';
      else status = '<span class="tag">Pending</span>';
      if (!ended && !paidIds.has(r.id) && hasOverride(r, now)) status += ` <span class="tag">This month ${fmtNumber(r.overrides[now])}</span>`;
      return `
        <li class="${ended ? 'ended' : ''}"><button class="row-btn" data-action="edit-recurring" data-id="${r.id}">
          ${catIcon(c)}
          <span class="row-text">
            <span class="row-title">${esc(r.name)}</span>
            <span class="row-sub">Day ${r.day} · ${esc(c.name)} ${status}</span>
          </span>
          <span class="amt ${type}">${money(type === 'income' ? r.amount : -r.amount, true)}</span>
        </button></li>`;
    }).join('');
    return `<section class="card"><header class="card-head"><h2>${title}</h2><span class="pill">${list.length}</span></header><ul class="list">${rows}</ul></section>`;
  };

  const sections = section('expense', 'Fixed expenses') + section('income', 'Fixed income');
  return `
    <div class="stack">
      <div class="sum-grid">
        <div class="sum in"><small>Fixed income / month</small><b>${money(inc)}</b></div>
        <div class="sum out"><small>Fixed expenses / month</small><b>${money(exp)}</b></div>
        <div class="sum accent"><small>Free after fixed</small><b>${money(inc - exp)}</b></div>
      </div>
      <button class="btn btn-primary btn-lg" data-action="new-recurring">${ic('plus')} New fixed payment</button>
      ${sections
        ? `<div class="grid-2">${sections}</div>`
        : `<section class="card"><div class="empty">${deco('<div class="big">🔁</div>')}
            Add things that repeat every month — rent, salary, school fees, internet, EDM/FIPAG bills.<br>
            They appear automatically each month, ready to tick off.</div></section>`}
    </div>`;
}

/* ---------- Goals & debts view ---------- */

/** Months from now until a target month (inclusive), for "per month needed". */
const monthsUntil = ym => {
  const [y1, m1] = ymNow().split('-').map(Number);
  const [y2, m2] = ym.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};

function progressRow({ id, icon, color, name, done, total, left, sub, editAction, addAction, addLabel, doneLabel }) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  const finished = left <= 0;
  return `
    <div class="goal ${finished ? 'finished' : ''}" style="--c:${esc(color)}">
      <div class="goal-top">
        <button class="row-btn" data-action="${editAction}" data-id="${esc(id)}">
          ${catIcon({ icon, color, name })}
          <span class="row-text"><span class="row-title">${esc(name)}</span><span class="row-sub num">${fmtNumber(done)} of ${fmtNumber(total)} · ${Math.round(pct)}%</span></span>
          <span class="amt">${finished ? doneLabel : `${money(left)}<small>left</small>`}</span>
        </button>
        ${finished ? '' : `<button class="btn btn-sm" data-action="${addAction}" data-id="${esc(id)}">${addLabel}</button>`}
      </div>
      <div class="bar"><span class="spent" style="width:${pct}%"></span></div>
      ${sub ? `<div class="goal-sub">${sub}</div>` : ''}
    </div>`;
}

function viewGoals() {
  const { goals, debts } = S.data;
  const owe = debts.filter(d => d.type !== 'lent');
  const lent = debts.filter(d => d.type === 'lent');
  const goalsLeft = sum(goals, g => Math.max(0, g.target - goalSaved(g)));

  const goalRows = [...goals]
    .sort((a, b) => (goalSaved(a) >= a.target) - (goalSaved(b) >= b.target) || (a.deadline || '9999').localeCompare(b.deadline || '9999'))
    .map(g => {
      const saved = goalSaved(g);
      const left = Math.max(0, round2(g.target - saved));
      let sub = '';
      if (g.deadline && left > 0) {
        const n = monthsUntil(g.deadline);
        sub = n > 0 ? `Save <b>${money(left / n)}</b> a month to reach it by ${ymLabel(g.deadline)}` : `<span class="tag red">Target date ${ymLabel(g.deadline)} passed</span>`;
      }
      return progressRow({ id: g.id, icon: g.icon, color: g.color, name: g.name, done: saved, total: g.target, left, sub, editAction: 'edit-goal', addAction: 'goal-add', addLabel: '+ Add', doneLabel: deco('🎉 ') + 'Reached' });
    }).join('');

  const debtRows = list => list
    .sort((a, b) => (debtLeft(a) === 0) - (debtLeft(b) === 0) || debtLeft(b) - debtLeft(a))
    .map(d => {
      let sub = d.note ? esc(d.note) : '';
      if (d.due && debtLeft(d) > 0) sub += `${sub ? ' · ' : ''}${d.due < ymNow() ? '<span class="tag red">Overdue</span> ' : ''}Due ${ymLabel(d.due)}`;
      return progressRow({
        id: d.id, icon: d.type === 'lent' ? '🤝' : '💳', color: d.type === 'lent' ? '#10b981' : '#f97316', name: d.name,
        done: debtPaid(d), total: d.total, left: debtLeft(d), sub,
        editAction: 'edit-debt', addAction: 'debt-pay', addLabel: d.type === 'lent' ? 'Received' : 'Pay', doneLabel: '✓ Settled',
      });
    }).join('');

  const empty = (emoji, text, action, label) => `<div class="empty small">${deco(`<div class="big">${emoji}</div>`)}${text}<br><button class="link" data-action="${action}">${label}</button></div>`;

  return `
    <div class="stack">
      <div class="sum-grid">
        <div class="sum out"><small>You owe</small><b>${money(sum(owe, debtLeft))}</b></div>
        <div class="sum in"><small>Owed to you</small><b>${money(sum(lent, debtLeft))}</b></div>
        <div class="sum accent"><small>Still to save for goals</small><b>${money(goalsLeft)}</b></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="new-goal">${ic('plus', 18)} New goal</button>
        <button class="btn" data-action="new-debt">${ic('plus', 18)} New debt</button>
      </div>
      <div class="grid-2">
        <section class="card">
          <header class="card-head"><h2>Goals</h2><span class="pill">${goals.length}</span></header>
          ${goals.length ? goalRows : empty('🎯', 'Saving for a car, a MacBook, a trip? Add a goal and track how close you are.', 'new-goal', '+ Add a goal')}
        </section>
        <div class="stack">
          <section class="card">
            <header class="card-head"><h2>I owe</h2><span class="pill">${owe.length}</span></header>
            ${owe.length ? debtRows(owe) : empty('💳', 'No debts. Add money you owe to people and pay it off bit by bit.', 'new-debt', '+ Add a debt')}
          </section>
          ${lent.length ? `<section class="card"><header class="card-head"><h2>Owed to me</h2><span class="pill">${lent.length}</span></header>${debtRows(lent)}</section>` : ''}
        </div>
      </div>
      <p class="hint">Adding money to a goal or recording a debt payment also adds an entry to that month's cashflow, so your balance stays accurate. Delete that entry to undo it.</p>
    </div>`;
}

/* ---------- Insights view ---------- */

/** Per-category cards for the selected month: done so far + still expected, against budget/target. */
function categoryMonthCards() {
  const done = new Map();
  for (const t of S.data.transactions) if (t.paid && ymOf(t.date) === S.month) done.set(t.category, (done.get(t.category) || 0) + t.amount);
  const planned = new Map();
  for (const p of pendingFor(S.month)) planned.set(p.category, (planned.get(p.category) || 0) + p.amount);

  const catRows = type => catsOf(type).map(c => {
    const d = round2(done.get(c.id) || 0);
    const p = round2(planned.get(c.id) || 0);
    let detail = type === 'income' ? 'received' : 'spent';
    if (p) detail = `${fmtNumber(d)} ${detail} · ${fmtNumber(p)} expected`;
    if (c.budget > 0) detail += ` · ${type === 'income' ? 'target' : 'budget'} ${fmtNumber(c.budget)}`;
    return `
    <li><button class="row-btn" data-action="edit-cat" data-id="${esc(c.id)}">
      ${catIcon(c, 'sm')}
      <span class="row-text"><span class="row-title">${esc(c.name)}</span></span>
      <span class="amt ${d + p ? type : 'zero'}">${money(d + p)}<small>${detail}</small></span>
    </button></li>`;
  }).join('');
  const typeTotal = type => money(sum(catsOf(type), c => (done.get(c.id) || 0) + (planned.get(c.id) || 0)));
  const card = (type, title) => `
        <section class="card">
          <header class="card-head"><div><h2>${title}</h2><span class="sub">${ymLabel(S.month)} · ${typeTotal(type)}</span></div></header>
          <ul class="list">${catRows(type)}</ul>
        </section>`;
  return card('expense', 'Expenses by category') + card('income', 'Income by category');
}

function viewStats() {
  const totals = totalsByMonth();
  const months = Array.from({ length: 12 }, (_, i) => ymAdd(S.month, i - 11));
  const withData = months.filter(m => totals.has(m));
  const cur = totals.get(S.month) || { inc: 0, exp: 0 };
  const prev = totals.get(ymAdd(S.month, -1)) || { inc: 0, exp: 0 };
  const avgInc = withData.length ? sum(withData, m => totals.get(m).inc) / withData.length : 0;
  const avgExp = withData.length ? sum(withData, m => totals.get(m).exp) / withData.length : 0;
  const rate = cur.inc > 0 ? Math.round(((cur.inc - cur.exp) / cur.inc) * 100) : null;
  const expDelta = prev.exp > 0 ? Math.round(((cur.exp - prev.exp) / prev.exp) * 100) : null;

  const byCat = categoryBreakdown(S.month);
  const top = byCat[0];
  const legend = byCat.map(r => `
    <li style="--c:${esc(r.c.color)}"><span class="sw"></span><span class="name">${deco(esc(r.c.icon), ' ')}${esc(r.c.name)}</span>
    <span class="pct">${Math.round(r.pct * 100)}%</span><span class="amt">${money(r.amount)}</span></li>`).join('');

  const noChart = typeof Chart === 'undefined';
  const box = (id, cls = '') => noChart ? '<div class="empty small">Charts need an internet connection to load.</div>' : `<div class="chart-box ${cls}"><canvas id="${id}"></canvas></div>`;

  return `
    <div class="stack">
      <div class="kpis">
        <div class="sum"><small>Saved this month</small><b>${rate === null ? '—' : rate + '%'}</b><div class="delta ${rate >= 0 ? 'up' : 'down'}">${money(cur.inc - cur.exp, true)}</div></div>
        <div class="sum"><small>Spending vs last month</small><b>${expDelta === null ? '—' : (expDelta > 0 ? '+' : '') + expDelta + '%'}</b><div class="delta ${expDelta > 0 ? 'down' : 'up'}">${money(cur.exp)}</div></div>
        <div class="sum"><small>Avg. income (12m)</small><b>${money(avgInc)}</b><div class="delta">&nbsp;</div></div>
        <div class="sum"><small>Avg. expenses (12m)</small><b>${money(avgExp)}</b><div class="delta">${top ? `Top: ${deco(esc(top.c.icon), ' ')}${esc(top.c.name)}` : '&nbsp;'}</div></div>
      </div>
      <div class="grid-2">
        <section class="card span-2">
          <header class="card-head"><h2>Last 12 months</h2>
            <div class="chart-legend"><span><i style="background:var(--income)"></i>Income</span><span><i style="background:var(--expense)"></i>Expenses</span><span><i class="line" style="background:var(--accent)"></i>Net</span></div>
          </header>
          ${box('ch-months', 'tall')}
        </section>
        <section class="card">
          <header class="card-head"><h2>Where the money went</h2><span class="sub">${ymLabel(S.month)}</span></header>
          ${byCat.length
            ? `<div class="donut-wrap">${noChart ? '' : `<div class="donut"><canvas id="ch-donut"></canvas><div class="donut-center"><small>Spent</small><b>${fmtNumber(cur.exp)}</b></div></div>`}<ul class="legend">${legend}</ul></div>`
            : '<div class="empty small">No expenses recorded this month.</div>'}
        </section>
        <section class="card">
          <header class="card-head"><h2>Spending pace</h2>
            <div class="chart-legend"><span><i class="line" style="background:var(--expense)"></i>${ymShort(S.month)}</span><span><i class="line" style="background:var(--muted)"></i>${ymShort(ymAdd(S.month, -1))}</span></div>
          </header>
          ${box('ch-pace')}
        </section>
        ${categoryMonthCards()}
      </div>
    </div>`;
}

function categoryBreakdown(ym) {
  const map = new Map();
  for (const t of S.data.transactions) {
    if (t.paid && t.type === 'expense' && ymOf(t.date) === ym) map.set(t.category, (map.get(t.category) || 0) + t.amount);
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .map(([id, amount]) => ({ c: cat(id), amount: round2(amount), pct: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

function destroyCharts() {
  S.charts.forEach(c => c.destroy());
  S.charts = [];
}

function drawCharts() {
  if (typeof Chart === 'undefined') return;
  const css = getComputedStyle(document.documentElement);
  const v = name => css.getPropertyValue(name).trim();
  Chart.defaults.font.family = v('--font');
  Chart.defaults.font.weight = 600;
  Chart.defaults.color = v('--muted');
  const grid = v('--border');
  const tooltip = {
    backgroundColor: '#0f172a', padding: 10, cornerRadius: 10, boxPadding: 4,
    callbacks: { label: ctx => ` ${ctx.dataset.label}: ${money(ctx.parsed.y ?? ctx.parsed)}` },
  };

  // 12 months: income/expense bars + monthly net line
  const totals = totalsByMonth();
  const months = Array.from({ length: 12 }, (_, i) => ymAdd(S.month, i - 11));
  const el1 = $('#ch-months');
  if (el1) {
    S.charts.push(new Chart(el1, {
      data: {
        labels: months.map(ymShort),
        datasets: [
          { type: 'line', label: 'Net', data: months.map(m => round2((totals.get(m)?.inc || 0) - (totals.get(m)?.exp || 0))), borderColor: v('--accent'), backgroundColor: v('--accent'), borderWidth: 2.5, cubicInterpolationMode: 'monotone', pointRadius: 0, pointHoverRadius: 5, yAxisID: 'y1', order: 0 },
          { type: 'bar', label: 'Income', data: months.map(m => round2(totals.get(m)?.inc || 0)), backgroundColor: v('--income'), borderRadius: 6, maxBarThickness: 18, order: 1 },
          { type: 'bar', label: 'Expenses', data: months.map(m => round2(totals.get(m)?.exp || 0)), backgroundColor: v('--expense'), borderRadius: 6, maxBarThickness: 18, order: 1 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip },
        scales: {
          x: { grid: { display: false }, border: { display: false } },
          y: { grid: { color: grid }, border: { display: false }, ticks: { callback: compact, maxTicksLimit: 6 } },
          y1: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { callback: compact, maxTicksLimit: 6 } },
        },
      },
    }));
  }

  // Donut by category
  const el2 = $('#ch-donut');
  if (el2) {
    const rows = categoryBreakdown(S.month);
    S.charts.push(new Chart(el2, {
      type: 'doughnut',
      data: { labels: rows.map(r => r.c.name), datasets: [{ label: 'Spent', data: rows.map(r => r.amount), backgroundColor: rows.map(r => r.c.color), borderColor: v('--surface'), borderWidth: 3, hoverOffset: 6 }] },
      options: {
        maintainAspectRatio: false, cutout: '72%',
        plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: ctx => ` ${money(ctx.parsed)}` } } },
      },
    }));
  }

  // Cumulative daily spending: this month vs previous
  const el3 = $('#ch-pace');
  if (el3) {
    const cumulative = ym => {
      const days = daysIn(ym);
      const perDay = new Array(days).fill(0);
      for (const t of S.data.transactions) {
        if (t.paid && t.type === 'expense' && ymOf(t.date) === ym) perDay[Number(t.date.slice(8)) - 1] += t.amount;
      }
      let run = 0;
      return perDay.map(x => round2(run += x));
    };
    const cur = cumulative(S.month);
    const prev = cumulative(ymAdd(S.month, -1));
    const isNow = S.month === ymNow();
    const today = Number(todayISO().slice(8));
    const len = Math.max(cur.length, prev.length);
    S.charts.push(new Chart(el3, {
      type: 'line',
      data: {
        labels: Array.from({ length: len }, (_, i) => i + 1),
        datasets: [
          { label: ymShort(S.month), data: isNow ? cur.slice(0, today) : cur, borderColor: v('--expense'), backgroundColor: v('--expense') + '22', fill: true, borderWidth: 2.5, cubicInterpolationMode: 'monotone', pointRadius: 0 },
          { label: ymShort(ymAdd(S.month, -1)), data: prev, borderColor: v('--muted'), borderDash: [5, 4], borderWidth: 2, cubicInterpolationMode: 'monotone', pointRadius: 0 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { title: items => `Day ${items[0].label}`, label: tooltip.callbacks.label } } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { grid: { color: grid }, border: { display: false }, ticks: { callback: compact, maxTicksLimit: 5 } },
        },
      },
    }));
  }
}

/* ---------- Settings view ---------- */

function viewSettings() {
  const st = S.data.settings;
  const catRows = type => catsOf(type).map(c => `
    <li><button class="row-btn" data-action="edit-cat" data-id="${esc(c.id)}">
      ${catIcon(c, 'sm')}
      <span class="row-text"><span class="row-title">${esc(c.name)}</span></span>
      <span class="amt ${c.budget > 0 ? '' : 'zero'}">${c.budget > 0 ? money(c.budget) : '—'}<small>${type === 'income' ? 'monthly target' : 'monthly budget'}</small></span>
    </button></li>`).join('');

  return `
    <div class="grid-2">
      <section class="card">
        <header class="card-head"><h2>General</h2></header>
        <div class="set-row"><span class="lbl">Currency symbol<small>Shown after every amount</small></span><input data-setting="currency" value="${esc(st.currency)}" maxlength="6"></div>
        <div class="set-row"><span class="lbl">Decimals<small>Show centavos or not</small></span>
          <select data-setting="decimals"><option value="2" ${st.decimals == 2 ? 'selected' : ''}>1,250.00</option><option value="0" ${st.decimals == 0 ? 'selected' : ''}>1,250</option></select></div>
        <div class="set-row"><span class="lbl">Appearance</span>
          <select data-setting="theme">${['auto', 'light', 'dark'].map(t => `<option value="${t}" ${st.theme === t ? 'selected' : ''}>${t === 'auto' ? 'Match device' : t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
        <div class="set-row"><span class="lbl">Category icons<small>Letters or emojis on categories</small></span>
          <select data-setting="iconStyle"><option value="initials" ${!['emoji', 'none'].includes(st.iconStyle) ? 'selected' : ''}>Initials (RG)</option><option value="emoji" ${st.iconStyle === 'emoji' ? 'selected' : ''}>Emojis</option><option value="none" ${st.iconStyle === 'none' ? 'selected' : ''}>Plain text</option></select></div>
      </section>

      <section class="card">
        <header class="card-head"><h2>Backup &amp; data</h2></header>
        <p class="hint" style="margin-bottom:12px">Your data is saved on your server in <b>data/cashflow.json</b>, with automatic hourly backups. You can also keep your own copy.</p>
        <div class="btn-row">
          <button class="btn" data-action="export-json">${ic('download', 18)} Backup (JSON)</button>
          <button class="btn" data-action="export-csv">${ic('download', 18)} Export CSV</button>
          <label class="btn">${ic('upload', 18)} Restore<input type="file" id="import-file" accept=".json,application/json" hidden></label>
        </div>
        <div class="set-row" style="margin-top:12px"><span class="lbl">Sync status<small>On your phone, pull down on any page to sync</small></span><span class="sync"></span></div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn" data-action="sync-now">${ic('refresh', 18)} Sync now</button>
          <button class="btn" data-action="force-update">${ic('download', 18)} Update app</button>
        </div>
      </section>

      <section class="card">
        <header class="card-head"><div><h2>Expense categories &amp; budgets</h2><span class="sub">Tap one to edit</span></div><button class="btn btn-sm" data-action="new-cat" data-type="expense">${ic('plus', 16)} Add</button></header>
        <ul class="list">${catRows('expense')}</ul>
      </section>

      <section class="card">
        <header class="card-head"><div><h2>Income categories &amp; targets</h2><span class="sub">Tap one to edit</span></div><button class="btn btn-sm" data-action="new-cat" data-type="income">${ic('plus', 16)} Add</button></header>
        <ul class="list">${catRows('income')}</ul>
      </section>

      ${installCard()}

      <section class="card">
        <header class="card-head"><h2>Security</h2></header>
        <div class="btn-row">
          <button class="btn" data-action="change-password">${ic('lock', 18)} Change password</button>
          <button class="btn btn-danger" data-action="logout">${ic('logout', 18)} Log out</button>
        </div>
      </section>
    </div>`;
}

/* ======================================================================
   Sheets (forms)
   ====================================================================== */

let sheetTimer = null;

function openSheet(title, body) {
  clearTimeout(sheetTimer);
  const sheet = $('#sheet');
  $('.sheet-panel', sheet).innerHTML = `
    <header class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close-sheet" aria-label="Close">${ic('x')}</button></header>
    ${body}`;
  sheet.hidden = false;
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
  const focus = $('[autofocus]', sheet);
  if (focus) setTimeout(() => focus.focus({ preventScroll: true }), 60);
}

function closeSheet() {
  const sheet = $('#sheet');
  if (sheet.hidden) return;
  sheet.classList.remove('open');
  document.body.classList.remove('noscroll');
  sheetTimer = setTimeout(() => { sheet.hidden = true; $('.sheet-panel', sheet).innerHTML = ''; }, 260);
}

const typeSeg = (type, name = 'type') => `
  <div class="seg">
    <label class="t-expense"><input type="radio" name="${name}" value="expense" ${type === 'expense' ? 'checked' : ''}><span>${ic('up', 16)} Expense</span></label>
    <label class="t-income"><input type="radio" name="${name}" value="income" ${type === 'income' ? 'checked' : ''}><span>${ic('down', 16)} Income</span></label>
  </div>`;

/** Categories only ever used by fixed payments: those are marked done from the Month list, not added by hand. */
function fixedOnlyCats() {
  const now = ymNow();
  const fixed = new Set(S.data.recurring.filter(r => !r.end || r.end >= now).map(r => r.category));
  for (const t of S.data.transactions) if (!t.recurringId) fixed.delete(t.category);
  return fixed;
}

/** Category picker. hideFixed (new-entry form) tucks fixed-only categories behind a "More" chip. */
function catGrid(type, selected, hideFixed = false) {
  const all = catsOf(type);
  const fixed = hideFixed ? fixedOnlyCats() : new Set();
  let list = all.filter(c => !fixed.has(c.id) || c.id === selected);
  if (!list.length) list = all;
  const more = list.length < all.length
    ? `<button type="button" class="cat-chip cat-new" data-action="cat-all" data-type="${type}"><span><i>…</i>Fixed</span></button>` : '';
  const sel = [selected, otherCat(type)].find(id => id && list.some(c => c.id === id)) || list[0]?.id;
  return list.map(c => `
    <label class="cat-chip" style="--c:${esc(c.color)}">
      <input type="radio" name="category" value="${esc(c.id)}" ${c.id === sel ? 'checked' : ''} required>
      <span>${plainCats() ? '' : `<i>${glyph(c)}</i>`}${esc(c.name)}</span>
    </label>`).join('') +
    more + `<button type="button" class="cat-chip cat-new" data-action="inline-cat" data-type="${type}"><span><i>＋</i>New</span></button>`;
}

/** The new-entry form's grid hides fixed-only categories; every other picker shows them all. */
const gridHidesFixed = grid => grid?.dataset.hideFixed === '1';

/** Small inline editor that replaces the "+ New" chip, so a category can be created mid-entry. */
function inlineCatEditor(type) {
  return `
    <div class="inline-cat" data-type="${type}">
      ${useEmoji() ? '<input class="ic-emoji" value="📦" maxlength="8" aria-label="Icon">' : ''}
      <input class="ic-name" placeholder="New ${type} category" maxlength="40" aria-label="Category name">
      <button type="button" class="btn btn-primary btn-sm" data-action="inline-cat-save">Add</button>
      <button type="button" class="icon-btn" data-action="inline-cat-cancel" aria-label="Cancel">${ic('x', 18)}</button>
    </div>`;
}

/** Pick the preferred category if it still exists, otherwise the first of that type. */
const pickCat = (type, preferred) => (catsOf(type).some(c => c.id === preferred) ? preferred : catsOf(type)[0]?.id || '');

/** Grow the big amount input with its content so the currency sits right beside the number. */
const amountWidth = text => `${Math.max(1, text.length) + 0.4}ch`;

const amountField = (type, value) => `
  <label class="amount-field ${type}">
    <input name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${value ? round2(value) : ''}" style="width:${amountWidth(value ? String(round2(value)) : '')}" required autofocus aria-label="Amount">
    <span class="cur">${esc(S.data.settings.currency)}</span>
  </label>`;

/** Default date for a new entry: today if viewing this month, else the 1st of the viewed month. */
const defaultDate = () => (S.month === ymNow() ? todayISO() : `${S.month}-01`);

function txForm(t) {
  const isNew = !t;
  // New entries default to planned: most are expected expenses, marked paid later.
  t = t || { type: 'expense', amount: '', category: '', date: defaultDate(), note: '', paid: false };
  openSheet(isNew ? 'New entry' : 'Edit entry', `
    <form class="form" data-form="tx">
      <input type="hidden" name="id" value="${esc(t.id || '')}">
      ${typeSeg(t.type)}
      ${amountField(t.type, t.amount)}
      <div class="field-row">
        <label class="field"><span class="label">Date</span><input type="date" name="date" value="${esc(t.date)}" required></label>
        <label class="field"><span class="label">Note</span><input name="note" value="${esc(t.note || '')}" placeholder="Optional" maxlength="80"></label>
      </div>
      <label class="switch"><span>Already ${t.type === 'income' ? 'received' : 'paid'}<small>Leave off to plan it for later</small></span><input type="checkbox" name="paid" ${t.paid ? 'checked' : ''}><span class="track"></span></label>
      <div class="field"><span class="label">Category${isNew ? '<small> · optional, defaults to Other</small>' : ''}</span><div class="cat-grid" id="cat-grid" ${isNew ? 'data-hide-fixed="1"' : ''}>${catGrid(t.type, t.category, isNew)}</div></div>
      ${!isNew && !t.paid && !t.recurringId
        ? `<button type="button" class="btn btn-block" data-action="move-next" data-id="${esc(t.id)}">${ic('next', 18)} Move to ${ymLabel(ymAdd(ymOf(t.date), 1))}</button>` : ''}
      <div class="sheet-actions">
        ${isNew ? '' : `<button type="button" class="btn btn-danger" data-action="delete-tx" data-id="${esc(t.id)}">${ic('trash', 18)} Delete</button>`}
        <button class="btn btn-primary btn-lg">${isNew ? 'Add' : 'Save'}</button>
      </div>
    </form>`);
}

function payForm(p) {
  const r = S.data.recurring.find(x => x.id === p.rid);
  const date = p.ym === ymNow() ? todayISO() : p.date;
  const verb = p.type === 'income' ? 'received' : 'paid';
  openSheet(p.note, `
    <form class="form" data-form="pay">
      <input type="hidden" name="rid" value="${esc(p.rid)}">
      <input type="hidden" name="ym" value="${esc(p.ym)}">
      <p class="hint" style="text-align:center">${ic('repeat', 12).replace('class="ic"', 'class="ic" style="display:inline;vertical-align:-1px"')} Fixed ${p.type} · due ${dateShort(p.date)} · ${esc(cat(p.category).name)}</p>
      ${amountField(p.type, p.amount)}
      <p class="hint" style="text-align:center;margin-top:-10px">${p.custom
        ? `Changed for ${ymLabel(p.ym)} · default is ${money(r.amount)} · <button type="button" class="link" data-action="month-amount-reset" data-rid="${esc(p.rid)}" data-ym="${esc(p.ym)}">Reset</button>`
        : `Default amount for every month`}</p>
      <label class="field"><span class="label">Date ${verb}</span><input type="date" name="date" value="${date}" required></label>
      <button class="btn btn-primary btn-lg btn-block">${ic('check')} Mark as ${verb}</button>
      <button type="button" class="btn btn-block" data-action="month-amount" data-rid="${esc(p.rid)}" data-ym="${esc(p.ym)}">Not ${verb} yet — just save this amount for ${ymLabel(p.ym)}</button>
      <div class="btn-row" style="justify-content:center">
        <button type="button" class="btn btn-ghost btn-sm" data-action="skip" data-rid="${esc(p.rid)}" data-ym="${esc(p.ym)}">${ic('skip', 16)} Skip this month</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="edit-recurring" data-id="${esc(r.id)}">${ic('edit', 16)} Edit fixed payment</button>
      </div>
    </form>`);
}

function recurringForm(r) {
  const isNew = !r;
  r = r || { type: 'expense', name: '', amount: '', category: '', day: 1, start: S.month < ymNow() ? ymNow() : S.month, end: null };
  openSheet(isNew ? 'New fixed payment' : 'Edit fixed payment', `
    <form class="form" data-form="recurring">
      <input type="hidden" name="id" value="${esc(r.id || '')}">
      ${typeSeg(r.type)}
      ${amountField(r.type, r.amount)}
      <p class="hint" style="text-align:center;margin-top:-10px">Default amount for every month</p>
      <label class="field"><span class="label">Name</span><input name="name" value="${esc(r.name)}" placeholder="e.g. Rent, Salary, Internet" required maxlength="60"></label>
      <div class="field"><span class="label">Category</span><div class="cat-grid" id="cat-grid">${catGrid(r.type, r.category)}</div></div>
      <div class="field-row">
        <label class="field"><span class="label">Day of month</span><input type="number" name="day" min="1" max="31" value="${r.day}" required></label>
        <label class="field"><span class="label">Starts</span><input type="month" name="start" value="${esc(r.start)}" placeholder="YYYY-MM" pattern="\\d{4}-\\d{2}" required></label>
      </div>
      <label class="field"><span class="label">Ends (optional)</span><input type="month" name="end" value="${esc(r.end || '')}" placeholder="YYYY-MM" pattern="\\d{4}-\\d{2}"><span class="hint">Leave empty if it never ends. Changing the default doesn't touch months already paid.</span></label>
      ${isNew ? '' : `
      <div class="field"><span class="label">Different amount in specific months</span>
        <ul class="ov-list" id="ov-list">${overrideList(r)}</ul>
        <div class="ov-add">
          <input type="month" class="ov-month" value="${ymAdd(ymNow(), 1)}" placeholder="YYYY-MM" aria-label="Month">
          <input class="ov-amount" inputmode="decimal" placeholder="Amount" aria-label="Amount for that month">
          <button type="button" class="btn btn-sm" data-action="ov-add" data-rid="${esc(r.id)}">Set</button>
        </div>
        <span class="hint">Every other month uses the default. You can also change a month from its Upcoming list.</span>
      </div>`}
      <div class="sheet-actions">
        ${isNew ? '' : `<button type="button" class="btn btn-danger" data-action="delete-recurring" data-id="${esc(r.id)}">${ic('trash', 18)} Delete</button>`}
        <button class="btn btn-primary btn-lg">${isNew ? 'Create' : 'Save'}</button>
      </div>
    </form>`);
}

function overrideList(r) {
  const months = Object.keys(r.overrides || {}).sort();
  if (!months.length) return '<li class="hint">None — the default is used every month.</li>';
  return months.map(ym => `
    <li><span>${ymLabel(ym)}</span><b class="num">${money(r.overrides[ym])}</b>
    <button type="button" class="icon-btn" data-action="ov-remove" data-rid="${esc(r.id)}" data-ym="${ym}" aria-label="Use default for ${ymLabel(ym)}">${ic('x', 16)}</button></li>`).join('');
}

/** Set (or clear, with amount = null) a single month's amount of a fixed payment. */
function setOverride(rid, ym, amount) {
  mutate(d => {
    const r = d.recurring.find(x => x.id === rid);
    r.overrides = { ...(r.overrides || {}) };
    if (amount == null || amount === r.amount) delete r.overrides[ym];
    else r.overrides[ym] = amount;
  });
  const list = $('#ov-list');
  if (list) list.innerHTML = overrideList(S.data.recurring.find(x => x.id === rid));
}

const EMOJIS = ['🏠', '🛒', '🚗', '⛽', '💡', '💧', '📱', '🌐', '🩺', '💊', '🎓', '📚', '👨‍👩‍👧', '👶', '🍽️', '☕', '🎉', '🛍️', '👕', '✈️', '🏦', '💳', '🧾', '🎁', '⛪', '🐶', '🔧', '💼', '💰', '📈', '🏪', '🧑‍💻'];
const GOAL_EMOJIS = ['🎯', '🚗', '💻', '🏠', '✈️', '🎧', '🏋️', '📷', '🪑', '💍', '🎓', '🏖️', '📱', '🛋️', '🐶', '🏦'];
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b'];

const budgetLabel = type => `${type === 'income' ? 'Monthly target' : 'Monthly budget'} (${esc(S.data.settings.currency)})`;
const budgetHint = type => type === 'income'
  ? 'How much you expect to receive each month. Shown next to what you actually received.'
  : 'A monthly spending limit. Leave empty for no limit.';

function catForm(c, type) {
  const isNew = !c;
  c = c || { name: '', icon: '📦', color: COLORS[Math.floor(Math.random() * COLORS.length)], type, budget: 0 };
  openSheet(isNew ? 'New category' : 'Edit category', `
    <form class="form" data-form="category">
      <input type="hidden" name="id" value="${esc(c.id || '')}">
      ${typeSeg(c.type, 'ctype')}
      <div class="field-row" style="grid-template-columns:${useEmoji() ? '80px 1fr' : '1fr'}">
        ${useEmoji()
          ? `<label class="field"><span class="label">Icon</span><input name="icon" value="${esc(c.icon)}" maxlength="8" style="text-align:center;font-size:22px;padding:8px" required></label>`
          : `<input type="hidden" name="icon" value="${esc(c.icon)}">`}
        <label class="field"><span class="label">Name</span><input name="name" value="${esc(c.name)}" required maxlength="40" autofocus></label>
      </div>
      ${useEmoji() ? `<div class="emoji-pick">${EMOJIS.map(e => `<button type="button" data-action="pick-emoji" data-emoji="${e}">${e}</button>`).join('')}</div>` : ''}
      <div class="field"><span class="label">Color</span>
        <div class="field-row" style="grid-template-columns:70px 1fr;align-items:center"><input type="color" name="color" value="${esc(c.color)}">
        <div class="swatches">${COLORS.map(x => `<button type="button" style="--c:${x}" data-action="pick-color" data-color="${x}" aria-label="${x}"></button>`).join('')}</div></div>
      </div>
      <label class="field"><span class="label" id="cat-budget-label">${budgetLabel(c.type)}</span><input name="budget" inputmode="decimal" value="${c.budget || ''}" placeholder="None"><span class="hint" id="cat-budget-hint">${budgetHint(c.type)}</span></label>
      <div class="sheet-actions">
        ${isNew ? '' : `<button type="button" class="btn btn-danger" data-action="delete-cat" data-id="${esc(c.id)}">${ic('trash', 18)} Delete</button>`}
        <button class="btn btn-primary btn-lg">${isNew ? 'Create' : 'Save'}</button>
      </div>
    </form>`);
}

function passwordForm() {
  openSheet('Change password', `
    <form class="form" data-form="password">
      <label class="field"><span class="label">Current password</span><input type="password" name="current" autocomplete="current-password" required autofocus></label>
      <label class="field"><span class="label">New password</span><input type="password" name="next" autocomplete="new-password" minlength="6" required></label>
      <label class="field"><span class="label">Repeat new password</span><input type="password" name="confirm" autocomplete="new-password" minlength="6" required></label>
      <p class="form-error" id="pw-error"></p>
      <button class="btn btn-primary btn-lg">Update password</button>
      <p class="hint">Other devices will be logged out.</p>
    </form>`);
}

const monthInput = (name, value) =>
  `<input type="month" name="${name}" value="${esc(value || '')}" placeholder="YYYY-MM" pattern="\\d{4}-\\d{2}">`;

function goalForm(g) {
  const isNew = !g;
  g = g || { name: '', icon: '🎯', color: COLORS[Math.floor(Math.random() * COLORS.length)], target: '', initial: 0, deadline: '' };
  openSheet(isNew ? 'New goal' : 'Edit goal', `
    <form class="form" data-form="goal">
      <input type="hidden" name="id" value="${esc(g.id || '')}">
      <div class="field-row" style="grid-template-columns:${useEmoji() ? '80px 1fr' : '1fr'}">
        ${useEmoji()
          ? `<label class="field"><span class="label">Icon</span><input name="icon" value="${esc(g.icon)}" maxlength="8" style="text-align:center;font-size:22px;padding:8px" required></label>`
          : `<input type="hidden" name="icon" value="${esc(g.icon)}">`}
        <label class="field"><span class="label">What are you saving for?</span><input name="name" value="${esc(g.name)}" placeholder="e.g. MacBook, Car, Holiday" required maxlength="50" autofocus></label>
      </div>
      ${useEmoji() ? `<div class="emoji-pick">${GOAL_EMOJIS.map(e => `<button type="button" data-action="pick-emoji" data-emoji="${e}">${e}</button>`).join('')}</div>` : ''}
      <div class="field-row">
        <label class="field"><span class="label">Target (${esc(S.data.settings.currency)})</span><input name="target" inputmode="decimal" value="${g.target || ''}" required></label>
        <label class="field"><span class="label">Already saved</span><input name="initial" inputmode="decimal" value="${g.initial || ''}" placeholder="0"></label>
      </div>
      <label class="field"><span class="label">Target date (optional)</span>${monthInput('deadline', g.deadline)}<span class="hint">Shows how much to put aside each month.</span></label>
      <div class="field"><span class="label">Color</span><input type="hidden" name="color" value="${esc(g.color)}">
        <div class="swatches">${COLORS.map(x => `<button type="button" class="${x === g.color ? 'sel' : ''}" style="--c:${x}" data-action="pick-color" data-color="${x}" aria-label="${x}"></button>`).join('')}</div></div>
      <div class="sheet-actions">
        ${isNew ? '' : `<button type="button" class="btn btn-danger" data-action="delete-goal" data-id="${esc(g.id)}">${ic('trash', 18)} Delete</button>`}
        <button class="btn btn-primary btn-lg">${isNew ? 'Create goal' : 'Save'}</button>
      </div>
    </form>`);
}

function debtForm(d) {
  const isNew = !d;
  d = d || { type: 'owe', name: '', total: '', initial: 0, due: '', note: '' };
  openSheet(isNew ? 'New debt' : 'Edit debt', `
    <form class="form" data-form="debt">
      <input type="hidden" name="id" value="${esc(d.id || '')}">
      <div class="seg">
        <label class="t-expense"><input type="radio" name="dtype" value="owe" ${d.type !== 'lent' ? 'checked' : ''}><span>I owe</span></label>
        <label class="t-income"><input type="radio" name="dtype" value="lent" ${d.type === 'lent' ? 'checked' : ''}><span>Owed to me</span></label>
      </div>
      <label class="field"><span class="label">Person or reason</span><input name="name" value="${esc(d.name)}" placeholder="e.g. Kota, Samora, AC repair" required maxlength="50" autofocus></label>
      <div class="field-row">
        <label class="field"><span class="label">Total amount</span><input name="total" inputmode="decimal" value="${d.total || ''}" required></label>
        <label class="field"><span class="label">Already paid</span><input name="initial" inputmode="decimal" value="${d.initial || ''}" placeholder="0"></label>
      </div>
      <label class="field"><span class="label">Due (optional)</span>${monthInput('due', d.due)}</label>
      <label class="field"><span class="label">Note</span><input name="note" value="${esc(d.note || '')}" placeholder="Optional" maxlength="80"></label>
      <div class="sheet-actions">
        ${isNew ? '' : `<button type="button" class="btn btn-danger" data-action="delete-debt" data-id="${esc(d.id)}">${ic('trash', 18)} Delete</button>`}
        <button class="btn btn-primary btn-lg">${isNew ? 'Add debt' : 'Save'}</button>
      </div>
    </form>`);
}

/** Shared sheet for "add money to goal" and "pay / receive a debt": both create a linked transaction. */
function linkedPayForm(kind, item) {
  const isGoal = kind === 'goal';
  const left = isGoal ? Math.max(0, round2(item.target - goalSaved(item))) : debtLeft(item);
  const income = !isGoal && item.type === 'lent';
  const title = isGoal ? `Add to ${item.name}` : income ? `Received from ${item.name}` : `Pay ${item.name}`;
  openSheet(title, `
    <form class="form" data-form="linked-pay">
      <input type="hidden" name="kind" value="${kind}">
      <input type="hidden" name="id" value="${esc(item.id)}">
      <p class="hint" style="text-align:center">${money(left)} ${isGoal ? 'still to save' : 'remaining'}</p>
      ${amountField(income ? 'income' : 'expense', isGoal ? '' : left)}
      <div class="field"><span class="label">Category in cashflow</span>
        <div class="cat-grid" id="cat-grid">${catGrid(income ? 'income' : 'expense', pickCat(income ? 'income' : 'expense', isGoal ? 'savings' : income ? 'other-in' : 'debt'))}</div></div>
      <label class="field"><span class="label">Date</span><input type="date" name="date" value="${todayISO()}" required></label>
      <button class="btn btn-primary btn-lg btn-block">${ic('check')} ${isGoal ? 'Add to goal' : income ? 'Record payment received' : 'Record payment'}</button>
    </form>`);
}

/* ======================================================================
   Actions & form handlers
   ====================================================================== */

function findPending(id) {
  return pendingFor(S.month).find(p => p.id === id);
}

function payPending(p, amount, date) {
  if (!p.virtual) {
    mutate(d => { const t = d.transactions.find(x => x.id === p.id); t.paid = true; }, `Marked as ${p.type === 'income' ? 'received' : 'paid'}`);
    return;
  }
  mutate(d => d.transactions.push({
    id: uid(), created: Date.now(), type: p.type, amount, category: p.category, note: p.note, date, paid: true, recurringId: p.rid,
  }), `${p.note} ${p.type === 'income' ? 'received' : 'paid'}`);
}

/** Push unpaid one-off entries one month later, keeping the day (clamped to the month's length). */
function moveToNextMonth(ids) {
  const target = ymAdd(ymOf(S.data.transactions.find(t => t.id === ids[0]).date), 1);
  mutate(d => {
    for (const t of d.transactions) {
      if (!ids.includes(t.id)) continue;
      const ym = ymAdd(ymOf(t.date), 1);
      t.date = `${ym}-${pad(Math.min(Number(t.date.slice(8)), daysIn(ym)))}`;
    }
  }, `${ids.length === 1 ? 'Moved' : `${ids.length} entries moved`} to ${ymLabel(target)}`);
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ACTIONS = {
  go: el => { S.view = el.dataset.view; closeSheet(); render(); window.scrollTo(0, 0); },
  add: () => txForm(),
  'prev-month': () => { S.month = ymAdd(S.month, -1); render(); },
  'next-month': () => { S.month = ymAdd(S.month, 1); render(); },
  'this-month': () => { S.month = ymNow(); render(); },
  'goto-month': el => { S.month = el.dataset.ym; render(); },
  'close-sheet': closeSheet,
  filter: el => { S.filter = el.dataset.filter; render(); },
  'edit-tx': el => txForm(S.data.transactions.find(t => t.id === el.dataset.id)),
  'delete-tx': el => {
    closeSheet();
    mutate(d => { d.transactions = d.transactions.filter(t => t.id !== el.dataset.id); }, 'Entry deleted');
  },
  quickpay: el => {
    const p = findPending(el.dataset.id);
    // Paying during the current month records today's date; catching up on an old month keeps the due date.
    if (p) payPending(p, p.amount, p.ym === ymNow() ? todayISO() : p.date);
  },
  'open-pending': el => {
    const p = findPending(el.dataset.id);
    if (!p) return;
    if (p.virtual) payForm(p); else txForm(p);
  },
  skip: el => {
    closeSheet();
    mutate(d => { const r = d.recurring.find(x => x.id === el.dataset.rid); r.skips = [...(r.skips || []), el.dataset.ym]; }, `Skipped for ${ymLabel(el.dataset.ym)}`);
  },
  'new-recurring': () => recurringForm(),
  'edit-recurring': el => recurringForm(S.data.recurring.find(r => r.id === el.dataset.id)),
  'delete-recurring': el => {
    const r = S.data.recurring.find(x => x.id === el.dataset.id);
    if (!confirm(`Delete "${r.name}"? Past payments stay in your history.\n\nTip: to stop it from a certain month, set an end month instead.`)) return;
    closeSheet();
    mutate(d => { d.recurring = d.recurring.filter(x => x.id !== r.id); }, 'Fixed payment deleted');
  },
  'new-cat': el => catForm(null, el.dataset.type),
  'edit-cat': el => catForm(S.data.categories.find(c => c.id === el.dataset.id)),
  'delete-cat': el => {
    const id = el.dataset.id;
    const used = S.data.transactions.filter(t => t.category === id).length + S.data.recurring.filter(r => r.category === id).length;
    if (used && !confirm(`This category is used by ${used} entr${used === 1 ? 'y' : 'ies'}. They will show as "Uncategorized". Delete anyway?`)) return;
    closeSheet();
    mutate(d => { d.categories = d.categories.filter(c => c.id !== id); }, 'Category deleted');
  },
  'move-next': el => {
    closeSheet();
    moveToNextMonth([el.dataset.id]);
  },
  'move-all-next': () => {
    const ids = pendingFor(S.month).filter(p => p.type === 'expense' && !isFixed(p)).map(p => p.id);
    if (ids.length && confirm(`Move ${ids.length} unpaid expenses to ${ymLabel(ymAdd(S.month, 1))}?`)) moveToNextMonth(ids);
  },
  install: async () => {
    if (!installPrompt) return installHelp();
    const prompt = installPrompt;
    installPrompt = null;
    prompt.prompt();
    await prompt.userChoice;
    updateInstallUI();
  },
  'install-dismiss': () => {
    try { localStorage.setItem('bbcash.installDismissed', '1'); } catch (e) { /* ignore */ }
    render();
  },
  'install-help': installHelp,
  'sync-now': syncNow,
  'force-update': forceUpdate,
  'month-amount': el => {
    const form = el.closest('form');
    const amount = parseAmount(form.amount.value);
    if (!(amount > 0)) return invalid(form, 'amount');
    closeSheet();
    setOverride(el.dataset.rid, el.dataset.ym, amount);
    toast(`Amount saved for ${ymLabel(el.dataset.ym)}`);
  },
  'month-amount-reset': el => {
    closeSheet();
    setOverride(el.dataset.rid, el.dataset.ym, null);
    toast('Back to the default amount');
  },
  'ov-add': el => {
    const box = el.closest('.ov-add');
    const ym = $('.ov-month', box).value;
    const amount = parseAmount($('.ov-amount', box).value);
    if (!/^\d{4}-\d{2}$/.test(ym)) return $('.ov-month', box).focus();
    if (!(amount > 0)) return $('.ov-amount', box).focus(); // use "Skip this month" for zero
    setOverride(el.dataset.rid, ym, amount);
    $('.ov-amount', box).value = '';
    toast(`${ymLabel(ym)} set to ${money(amount)}`);
  },
  'ov-remove': el => setOverride(el.dataset.rid, el.dataset.ym, null),
  'inline-cat': el => {
    el.outerHTML = inlineCatEditor(el.dataset.type);
    $('#sheet .inline-cat .ic-name').focus();
  },
  'inline-cat-cancel': el => {
    const box = el.closest('.inline-cat');
    const grid = box.closest('.cat-grid');
    grid.innerHTML = catGrid(box.dataset.type, $('input[name="category"]:checked', grid)?.value, gridHidesFixed(grid));
  },
  'inline-cat-save': el => {
    const box = el.closest('.inline-cat');
    const name = $('.ic-name', box).value.trim();
    if (!name) { $('.ic-name', box).focus(); return; }
    const c = { id: uid(), name, icon: $('.ic-emoji', box)?.value.trim() || '📦', color: COLORS[Math.floor(Math.random() * COLORS.length)], type: box.dataset.type, budget: 0 };
    mutate(d => d.categories.push(c));
    toast(`Category "${name}" added`);
    const grid = box.closest('.cat-grid');
    grid.innerHTML = catGrid(c.type, c.id, gridHidesFixed(grid));
  },
  'cat-all': el => {
    const grid = el.closest('.cat-grid');
    delete grid.dataset.hideFixed;
    grid.innerHTML = catGrid(el.dataset.type, $('input[name="category"]:checked', grid)?.value);
  },
  'pick-emoji': el => { $('#sheet [name="icon"]').value = el.dataset.emoji; },
  'pick-color': el => {
    $('#sheet [name="color"]').value = el.dataset.color;
    $$('#sheet .swatches button').forEach(b => b.classList.toggle('sel', b === el));
  },
  'new-goal': () => goalForm(),
  'edit-goal': el => goalForm(S.data.goals.find(g => g.id === el.dataset.id)),
  'goal-add': el => linkedPayForm('goal', S.data.goals.find(g => g.id === el.dataset.id)),
  'delete-goal': el => {
    const g = S.data.goals.find(x => x.id === el.dataset.id);
    if (!confirm(`Delete the goal "${g.name}"? Money already added stays in your cashflow history.`)) return;
    closeSheet();
    mutate(d => { d.goals = d.goals.filter(x => x.id !== g.id); }, 'Goal deleted');
  },
  'new-debt': () => debtForm(),
  'edit-debt': el => debtForm(S.data.debts.find(x => x.id === el.dataset.id)),
  'debt-pay': el => linkedPayForm('debt', S.data.debts.find(x => x.id === el.dataset.id)),
  'delete-debt': el => {
    const debt = S.data.debts.find(x => x.id === el.dataset.id);
    if (!confirm(`Delete "${debt.name}"? Payments already made stay in your cashflow history.`)) return;
    closeSheet();
    mutate(d => { d.debts = d.debts.filter(x => x.id !== debt.id); }, 'Debt deleted');
  },
  undo: () => { const fn = S.undo; hideToast(); if (fn) fn(); },
  'export-json': () => download(`bbcash-backup-${todayISO()}.json`, JSON.stringify(S.data, null, 2), 'application/json'),
  'export-csv': () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Type', 'Category', 'Note', 'Amount', 'Status', 'Fixed']];
    [...S.data.transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach(t =>
      rows.push([t.date, t.type, cat(t.category).name, t.note || '', t.type === 'income' ? t.amount : -t.amount, t.paid ? 'paid' : 'planned', t.recurringId ? 'yes' : '']));
    download(`bbcash-${todayISO()}.csv`, '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv');
  },
  'change-password': passwordForm,
  logout: async () => {
    if (S.dirty && !confirm('Some changes have not synced yet and will be lost. Log out anyway?')) return;
    try { await api('logout', {}); } catch (e) { /* ignore */ }
    localStorage.removeItem(CACHE_KEY);
    S.data = null;
    showAuth('login');
  },
};

const FORMS = {
  tx(form, fd) {
    const amount = parseAmount(fd.get('amount'));
    if (!(amount > 0)) return invalid(form, 'amount');
    const id = fd.get('id');
    const entry = {
      type: fd.get('type'), amount, category: fd.get('category'),
      date: fd.get('date'), note: fd.get('note').trim(), paid: fd.get('paid') === 'on',
    };
    closeSheet();
    if (id) {
      mutate(d => Object.assign(d.transactions.find(t => t.id === id), entry), 'Entry updated');
    } else {
      mutate(d => d.transactions.push({ id: uid(), created: Date.now(), recurringId: null, ...entry }), `${entry.type === 'income' ? 'Income' : 'Expense'} added`);
    }
    if (ymOf(entry.date) !== S.month) { S.month = ymOf(entry.date); render(); }
  },

  pay(form, fd) {
    const amount = parseAmount(fd.get('amount'));
    if (!(amount > 0)) return invalid(form, 'amount');
    const p = pendingFor(fd.get('ym')).find(x => x.rid === fd.get('rid'));
    closeSheet();
    if (p) payPending(p, amount, fd.get('date'));
  },

  recurring(form, fd) {
    const amount = parseAmount(fd.get('amount'));
    if (!(amount > 0)) return invalid(form, 'amount');
    const day = Math.min(31, Math.max(1, Number(fd.get('day')) || 1));
    const start = fd.get('start');
    const end = fd.get('end') || null;
    if (end && end < start) return invalid(form, 'end');
    const id = fd.get('id');
    const r = { type: fd.get('type'), name: fd.get('name').trim(), amount, category: fd.get('category'), day, start, end };
    closeSheet();
    if (id) mutate(d => Object.assign(d.recurring.find(x => x.id === id), r), 'Fixed payment updated');
    else mutate(d => d.recurring.push({ id: uid(), skips: [], ...r }), 'Fixed payment created — it now shows every month');
  },

  category(form, fd) {
    const id = fd.get('id');
    const c = {
      name: fd.get('name').trim(), icon: fd.get('icon').trim() || '📦', color: fd.get('color'), type: fd.get('ctype'),
      budget: parseAmount(fd.get('budget')) || 0,
    };
    closeSheet();
    if (id) mutate(d => Object.assign(d.categories.find(x => x.id === id), c), 'Category saved');
    else mutate(d => d.categories.push({ id: uid(), ...c }), 'Category added');
  },

  goal(form, fd) {
    const target = parseAmount(fd.get('target'));
    if (!(target > 0)) return invalid(form, 'target');
    const id = fd.get('id');
    const g = {
      name: fd.get('name').trim(), icon: fd.get('icon').trim() || '🎯', color: fd.get('color'),
      target, initial: parseAmount(fd.get('initial')) || 0, deadline: fd.get('deadline') || null,
    };
    closeSheet();
    if (id) mutate(d => Object.assign(d.goals.find(x => x.id === id), g), 'Goal saved');
    else mutate(d => d.goals.push({ id: uid(), created: Date.now(), ...g }), 'Goal created');
  },

  debt(form, fd) {
    const total = parseAmount(fd.get('total'));
    if (!(total > 0)) return invalid(form, 'total');
    const id = fd.get('id');
    const debt = {
      type: fd.get('dtype'), name: fd.get('name').trim(), total,
      initial: parseAmount(fd.get('initial')) || 0, due: fd.get('due') || null, note: fd.get('note').trim(),
    };
    closeSheet();
    if (id) mutate(d => Object.assign(d.debts.find(x => x.id === id), debt), 'Debt saved');
    else mutate(d => d.debts.push({ id: uid(), created: Date.now(), ...debt }), 'Debt added');
  },

  'linked-pay'(form, fd) {
    const amount = parseAmount(fd.get('amount'));
    if (!(amount > 0)) return invalid(form, 'amount');
    const id = fd.get('id');
    const date = fd.get('date');
    const base = { id: uid(), created: Date.now(), amount, date, paid: true, recurringId: null };
    closeSheet();
    if (fd.get('kind') === 'goal') {
      const g = S.data.goals.find(x => x.id === id);
      mutate(d => d.transactions.push({ ...base, type: 'expense', category: fd.get('category'), note: g.name, goalId: id }), `${money(amount)} added to ${g.name}`);
    } else {
      const debt = S.data.debts.find(x => x.id === id);
      const lent = debt.type === 'lent';
      mutate(d => d.transactions.push({
        ...base, type: lent ? 'income' : 'expense', category: fd.get('category'),
        note: lent ? `${debt.name} (repaid)` : `${debt.name} (debt)`, debtId: id,
      }), lent ? 'Payment received' : 'Payment recorded');
    }
  },

  async password(form, fd) {
    const err = $('#pw-error');
    if (fd.get('next') !== fd.get('confirm')) { err.textContent = 'New passwords do not match.'; return; }
    try {
      await api('password', { current: fd.get('current'), next: fd.get('next') });
      closeSheet();
      toast('Password updated');
    } catch (e) {
      err.textContent = e.message;
    }
  },

  async setup(form, fd) {
    const err = $('#auth-error');
    if (fd.get('password') !== fd.get('confirm')) { err.textContent = 'Passwords do not match.'; return; }
    await authSubmit(form, () => api('setup', { password: fd.get('password') }));
  },

  async login(form, fd) {
    await authSubmit(form, () => api('login', { password: fd.get('password') }));
  },
};

function invalid(form, name) {
  const el = form.querySelector(`[name="${name}"]`);
  el.focus();
  el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 220 });
}

/* ======================================================================
   Toast
   ====================================================================== */

let toastTimer = null;

function toast(message, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button data-action="undo">Undo</button>' : ''}`;
  S.undo = undo || null;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 5000 : 2800);
}

function hideToast() {
  $('#toast').classList.remove('show');
  S.undo = null;
}

/* ======================================================================
   Theme
   ====================================================================== */

function applyTheme() {
  const t = S.data?.settings.theme || 'auto';
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { localStorage.setItem('bbcash.theme', t); } catch (e) { /* ignore */ }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  $('meta[name="theme-color"]').setAttribute('content', bg);
}

/* ======================================================================
   Install as an app (PWA)
   ====================================================================== */

let installPrompt = null; // Chrome / Edge / Android hand us this event; Safari never does.

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const canInstall = () => !isStandalone() && (!!installPrompt || isIOS());

function installBannerDismissed() {
  try { return localStorage.getItem('bbcash.installDismissed') === '1'; } catch (e) { return false; }
}

function installBanner() {
  if (!canInstall() || installBannerDismissed()) return '';
  return `
    <div class="install-banner">
      <img src="icon.svg" alt="">
      <span><b>Install BB Cash</b><small>Open it from your home screen like a normal app — works offline too.</small></span>
      <button class="btn btn-primary btn-sm" data-action="install">Install</button>
      <button class="icon-btn" data-action="install-dismiss" aria-label="Not now">${ic('x', 18)}</button>
    </div>`;
}

function installCard() {
  let body;
  if (isStandalone()) {
    body = `<p class="hint">✓ You're using the installed app on this device.</p>`;
  } else if (canInstall()) {
    body = `<p class="hint" style="margin-bottom:12px">Install BB Cash on this ${isIOS() || /android/i.test(navigator.userAgent) ? 'phone' : 'computer'} to open it from the home screen, desktop or Start menu, in its own window.</p>
      <button class="btn btn-primary" data-action="install">${ic('download', 18)} Install app</button>`;
  } else {
    body = `<p class="hint" style="margin-bottom:12px">Use your browser's menu to install: <b>Install BB Cash</b> or <b>Add to Home screen</b>.</p>
      <button class="btn" data-action="install-help">How to install</button>`;
  }
  return `<section class="card"><header class="card-head"><h2>App</h2></header>${body}</section>`;
}

function updateInstallUI() {
  const btn = $('#install-side');
  if (btn) btn.hidden = !canInstall();
  if (S.data && (S.view === 'month' || S.view === 'settings') && $('#sheet').hidden) render();
}

function installHelp() {
  const ios = isIOS();
  openSheet('Install BB Cash', ios ? `
    <ol class="steps">
      <li>Open this page in <b>Safari</b>.</li>
      <li>Tap the <b>Share</b> button <span class="kbd">⬆︎</span> at the bottom of the screen.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
      <li>Tap <b>Add</b>. BB Cash now opens like an app from your home screen.</li>
    </ol>` : `
    <ol class="steps">
      <li><b>Chrome or Edge on a computer:</b> click the install icon <span class="kbd">⊕</span> at the right of the address bar, or open the menu <span class="kbd">⋮</span> → <b>Install BB Cash</b> (Edge: <b>Apps → Install this site as an app</b>).</li>
      <li><b>Android (Chrome):</b> menu <span class="kbd">⋮</span> → <b>Install app</b> or <b>Add to Home screen</b>.</li>
      <li><b>Samsung Internet:</b> menu → <b>Add page to</b> → <b>Home screen</b>.</li>
    </ol>
    <p class="hint">The page must be opened over <b>https://</b> for installing to work.</p>`);
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  updateInstallUI();
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  updateInstallUI();
  toast('BB Cash installed' + deco(' 🎉'));
});

/* ======================================================================
   Auth & boot
   ====================================================================== */

function showAuth(mode, message = '') {
  $('#boot').hidden = true;
  $('#app').hidden = true;
  closeSheet();
  const auth = $('#auth');
  auth.hidden = false;
  const setup = mode === 'setup';
  auth.innerHTML = `
    <div class="auth-card">
      <img class="logo" src="icon.svg" alt="">
      <h1>${setup ? 'Welcome to BB Cash' : 'Welcome back'}</h1>
      <p>${setup ? 'Create a password to protect your cashflow. You\'ll use it on your phone and computer.' : 'Enter your password to open your cashflow.'}</p>
      <form data-form="${mode}">
        <input type="password" name="password" placeholder="${setup ? 'New password (min. 6 characters)' : 'Password'}" autocomplete="${setup ? 'new-password' : 'current-password'}" minlength="${setup ? 6 : 1}" required autofocus>
        ${setup ? '<input type="password" name="confirm" placeholder="Repeat password" autocomplete="new-password" minlength="6" required>' : ''}
        <p class="form-error" id="auth-error">${esc(message)}</p>
        <button class="btn btn-primary btn-lg btn-block">${setup ? 'Create & start' : 'Unlock'}</button>
      </form>
    </div>`;
  $('input', auth).focus();
}

async function authSubmit(form, call) {
  const btn = $('button', form);
  btn.disabled = true;
  try {
    await call();
    await loadData();
    startApp();
  } catch (e) {
    $('#auth-error').textContent = e.message;
    btn.disabled = false;
  }
}

async function loadData() {
  const res = await api('load');
  const cache = readCache();
  if (cache && cache.dirty && cache.rev === res.rev && cache.data) {
    // Offline edits made on this device that never reached the server.
    S.data = normalize(cache.data);
    S.rev = cache.rev;
    persist();
  } else if (res.data) {
    S.data = normalize(res.data);
    S.rev = res.rev;
    S.dirty = false;
    writeCache();
  } else {
    S.data = defaultData();
    S.rev = res.rev;
    persist();
  }
}

function startApp() {
  $('#boot').hidden = true;
  $('#auth').hidden = true;
  $('#app').hidden = false;
  if (!$('#app').children.length) renderShell();
  render();
  // Home-screen shortcut "New entry" opens ./?add=1
  const params = new URLSearchParams(location.search);
  if (params.has('add')) {
    history.replaceState(null, '', location.pathname);
    txForm();
  }
}

async function boot() {
  // Service workers need https (localhost is allowed for testing). Required for installing.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  let status;
  try {
    status = await api('status');
  } catch (e) {
    const cache = readCache();
    if (cache?.data) {
      S.data = normalize(cache.data);
      S.rev = cache.rev;
      S.dirty = !!cache.dirty;
      S.offline = true;
      startApp();
      toast('Offline — showing your saved copy');
    } else {
      showAuth('login', 'Cannot reach the server. Check your connection.');
    }
    return;
  }
  if (!status.setup) return showAuth('setup');
  if (!status.authed) return showAuth('login');
  try {
    await loadData();
    startApp();
  } catch (e) {
    showAuth('login', e.message);
  }
}

/* ---------- global listeners ---------- */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});

document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  FORMS[form.dataset.form](form, new FormData(form));
});

document.addEventListener('change', e => {
  const el = e.target;
  // Switching expense/income inside a form swaps the category list and labels.
  if (el.name === 'type' && el.type === 'radio') {
    const form = el.form;
    const grid = $('#cat-grid', form);
    if (grid) grid.innerHTML = catGrid(el.value, $('input[name="category"]:checked', form)?.value, gridHidesFixed(grid));
    $('.amount-field', form)?.classList.remove('expense', 'income');
    $('.amount-field', form)?.classList.add(el.value);
    const sw = $('.switch > span', form);
    if (sw) sw.firstChild.textContent = `Already ${el.value === 'income' ? 'received' : 'paid'}`;
  }
  if (el.name === 'ctype' && el.type === 'radio') {
    $('#cat-budget-label').textContent = budgetLabel(el.value);
    $('#cat-budget-hint').textContent = budgetHint(el.value);
  }
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    let val = el.value;
    if (key === 'startBalance') val = el.value.trim().startsWith('-') ? -parseAmount(el.value) || 0 : parseAmount(el.value) || 0;
    if (key === 'decimals') val = Number(val);
    if (key === 'currency') val = val.trim() || 'MT';
    mutate(d => { d.settings[key] = val; });
    toast('Saved');
  }
  if (el.id === 'import-file' && el.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.transactions) || !Array.isArray(data.categories)) throw new Error();
        if (!confirm(`Replace ALL current data with this backup (${data.transactions.length} transactions)?`)) return;
        mutate(d => Object.assign(d, normalize(data)), 'Backup restored');
      } catch (err) {
        toast('That file is not a valid BB Cash backup.');
      }
    };
    reader.readAsText(el.files[0]);
    el.value = '';
  }
});

document.addEventListener('input', e => {
  if (e.target.name === 'amount' && e.target.closest('.amount-field')) {
    e.target.style.width = amountWidth(e.target.value);
  }
  if (e.target.id === 'tx-search') {
    S.search = e.target.value;
    $('#tx-list').innerHTML = txListInner(S.data.transactions.filter(t => t.paid && ymOf(t.date) === S.month));
  }
});

document.addEventListener('keydown', e => {
  // Enter in the inline category editor adds the category instead of submitting the whole entry.
  if (e.key === 'Enter' && e.target.closest('.inline-cat')) {
    e.preventDefault();
    $('[data-action="inline-cat-save"]', e.target.closest('.inline-cat')).click();
    return;
  }
  if (e.key === 'Enter' && e.target.closest('.ov-add')) {
    e.preventDefault();
    $('[data-action="ov-add"]', e.target.closest('.ov-add')).click();
    return;
  }
  if (e.key === 'Escape') { closeSheet(); return; }
  if (!S.data || !$('#sheet').hidden || $('#app').hidden) return;
  if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); txForm(); }
  if (S.view === 'month' || S.view === 'stats') {
    if (e.key === 'ArrowLeft') ACTIONS['prev-month']();
    if (e.key === 'ArrowRight') ACTIONS['next-month']();
  }
});

/* ---------- pull to refresh (touch) ---------- */

const PTR_MAX = 110;
const PTR_TRIGGER = 70;
let ptr = null;

function setPull(px, spinning) {
  const el = $('#ptr');
  if (!el) return;
  el.classList.toggle('show', px > 0);
  el.classList.toggle('drag', !!ptr && !spinning);
  el.classList.toggle('ready', px >= PTR_TRIGGER);
  el.classList.toggle('spin', !!spinning);
  el.style.transform = `translate(-50%, ${px}px)`;
  el.firstElementChild.style.transform = `rotate(${px * 3}deg)`;
}

document.addEventListener('touchstart', e => {
  if (e.touches.length !== 1 || window.scrollY > 0 || !S.data || S.syncing || $('#app').hidden || !$('#sheet').hidden) return;
  ptr = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, px: 0 };
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (!ptr) return;
  const dx = e.touches[0].clientX - ptr.x0;
  const dy = e.touches[0].clientY - ptr.y0;
  // Scrolling up or swiping sideways: let the page handle it.
  if (dy < 0 || (ptr.px === 0 && Math.abs(dx) > dy) || window.scrollY > 0) {
    ptr = null;
    setPull(0);
    return;
  }
  if (e.cancelable) e.preventDefault();
  ptr.px = Math.min(dy * 0.5, PTR_MAX);
  setPull(ptr.px);
}, { passive: false });

function endPull() {
  if (!ptr) return;
  const go = ptr.px >= PTR_TRIGGER;
  ptr = null;
  if (!go) return setPull(0);
  setPull(64, true);
  syncNow().finally(() => setPull(0));
}

document.addEventListener('touchend', endPull);
document.addEventListener('touchcancel', () => { ptr = null; setPull(0); });

window.addEventListener('online', () => { S.offline = false; flush(); refresh(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { S.dirty ? flush() : refresh(); } });
setInterval(() => { if (S.dirty && !S.saving) { S.offline = false; flush(); } }, 30000);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.data && S.view === 'stats') render(); });

boot();
