# AGENTS.md

## Cursor Cloud specific instructions

This repo is the **Tax Sale Property Analyzer**: a FastAPI backend (`backend/`) that
serves a static vanilla-JS frontend (`frontend/`) and scrapes live Arkansas COSL tax
sale data. See `README.md` for the product overview and HTTP API reference.

### Services

There is a single service: the FastAPI app, which also serves the frontend.

- Dev server (use this; deps are pre-installed by the update script into `.venv`):
  ```bash
  source .venv/bin/activate
  cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
  ```
  Then open http://localhost:8000.
- `./run.sh` also works, but it creates its own `.venv` and re-runs `pip install` on
  every launch. Prefer running `uvicorn` directly since the update script already
  installs dependencies.

### Testing

- Integration test: `node scripts/test-links.js` (uses Node's built-in `fetch`; no npm
  install needed). It requires the dev server already running on port `8000` and hits
  the live `/api/analyze` endpoint, so it depends on outbound network access.
- There is no separate unit-test suite and no linter configured.

### Non-obvious notes

- The app fetches **live external data** on most requests (`cosl.org`,
  `arcountydata.com`, Arkansas GIS PLSS, and OpenStreetMap Nominatim). Outbound network
  access is required for the APIs and the integration test to return results; Nominatim
  geocoding is rate-limited, so analyze requests can take 10–20s.
- Backend imports are bare module names (e.g. `from scraper import ...`), so `uvicorn`
  must be launched from inside `backend/` (as shown above), not from the repo root.
