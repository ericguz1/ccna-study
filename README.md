# CCNA Study Guide

Personal CCNA 200-301 mobile-friendly study site, built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) and deployed to GitHub Pages.

Philosophy: only document what practice exams show as an actual gap. See `docs/index.md` for the workflow.

## Local setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
mkdocs serve
```

Then open http://127.0.0.1:8000 (works fine on your phone too if you serve with `mkdocs serve -a 0.0.0.0:8000` and hit your machine's LAN IP).

## Deploy

1. Create a GitHub repo (e.g. `ccna-study`), push this project to it.
2. In the repo settings, go to **Settings -> Pages** and set the source to the `gh-pages` branch (it's created automatically the first time the GitHub Actions workflow in `.github/workflows/ci.yml` runs).
3. Every push to `main`/`master` rebuilds and redeploys automatically.
4. Site will be live at `https://<username>.github.io/<repo>`.

## Adding a new gap after a practice exam

1. Add an entry to `docs/still-missing.md` using the template at the top of that file.
2. Once you've actually studied it, either delete the entry or move a cleaned-up version into the matching file under `docs/domains/`.
3. Log the exam attempt in `docs/exam-log.md`.
4. Commit and push. Site rebuilds automatically.
