'use strict';

/* localStorage is shared across the whole github.io origin, so this key must be
   prefixed with the app's folder name to avoid colliding with sibling apps. */
const STORAGE_KEY = 'recipes.v1';

/** @typedef {{id: string, title: string, servings: string, time: string,
 *             ingredients: string[], steps: string[], updatedAt: number}} Recipe */

/** @type {Recipe[]} */
let recipes = load();
let query = '';

const els = {
  views: {
    list: document.getElementById('view-list'),
    detail: document.getElementById('view-detail'),
    edit: document.getElementById('view-edit'),
  },
  cards: document.getElementById('cards'),
  count: document.getElementById('count'),
  listEmpty: document.getElementById('list-empty'),
  search: document.getElementById('search'),
  exportBtn: document.getElementById('export'),
  importBtn: document.getElementById('import'),

  detailTitle: document.getElementById('detail-title'),
  detailMeta: document.getElementById('detail-meta'),
  detailIngredients: document.getElementById('detail-ingredients'),
  detailSteps: document.getElementById('detail-steps'),
  detailIngWrap: document.getElementById('detail-ing-wrap'),
  detailStepsWrap: document.getElementById('detail-steps-wrap'),
  detailEdit: document.getElementById('detail-edit'),
  detailDelete: document.getElementById('detail-delete'),

  form: document.getElementById('form'),
  editHeading: document.getElementById('edit-heading'),
  editCancel: document.getElementById('edit-cancel'),
  formError: document.getElementById('form-error'),
  fTitle: document.getElementById('f-title'),
  fServings: document.getElementById('f-servings'),
  fTime: document.getElementById('f-time'),
  fIngredients: document.getElementById('f-ingredients'),
  fSteps: document.getElementById('f-steps'),
};

/* ---------- storage ---------- */

function normalize(r) {
  if (!r || typeof r !== 'object') return null;
  if (typeof r.id !== 'string' || typeof r.title !== 'string') return null;
  return {
    id: r.id,
    title: r.title,
    servings: typeof r.servings === 'string' ? r.servings : '',
    time: typeof r.time === 'string' ? r.time : '',
    ingredients: Array.isArray(r.ingredients) ? r.ingredients.filter((s) => typeof s === 'string') : [],
    steps: Array.isArray(r.steps) ? r.steps.filter((s) => typeof s === 'string') : [],
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything malformed so one bad write can't wedge every future launch.
    return parsed.map(normalize).filter(Boolean);
  } catch (err) {
    console.warn('Could not read saved recipes, starting empty.', err);
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
    return true;
  } catch (err) {
    // Most likely the origin's storage quota is full.
    console.warn('Could not save recipes.', err);
    return false;
  }
}

function newId() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 7);
}

function byId(id) {
  return recipes.find((r) => r.id === id);
}

function lines(text) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

/* ---------- list ---------- */

function renderList() {
  const q = query.trim().toLowerCase();
  const shown = q
    ? recipes.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.toLowerCase().includes(q)))
    : recipes;

  const sorted = [...shown].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

  els.cards.replaceChildren(...sorted.map(cardNode));

  els.count.textContent = recipes.length === 0
    ? 'No recipes yet'
    : `${recipes.length} recipe${recipes.length === 1 ? '' : 's'}`;

  els.listEmpty.hidden = sorted.length > 0;
  els.listEmpty.textContent = recipes.length === 0
    ? 'Tap New to add your first recipe.'
    : 'Nothing matches that search.';
}

function cardNode(recipe) {
  const li = document.createElement('li');

  const a = document.createElement('a');
  a.className = 'card';
  a.href = `#/r/${encodeURIComponent(recipe.id)}`;

  const title = document.createElement('div');
  title.className = 'card-title';
  // textContent, not innerHTML — recipe text is user input.
  title.textContent = recipe.title;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = metaLine(recipe) ||
    `${recipe.ingredients.length} ingredient${recipe.ingredients.length === 1 ? '' : 's'}`;

  a.append(title, meta);
  li.append(a);
  return li;
}

function metaLine(recipe) {
  const bits = [];
  if (recipe.servings) bits.push(`Serves ${recipe.servings}`);
  if (recipe.time) bits.push(recipe.time);
  return bits.join(' · ');
}

/* ---------- detail ---------- */

function renderDetail(recipe) {
  els.detailTitle.textContent = recipe.title;

  const meta = metaLine(recipe);
  els.detailMeta.textContent = meta;
  els.detailMeta.hidden = !meta;

  els.detailIngredients.replaceChildren(...recipe.ingredients.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
  els.detailIngWrap.hidden = recipe.ingredients.length === 0;

  els.detailSteps.replaceChildren(...recipe.steps.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
  els.detailStepsWrap.hidden = recipe.steps.length === 0;

  els.detailEdit.href = `#/edit/${encodeURIComponent(recipe.id)}`;
  els.detailDelete.dataset.id = recipe.id;
}

els.detailDelete.addEventListener('click', () => {
  const recipe = byId(els.detailDelete.dataset.id);
  if (!recipe) return;
  if (!confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return;
  recipes = recipes.filter((r) => r.id !== recipe.id);
  save();
  location.hash = '#/';
});

/* ---------- editor ---------- */

let editingId = null;

function openEditor(recipe) {
  editingId = recipe ? recipe.id : null;
  els.editHeading.textContent = recipe ? 'Edit recipe' : 'New recipe';
  els.formError.hidden = true;

  els.fTitle.value = recipe ? recipe.title : '';
  els.fServings.value = recipe ? recipe.servings : '';
  els.fTime.value = recipe ? recipe.time : '';
  els.fIngredients.value = recipe ? recipe.ingredients.join('\n') : '';
  els.fSteps.value = recipe ? recipe.steps.join('\n') : '';
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();

  const title = els.fTitle.value.trim();
  if (!title) {
    els.formError.textContent = 'Give the recipe a title.';
    els.formError.hidden = false;
    els.fTitle.focus();
    return;
  }

  const fields = {
    title,
    servings: els.fServings.value.trim(),
    time: els.fTime.value.trim(),
    ingredients: lines(els.fIngredients.value),
    steps: lines(els.fSteps.value),
    updatedAt: Date.now(),
  };

  let id = editingId;
  const existing = id ? byId(id) : null;
  if (existing) {
    Object.assign(existing, fields);
  } else {
    id = newId();
    recipes.push({ id, ...fields });
  }

  if (!save()) {
    els.formError.textContent = 'Could not save — the phone may be out of storage.';
    els.formError.hidden = false;
    return;
  }

  location.hash = `#/r/${encodeURIComponent(id)}`;
});

els.editCancel.addEventListener('click', () => {
  location.hash = editingId ? `#/r/${encodeURIComponent(editingId)}` : '#/';
});

/* ---------- backup ---------- */

els.exportBtn.addEventListener('click', async () => {
  if (recipes.length === 0) {
    alert('No recipes to back up yet.');
    return;
  }
  const json = JSON.stringify(recipes);
  try {
    await navigator.clipboard.writeText(json);
    alert(`Copied ${recipes.length} recipe${recipes.length === 1 ? '' : 's'} to the clipboard.\n\nPaste it somewhere safe — a note or an email to yourself.`);
  } catch (err) {
    console.warn('Clipboard write failed.', err);
    prompt('Copy this and keep it somewhere safe:', json);
  }
});

els.importBtn.addEventListener('click', () => {
  const raw = prompt('Paste a backup here. Recipes with the same id are replaced; everything else is kept.');
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

  const valid = incoming.map(normalize).filter(Boolean);
  if (valid.length === 0) {
    alert('No usable recipes found in that backup.');
    return;
  }

  for (const recipe of valid) {
    const existing = byId(recipe.id);
    if (existing) Object.assign(existing, recipe);
    else recipes.push(recipe);
  }

  save();
  renderList();
  alert(`Restored ${valid.length} recipe${valid.length === 1 ? '' : 's'}.`);
});

/* ---------- router ---------- */

function show(name) {
  for (const [key, el] of Object.entries(els.views)) el.hidden = key !== name;
  window.scrollTo(0, 0);
}

function route() {
  const hash = location.hash || '#/';

  const detailMatch = hash.match(/^#\/r\/(.+)$/);
  if (detailMatch) {
    const recipe = byId(decodeURIComponent(detailMatch[1]));
    if (!recipe) return void (location.hash = '#/');
    renderDetail(recipe);
    show('detail');
    return;
  }

  const editMatch = hash.match(/^#\/edit\/(.+)$/);
  if (editMatch) {
    const recipe = byId(decodeURIComponent(editMatch[1]));
    if (!recipe) return void (location.hash = '#/');
    openEditor(recipe);
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

els.search.addEventListener('input', () => {
  query = els.search.value;
  renderList();
});

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
