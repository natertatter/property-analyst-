#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv 2>/dev/null || true
fi
if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
pip install -q -r backend/requirements.txt
cd backend
exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
