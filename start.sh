#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-5500}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is not installed (required for frontend static server)."
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  echo "Created $BACKEND_DIR/.env from .env.example"
fi

if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
  echo "Installing backend dependencies..."
  (cd "$BACKEND_DIR" && npm install)
fi

echo "Applying database schema..."
(cd "$BACKEND_DIR" && npm run db:schema)

echo "Seeding database..."
(cd "$BACKEND_DIR" && npm run db:seed)

echo "Starting backend on http://localhost:$BACKEND_PORT"
(
  cd "$BACKEND_DIR"
  npm run dev
) &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:$FRONTEND_PORT"
(
  cd "$FRONTEND_DIR"
  python3 -m http.server "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

echo ""
echo "App is starting..."
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend : http://localhost:$BACKEND_PORT"
echo "Health  : http://localhost:$BACKEND_PORT/health"
echo "Admin   : admin / admin123"
echo "Worker  : worker_ramesh / worker123"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
