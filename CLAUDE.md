# claude-mobile

A personal collection of small web apps, hosted free on GitHub Pages and
installed to an iPhone home screen. Built to be developed entirely from a phone.

Live at <https://rkrawec.github.io/claude-mobile/>.

## Layout

```
/                       launcher — lists every app, reads apps.json
/apps.json              the app registry the launcher renders
/sw.js                  tombstone worker from the pre-subfolder layout; leave it
/icons/                 launcher icons
/tasks/                 an app
/<new-app>/             ...one folder per app
```

Pages deploys from `main`, root folder. Anything merged to `main` is live in
about a minute.

## Adding a new app

1. Create `/<slug>/` with its own `index.html`, `styles.css`, `app.js`,
   `sw.js`, `manifest.webmanifest`, and `icons/`. Copy `/tasks/` as the
   starting point — it has every iOS meta tag already correct.
2. Add one entry to `/apps.json` so it shows up in the launcher.
3. Open a PR. The user merges from the GitHub mobile app.

Do not add a build step, a framework, or an npm dependency. These are static
files served directly; the whole point is that they need no toolchain and can
be edited from a phone.

## Rules that matter on this origin

Every app shares the origin `rkrawec.github.io`, so browser storage is **not**
isolated between them. Two apps using the same key will corrupt each other.

- **localStorage keys** must start with the app's folder name: `tasks.v1`,
  `budget.v1`.
- **Cache Storage names** must start with the app's folder name and carry a
  version: `tasks-v2`, `budget-v1`.
- Service worker scope is the app's own folder, which is already correct as long
  as it is registered as `./sw.js` from within that folder.
- **All asset paths must be relative** (`./styles.css`, never `/styles.css`).
  A leading slash resolves to the domain root, which is not this site.

Bump the app's cache version whenever you change its cached files, or phones
will keep serving the old copy. After a deploy the app must be opened twice:
the first launch downloads the update, the second shows it.

## iOS requirements

These are load-bearing — dropping one breaks home-screen install or makes the
app feel wrong on a phone:

- `<meta name="viewport" content="... viewport-fit=cover">` plus
  `env(safe-area-inset-*)` padding on `body`, or content slides under the notch.
- Inputs at `font-size: 16px` or larger, or iOS zooms the page on focus.
- `apple-touch-icon` at 180x180, and `apple-mobile-web-app-capable`, or the
  home-screen launch opens in Safari with browser chrome.
- Render user text with `textContent`, never `innerHTML`.

## Constraints

Pages serves static files only — no server code, no database, no build. The repo
is public, so **never commit an API key or any secret**. Data lives in the
browser on one device and does not sync.
