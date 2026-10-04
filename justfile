# Roundtable Justfile
# Cross-platform task runner recipes

set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# Default recipe listing available commands
default:
    @just --list

# Start FastAPI backend server on 0.0.0.0:8000
dev-server:
    cd server; python -m uv run uvicorn roundtable.main:app --host 0.0.0.0 --port 8000 --reload

# Start Expo universal app development server for Expo Go
dev-app:
    npm.cmd --workspace=app run start -- --go -c

# Launch Roundtable app in the web browser
dev-web:
    npm.cmd --workspace=app run web

alias web-dev := dev-web

# Start Expo dev server with cloud tunnel for remote mobile testing in Expo Go
tunnel:
    npm.cmd --workspace=app run start -- --tunnel --go -c

# Run full test suite (TypeScript protocol tests + React Native app tests + Python backend tests)
test:
    npm.cmd --workspace=@roundtable/protocol test
    npm.cmd --workspace=app test
    cd server; python -m uv run --extra dev pytest

# Run integration test with simulated audio clients against the real pipeline
fake-clients devices="3":
    cd server; python -m uv run python scripts/fake_client.py --devices {{devices}}

