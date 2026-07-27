# claude-mobile

A personal collection of small web apps, hosted free on GitHub Pages and
installed to an iPhone home screen. Built to be developed entirely from a phone.

Live at <https://rkrawec.github.io/claude-mobile/>.

## How this gets worked on

The user develops from an iPhone, usually with no computer available. Assume
every instruction arrives by phone and that the user cannot run a terminal, open
Xcode, or click through desktop-only settings screens. Anything requiring the
GitHub web UI beyond merging a PR is effectively blocked, so do not propose it.

The loop is: user asks for something → Claude pushes a branch and opens a PR →
user merges from the GitHub mobile app → Pages redeploys in about a minute.
Always open the PR; merging is the user's only manual step.

Because of that, prefer solutions that need no new provisioning. The one-time
setup is already done and must not be redone:

- The repo is **public** (required for Pages on a free GitHub plan).
- **Pages is enabled**, deploying from `main`, root folder.
- A new app therefore needs **no repo, no Pages setup, no desktop** — just a new
  folder in this repo. Never suggest creating another repository for a new app;
  subfolders off this one origin are unlimited, and a second repo would mean
  another desktop trip to configure it.

Verify UI changes by actually running them — serve the site locally and drive it
with Playwright at an iPhone viewport (Chromium is at `/opt/pw-browsers`). The
user cannot easily check work in progress, so it should be correct when it
lands.

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

## Installing an app on the phone

Open the app's URL **in Safari** — Chrome on iOS cannot install home-screen apps
— then Share → Add to Home Screen → Add. Launching from that icon is what gives
the full-screen, no-browser-chrome behaviour; opening the same URL in Safari
does not.

## Constraints

Pages serves static files only — no server code, no database, no build. The repo
is public, so **never commit an API key or any secret**. Data lives in the
browser on one device and does not sync.

Free-plan Pages limits: 1 GB published site, 100 GB/month bandwidth (soft), 10
builds/hour (soft). Nothing here will approach them.

If a request genuinely needs a backend, a database, or secret keys, say so
plainly — it does not fit this setup, and the answer is a different host, not a
workaround that leaks a key into a public repo.
