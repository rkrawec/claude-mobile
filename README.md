# Tasks

A bare-bones task tracker that installs on an iPhone home screen. No accounts,
no server, no build step — plain HTML/CSS/JS. Tasks are stored in `localStorage`
on the phone itself, so they never leave the device.

## What it does

- Add a task, tap it to mark done, tap `×` to delete
- Filter by All / Active / Done, and clear completed in one tap
- Remembers everything between launches
- Works with no signal (service worker caches the app)
- Follows the phone's light/dark setting
- Launches full-screen with its own icon, no Safari chrome

## Get it on your iPhone

**1. Make the repo public.** GitHub Pages only works on private repos with a
paid plan, so on a free account this step is required. On github.com →
`rkrawec/claude-mobile` → **Settings** → scroll to the bottom → **Change
visibility** → **Change to public**.

**2. Turn on GitHub Pages.** Still in **Settings**, click **Pages** in the left
sidebar. Under *Build and deployment* → *Source*, choose **Deploy from a
branch**. Set the branch to `claude/iphone-task-tracker-app-84qdpp` and the
folder to `/ (root)`. Click **Save**.

**3. Wait about a minute,** then reload the Pages settings screen. It will show
the live URL:

```
https://rkrawec.github.io/claude-mobile/
```

**4. Open that URL in Safari on your iPhone.** It must be Safari — Chrome on iOS
cannot install home-screen apps.

**5. Install it.** Tap the **Share** button (the square with the up arrow in the
bottom toolbar) → scroll down → **Add to Home Screen** → **Add**.

You now have a `Tasks` icon on your home screen. Open it from there, not from
Safari — launched from the icon it runs full-screen as its own app.

### Notes

- The site is publicly reachable by anyone with the URL, but it holds no data:
  your tasks live only in your phone's storage.
- Deleting the home-screen icon also deletes the saved tasks.
- Tasks do not sync between devices. One phone, one list.

## Updating it later

Push a change to the same branch and Pages redeploys in about a minute. Bump
`CACHE` in `sw.js` whenever you edit `index.html`, `styles.css`, or `app.js` —
otherwise phones keep serving the cached copy. After a deploy, open the app
twice: the first launch downloads the update, the second shows it.

## Running it locally

```sh
python3 -m http.server 8765
# then open http://localhost:8765
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup and the iOS/PWA meta tags |
| `styles.css` | All styling, including dark mode and safe-area insets |
| `app.js` | Task state, rendering, `localStorage` persistence |
| `sw.js` | Service worker — offline caching |
| `manifest.webmanifest` | App name, icons, standalone display mode |
| `icons/` | Home-screen and manifest icons |
| `.nojekyll` | Stops GitHub Pages from running the files through Jekyll |
