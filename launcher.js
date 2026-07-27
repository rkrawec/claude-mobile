'use strict';

/* Renders the app list from apps.json. Adding an app to this launcher means
   adding one entry to that file — no changes needed here. */

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');

fetch('./apps.json')
  .then((res) => {
    if (!res.ok) throw new Error(`apps.json: HTTP ${res.status}`);
    return res.json();
  })
  .then((apps) => {
    if (!Array.isArray(apps) || apps.length === 0) {
      empty.hidden = false;
      return;
    }
    grid.replaceChildren(...apps.map(card));
  })
  .catch((err) => {
    console.warn('Could not load the app list.', err);
    empty.hidden = false;
    empty.textContent = 'Could not load the app list.';
  });

function card(app) {
  const li = document.createElement('li');

  const a = document.createElement('a');
  a.className = 'card';
  a.href = app.path;

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = app.emoji || '□';

  const text = document.createElement('span');
  text.className = 'card-text';

  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = app.name;

  const desc = document.createElement('span');
  desc.className = 'card-desc';
  desc.textContent = app.description || '';

  text.append(name, desc);
  a.append(badge, text);
  li.append(a);
  return li;
}

/* The old version of this site registered a service worker at this scope that
   cached the task app at the root URL. Re-register it so the new, self-erasing
   sw.js can install and clean that up. Harmless once it has run. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((reg) => reg.update()))
    .catch(() => {});
}
