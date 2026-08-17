'use strict';

/* localStorage is shared across the whole github.io origin, so this key must be
   prefixed with the app's folder name to avoid colliding with sibling apps. */
const STORAGE_KEY = 'cards.v1';

/* Money is held as whole cents, never as dollars in a float. Balances are
   repeatedly added and subtracted here, and 0.1 + 0.2 style error compounds
   until a card that should read $0.00 reads $0.0000000004 instead. */

/** @typedef {{id: string, amount: number, note: string, at: number}} Entry */
/** @typedef {{id: string, name: string, note: string, initial: number,
 *             entries: Entry[], createdAt: number}} Card */

/** @type {Card[]} */
let cards = load();

const els = {
  views: {
    list: document.getElementById('view-list'),
    detail: document.getElementById('view-detail'),
    spend: document.getElementById('view-spend'),
    edit: document.getElementById('view-edit'),
  },

  cards: document.getElementById('cards'),
  total: document.getElementById('total'),
  subtitle: document.getElementById('subtitle'),
  listEmpty: document.getElementById('list-empty'),
  exportBtn: document.getElementById('export'),
  importBtn: document.getElementById('import'),

  detailName: document.getElementById('detail-name'),
  detailNote: document.getElementById('detail-note'),
  detailBalance: document.getElementById('detail-balance'),
  detailOf: document.getElementById('detail-of'),
  detailMeter: document.getElementById('detail-meter'),
  detailSpend: document.getElementById('detail-spend'),
  detailEdit: document.getElementById('detail-edit'),
  detailDelete: document.getElementById('detail-delete'),
  detailHistory: document.getElementById('detail-history'),
  historyEmpty: document.getElementById('history-empty'),
  historyHeading: document.getElementById('history-heading'),

  spendForm: document.getElementById('spend-form'),
  spendTitle: document.getElementById('spend-title'),
  spendAvailable: document.getElementById('spend-available'),
  spendCancel: document.getElementById('spend-cancel'),
  spendAll: document.getElementById('spend-all'),
  spendError: document.getElementById('spend-error'),
  sAmount: document.getElementById('s-amount'),
  sNote: document.getElementById('s-note'),

  cardForm: document.getElementById('card-form'),
  editHeading: document.getElementById('edit-heading'),
  editCancel: document.getElementById('edit-cancel'),
  editHint: document.getElementById('edit-hint'),
  formError: document.getElementById('form-error'),
  fName: document.getElementById('f-name'),
  fInitial: document.getElementById('f-initial'),
  fNote: document.getElementById('f-note'),
};

/* ---------- money ---------- */

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

function fmt(cents) {
  return money.format(cents / 100);
}

/** Parse a typed amount into whole cents. Returns null if it isn't a number. */
function parseAmount(raw) {
  const cleaned = String(raw).trim().replace(/[$,\s]/g, '');
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // Round rather than truncate: 19.999 typed by hand should be 20.00, not 19.99.
  return Math.round(n * 100);
}

function spentOf(card) {
  return card.entries.reduce((sum, e) => sum + e.amount, 0);
}

function balanceOf(card) {
  return card.initial - spentOf(card);
}

/* ---------- storage ---------- */

function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.id !== 'string' || !Number.isFinite(e.amount)) return null;
  return {
    id: e.id,
    amount: Math.max(0, Math.round(e.amount)),
    note: typeof e.note === 'string' ? e.note : '',
    at: Number.isFinite(e.at) ? e.at : 0,
  };
}

function normalizeCard(c) {
  if (!c || typeof c !== 'object') return null;
  if (typeof c.id !== 'string' || typeof c.name !== 'string') return null;
  if (!Number.isFinite(c.initial)) return null;
  return {
    id: c.id,
    name: c.name,
    note: typeof c.note === 'string' ? c.note : '',
    initial: Math.max(0, Math.round(c.initial)),
    entries: Array.isArray(c.entries) ? c.entries.map(normalizeEntry).filter(Boolean) : [],
    createdAt: Number.isFinite(c.createdAt) ? c.createdAt : 0,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything malformed so one bad write can't wedge every future launch.
    return parsed.map(normalizeCard).filter(Boolean);
  } catch (err) {
    console.warn('Could not read saved cards, starting empty.', err);
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    return true;
  } catch (err) {
    console.warn('Could not save cards.', err);
    return false;
  }
}

function newId() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 7);
}

function byId(id) {
  return cards.find((c) => c.id === id);
}

function when(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/* ---------- dashboard ---------- */

function renderList() {
  const sorted = [...cards].sort((a, b) => {
    const ae = balanceOf(a) <= 0;
    const be = balanceOf(b) <= 0;
    if (ae !== be) return ae ? 1 : -1; // spent cards sink to the bottom
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  els.cards.replaceChildren(...sorted.map(cardNode));

  const total = cards.reduce((sum, c) => sum + balanceOf(c), 0);
  els.total.textContent = fmt(total);
  els.subtitle.textContent = cards.length === 0
    ? 'no cards yet'
    : `left across ${cards.length} card${cards.length === 1 ? '' : 's'}`;

  els.listEmpty.hidden = cards.length > 0;
  els.listEmpty.textContent = 'Add a card to start tracking what is left on it.';
}

function cardNode(card) {
  const balance = balanceOf(card);
  const empty = balance <= 0;

  const li = document.createElement('li');

  const a = document.createElement('a');
  a.className = 'card' + (empty ? ' spent' : '');
  a.href = `#/c/${encodeURIComponent(card.id)}`;

  const top = document.createElement('div');
  top.className = 'card-top';

  const name = document.createElement('span');
  name.className = 'card-name';
  // textContent, not innerHTML — card names are user input.
  name.textContent = card.name;

  const bal = document.createElement('span');
  bal.className = 'card-balance';
  bal.textContent = fmt(balance);

  top.append(name, bal);

  const sub = document.createElement('div');
  sub.className = 'card-sub';
  sub.textContent = empty
    ? `Empty · started at ${fmt(card.initial)}`
    : `of ${fmt(card.initial)}`;

  const meter = document.createElement('div');
  meter.className = 'meter';
  const fill = document.createElement('span');
  fill.className = 'meter-fill';
  const pct = card.initial > 0 ? Math.max(0, Math.min(100, (balance / card.initial) * 100)) : 0;
  fill.style.width = `${pct}%`;
  meter.append(fill);

  a.append(top, sub, meter);

  if (!empty) {
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const spend = document.createElement('a');
    spend.className = 'spend-btn';
    spend.href = `#/spend/${encodeURIComponent(card.id)}`;
    spend.textContent = 'Spend';
    // The button sits inside the card link, so stop the card from also firing.
    spend.addEventListener('click', (e) => e.stopPropagation());
    actions.append(spend);
    a.append(actions);
  }

  li.append(a);
  return li;
}

/* ---------- detail ---------- */

function renderDetail(card) {
  const balance = balanceOf(card);
  const spent = spentOf(card);

  els.detailName.textContent = card.name;
  els.detailNote.textContent = card.note;
  els.detailNote.hidden = !card.note;

  els.detailBalance.textContent = fmt(balance);
  els.detailOf.textContent = `${fmt(spent)} spent of ${fmt(card.initial)}`;

  const pct = card.initial > 0 ? Math.max(0, Math.min(100, (balance / card.initial) * 100)) : 0;
  els.detailMeter.style.width = `${pct}%`;

  els.detailSpend.href = `#/spend/${encodeURIComponent(card.id)}`;
  els.detailSpend.hidden = balance <= 0;
  els.detailEdit.href = `#/edit/${encodeURIComponent(card.id)}`;
  els.detailDelete.dataset.id = card.id;

  const recent = [...card.entries].sort((a, b) => b.at - a.at);
  els.detailHistory.replaceChildren(...recent.map(entryNode));
  els.historyEmpty.hidden = recent.length > 0;
}

function entryNode(entry) {
  const li = document.createElement('li');

  const main = document.createElement('div');
  main.className = 'entry-main';

  const amount = document.createElement('div');
  amount.className = 'entry-amount';
  amount.textContent = `− ${fmt(entry.amount)}`;

  const meta = document.createElement('div');
  meta.className = 'entry-when';
  meta.textContent = [when(entry.at), entry.note].filter(Boolean).join(' · ');

  main.append(amount, meta);

  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'undo';
  undo.dataset.entry = entry.id;
  undo.setAttribute('aria-label', `Undo ${fmt(entry.amount)}`);
  undo.textContent = '×';

  li.append(main, undo);
  return li;
}

els.detailHistory.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-entry]');
  if (!btn) return;
  const card = byId(currentId);
  if (!card) return;
  const entry = card.entries.find((x) => x.id === btn.dataset.entry);
  if (!entry) return;
  if (!confirm(`Undo this ${fmt(entry.amount)} charge? It goes back onto the card.`)) return;
  card.entries = card.entries.filter((x) => x.id !== entry.id);
  save();
  renderDetail(card);
});

els.detailDelete.addEventListener('click', () => {
  const card = byId(els.detailDelete.dataset.id);
  if (!card) return;
  if (!confirm(`Delete "${card.name}"? This cannot be undone.`)) return;
  cards = cards.filter((c) => c.id !== card.id);
  save();
  location.hash = '#/';
});

/* ---------- spend ---------- */

let currentId = null;

function openSpend(card) {
  currentId = card.id;
  els.spendTitle.textContent = card.name;
  els.spendAvailable.textContent = `${fmt(balanceOf(card))} available`;
  els.sAmount.value = '';
  els.sNote.value = '';
  els.spendError.hidden = true;
}

els.spendAll.addEventListener('click', () => {
  const card = byId(currentId);
  if (!card) return;
  els.sAmount.value = (balanceOf(card) / 100).toFixed(2);
  els.sAmount.focus();
});

els.spendForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const card = byId(currentId);
  if (!card) return void (location.hash = '#/');

  const amount = parseAmount(els.sAmount.value);
  const balance = balanceOf(card);

  if (amount === null || amount <= 0) {
    return fail(els.spendError, 'Enter an amount greater than zero.', els.sAmount);
  }
  if (amount > balance) {
    return fail(els.spendError,
      `That is more than the ${fmt(balance)} left. Spend ${fmt(balance)} or less.`, els.sAmount);
  }

  card.entries.push({
    id: newId(),
    amount,
    note: els.sNote.value.trim(),
    at: Date.now(),
  });

  if (!save()) {
    card.entries.pop(); // keep the screen honest about what was stored
    return fail(els.spendError, 'Could not save — the phone may be out of storage.');
  }

  location.hash = `#/c/${encodeURIComponent(card.id)}`;
});

els.spendCancel.addEventListener('click', () => {
  location.hash = currentId ? `#/c/${encodeURIComponent(currentId)}` : '#/';
});

function fail(el, message, focus) {
  el.textContent = message;
  el.hidden = false;
  if (focus) focus.focus();
}

/* ---------- add / edit ---------- */

let editingId = null;

function openEditor(card) {
  editingId = card ? card.id : null;
  els.editHeading.textContent = card ? 'Edit card' : 'New card';
  els.formError.hidden = true;

  els.fName.value = card ? card.name : '';
  els.fInitial.value = card ? (card.initial / 100).toFixed(2) : '';
  els.fNote.value = card ? card.note : '';

  const spent = card ? spentOf(card) : 0;
  els.editHint.hidden = spent <= 0;
  els.editHint.textContent = spent > 0
    ? `${fmt(spent)} has already been spent on this card, so the starting balance cannot go below that.`
    : '';
}

els.cardForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = els.fName.value.trim();
  if (!name) return fail(els.formError, 'Give the card a name.', els.fName);

  const initial = parseAmount(els.fInitial.value);
  if (initial === null || initial <= 0) {
    return fail(els.formError, 'Enter the starting balance, like 25.00.', els.fInitial);
  }

  const existing = editingId ? byId(editingId) : null;
  if (existing) {
    const spent = spentOf(existing);
    if (initial < spent) {
      return fail(els.formError,
        `${fmt(spent)} has already been spent, so the starting balance cannot be less than that.`,
        els.fInitial);
    }
    existing.name = name;
    existing.note = els.fNote.value.trim();
    existing.initial = initial;
  } else {
    cards.push({
      id: newId(),
      name,
      note: els.fNote.value.trim(),
      initial,
      entries: [],
      createdAt: Date.now(),
    });
  }

  if (!save()) return fail(els.formError, 'Could not save — the phone may be out of storage.');

  const id = existing ? existing.id : cards[cards.length - 1].id;
  location.hash = `#/c/${encodeURIComponent(id)}`;
});

els.editCancel.addEventListener('click', () => {
  location.hash = editingId ? `#/c/${encodeURIComponent(editingId)}` : '#/';
});

/* ---------- backup ---------- */

els.exportBtn.addEventListener('click', async () => {
  if (cards.length === 0) {
    alert('No cards to back up yet.');
    return;
  }
  const json = JSON.stringify(cards);
  try {
    await navigator.clipboard.writeText(json);
    alert(`Copied ${cards.length} card${cards.length === 1 ? '' : 's'} to the clipboard.\n\nPaste it somewhere safe — a note or an email to yourself.`);
  } catch (err) {
    console.warn('Clipboard write failed.', err);
    prompt('Copy this and keep it somewhere safe:', json);
  }
});

els.importBtn.addEventListener('click', () => {
  const raw = prompt('Paste a backup here. Cards with the same id are replaced; everything else is kept.');
  if (!raw) return;

  let incoming;
  try {
    incoming = JSON.parse(raw);
  } catch (err) {
    alert('That does not look like a backup.');
    return;
  }
  if (!Array.isArray(incoming)) {
    alert('That does not look like a backup.');
    return;
  }

  const valid = incoming.map(normalizeCard).filter(Boolean);
  if (valid.length === 0) {
    alert('No usable cards found in that backup.');
    return;
  }

  for (const card of valid) {
    const existing = byId(card.id);
    if (existing) Object.assign(existing, card);
    else cards.push(card);
  }

  save();
  renderList();
  alert(`Restored ${valid.length} card${valid.length === 1 ? '' : 's'}.`);
});

/* ---------- router ---------- */

function show(name) {
  for (const [key, el] of Object.entries(els.views)) el.hidden = key !== name;
  window.scrollTo(0, 0);
}

function route() {
  const hash = location.hash || '#/';

  const detail = hash.match(/^#\/c\/(.+)$/);
  if (detail) {
    const card = byId(decodeURIComponent(detail[1]));
    if (!card) return void (location.hash = '#/');
    currentId = card.id;
    renderDetail(card);
    show('detail');
    return;
  }

  const spend = hash.match(/^#\/spend\/(.+)$/);
  if (spend) {
    const card = byId(decodeURIComponent(spend[1]));
    if (!card) return void (location.hash = '#/');
    // Nothing left to spend, so there is nothing to show.
    if (balanceOf(card) <= 0) return void (location.hash = `#/c/${encodeURIComponent(card.id)}`);
    openSpend(card);
    show('spend');
    return;
  }

  const edit = hash.match(/^#\/edit\/(.+)$/);
  if (edit) {
    const card = byId(decodeURIComponent(edit[1]));
    if (!card) return void (location.hash = '#/');
    openEditor(card);
    show('edit');
    return;
  }

  if (hash === '#/new') {
    openEditor(null);
    show('edit');
    return;
  }

  renderList();
  show('list');
}

window.addEventListener('hashchange', route);
route();

/* ---------- offline support ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed; app still works online.', err);
    });
  });
}
