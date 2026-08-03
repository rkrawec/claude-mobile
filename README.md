# claude-mobile

Small web apps I build from my phone, hosted free on GitHub Pages and installed
to the iPhone home screen. No build step, no dependencies, no server.

**Live: <https://rkrawec.github.io/claude-mobile/>**

| App | What it is |
| --- | --- |
| [Tasks](https://rkrawec.github.io/claude-mobile/tasks/) | A bare-bones offline task tracker |
| [Recipes](https://rkrawec.github.io/claude-mobile/recipes/) | Recipes you type in, with search and backup |
| [Dash](https://rkrawec.github.io/claude-mobile/dash/) | One-tap jumping game, endless and offline |
| [Digital Circus](https://rkrawec.github.io/claude-mobile/circus/) | Microgame gauntlet — nine adventures, a few seconds each |

## Installing an app on your iPhone

Open the app's URL **in Safari** (Chrome on iOS cannot install home-screen
apps), tap **Share** → **Add to Home Screen** → **Add**. Launch it from that
icon, not from Safari, and it runs full-screen as its own app with its own
storage. The launcher page itself can be installed the same way.

## Adding a new app

Everything is already provisioned — the repo is public and Pages is on — so new
apps need no setup at all:

1. Ask Claude for the app. It creates `/<name>/` and registers it in `apps.json`.
2. Merge the PR from the GitHub mobile app.
3. About a minute later it is live at
   `https://rkrawec.github.io/claude-mobile/<name>/`.

See [CLAUDE.md](./CLAUDE.md) for the conventions each app has to follow — mainly
that all apps share one origin, so storage keys and cache names must be prefixed
with the app's folder name.

## Running locally

```sh
python3 -m http.server 8765
# open http://localhost:8765
```

## Notes

- Pages is free for public repos: 1 GB site, 100 GB/month bandwidth, 10
  builds/hour ([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)).
- The repo is public. **No secrets, ever** — anything committed is world-readable.
- App data lives in the browser on a single device and does not sync. Deleting a
  home-screen icon deletes that app's data.
