# CCNA Drill

Offline-capable CCNA 200-301 practice quiz for phones. Static site, no backend, no tracking.

Live: https://ericguz1.github.io/ccna-study/

## How it works

- Questions live in `public/questions.json`.
- Progress is stored in the browser's `localStorage` (per device, not synced).
- Leitner boxes: **New**, **Learning**, **Mastered**.
  - A new question answered correctly goes straight to Mastered.
  - A miss sends it to Learning with the streak reset.
  - A Learning question needs 3 correct answers in a row (across sessions) to reach Mastered.
  - A miss on a Mastered question sends it back to Learning.
  - Each session is about half Learning, the rest New, plus a few Mastered for retention.
  - Tunables are the constants at the top of `public/app.js`.
- A service worker caches the app so it works offline after the first visit. `questions.json` is fetched network-first, so new questions arrive whenever you open the app online.

## Question format

```json
{
  "id": "ipc-016",
  "domain": "ip-connectivity",
  "question": "Which command shows OSPF neighbors?",
  "choices": ["`show ip ospf neighbor`", "`show ip route`", "`show ospf`", "`show running-config`"],
  "correctIndex": 0,
  "explanation": "Optional text shown after answering."
}
```

- `id` must be unique and never reused for a different question (progress is keyed by id).
- `domain` is one of: `network-fundamentals`, `network-access`, `ip-connectivity`, `ip-services`, `security-fundamentals`, `automation-programmability`.
- Wrap commands in backticks to render them as code.
- Choice order is shuffled when shown.

## Adding questions

Edit `public/questions.json`, commit, push to `main`. GitHub Actions publishes `public/` to the `gh-pages` branch.

If you change `index.html`, `app.js`, `style.css` or the icons, bump `VERSION` in `public/sw.js` so phones pick up the new files.

## Run locally

```
cd public
python3 -m http.server 8000
```

Open http://localhost:8000. Service workers work on `localhost`.

## Hosting

GitHub Pages, source set to the `gh-pages` branch (root). The workflow in `.github/workflows/ci.yml` force-pushes `public/` there on every push to `main`.
