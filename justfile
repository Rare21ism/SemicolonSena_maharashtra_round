# Roundtable Justfile
# Cross-platform task runner recipes

set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# Default recipe listing available commands
default:
    @just --list

# Start FastAPI backend server on 0.0.0.0:8000
dev-server:
    cd server; python -m uv run uvicorn roundtable.main:app --host 0.0.0.0 --port 8000 --reload

# Start Expo universal app development server
dev-app:
    npm --workspace=app run start

# Launch Roundtable app in the web browser
dev-web:
    npm --workspace=app run web

alias web-dev := dev-web

# Start Expo dev server with cloud tunnel for remote mobile testing
tunnel:
    npx expo start app --tunnel

# Run full test suite (TypeScript protocol tests + Python backend tests)
test:
    npm --workspace=@roundtable/protocol test
    cd server; python -m uv run --extra dev pytest

# Run integration test with simulated clients
fake-clients devices="3":
    cd server; python -m uv run python scripts/fake_client.py --devices {{devices}}
