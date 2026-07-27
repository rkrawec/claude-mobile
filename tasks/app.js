'use strict';

/* localStorage is shared across the whole github.io origin, so this key must be
   prefixed with the app's folder name to avoid colliding with sibling apps. */
const STORAGE_KEY = 'tasks.v1';

/** @type {{id: string, title: string, done: boolean, createdAt: number}[]} */
let tasks = load();
let filter = 'all';

const els = {
  composer: document.getElementById('composer'),
  input: document.getElementById('input'),
  list: document.getElementById('list'),
  empty: document.getElementById('empty'),
  filters: document.getElementById('filters'),
  subtitle: document.getElementById('subtitle'),
  clear: document.getElementById('clear'),
};

/* ---------- storage ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything that doesn't look like a task, so one bad write can't
    // wedge the app on every future launch.
    return parsed.filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string');
  } catch (err) {
    console.warn('Could not read saved tasks, starting empty.', err);
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.warn('Could not save tasks.', err);
  }
}

/* ---------- actions ---------- */

function addTask(title) {
  title = title.trim();
  if (!title) return;
  tasks.unshift({
    id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
    title,
    done: false,
    createdAt: Date.now(),
  });
  save();
  render();
}

function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  save();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  save();
  render();
}

function clearCompleted() {
  tasks = tasks.filter((t) => !t.done);
  save();
  render();
}

/* ---------- render ---------- */

function visibleTasks() {
  if (filter === 'active') return tasks.filter((t) => !t.done);
  if (filter === 'done') return tasks.filter((t) => t.done);
  return tasks;
}

function render() {
  const shown = visibleTasks();

  els.list.replaceChildren(...shown.map(itemNode));

  const remaining = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.length - remaining;

  els.subtitle.textContent = tasks.length === 0
    ? 'Nothing yet'
    : `${remaining} left · ${doneCount} done`;

  els.empty.hidden = shown.length > 0;
  els.empty.textContent = tasks.length === 0
    ? 'Add your first task above.'
    : filter === 'active'
      ? 'All caught up.'
      : 'Nothing here.';

  els.clear.hidden = doneCount === 0;
}

function itemNode(task) {
  const li = document.createElement('li');
  li.className = 'item' + (task.done ? ' done' : '');
  li.dataset.id = task.id;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'item-toggle';
  toggle.dataset.action = 'toggle';
  toggle.setAttribute('aria-pressed', String(task.done));

  const box = document.createElement('span');
  box.className = 'box';
  box.setAttribute('aria-hidden', 'true');

  const title = document.createElement('span');
  title.className = 'title';
  // textContent, not innerHTML — task titles are user input.
  title.textContent = task.title;

  toggle.append(box, title);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'delete';
  del.dataset.action = 'delete';
  del.setAttribute('aria-label', `Delete ${task.title}`);
  del.textContent = '×';

  li.append(toggle, del);
  return li;
}

/* ---------- events ---------- */

els.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  addTask(els.input.value);
  els.input.value = '';
  // Keep focus so you can rattle off several tasks without re-tapping.
  els.input.focus();
});

els.list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.closest('.item').dataset.id;
  if (btn.dataset.action === 'toggle') toggleTask(id);
  if (btn.dataset.action === 'delete') deleteTask(id);
});

els.filters.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter');
  if (!btn) return;
  filter = btn.dataset.filter;
  for (const f of els.filters.querySelectorAll('.filter')) {
    f.setAttribute('aria-selected', String(f === btn));
  }
  render();
});

els.clear.addEventListener('click', clearCompleted);

render();

/* ---------- offline support ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed; app still works online.', err);
    });
  });
}
