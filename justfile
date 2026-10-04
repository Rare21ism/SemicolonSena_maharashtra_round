# Roundtable Justfile
# Cross-platform task runner recipes

set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

npm := if os() == "windows" { "npm.cmd" } else { "npm" }
py_run := if os() == "windows" { "python -m uv run" } else { ".venv/bin/python" }
uvicorn_run := if os() == "windows" { "python -m uv run uvicorn" } else { ".venv/bin/uvicorn" }
pytest_run := if os() == "windows" { "python -m uv run --extra dev pytest" } else { ".venv/bin/pytest" }

# Default recipe listing available commands
default:
    @just --list

# Start FastAPI backend server on 0.0.0.0:8000
dev-server:
    cd server; {{ uvicorn_run }} roundtable.main:app --host 0.0.0.0 --port 8000 --reload

# Start Expo universal app development server for Expo Go
dev-app:
    {{ npm }} --workspace=app run start -- --go -c

# Launch Roundtable app in the web browser
dev-web:
    {{ npm }} --workspace=app run web

alias web-dev := dev-web

# Start Expo dev server with cloud tunnel for remote mobile testing in Expo Go
tunnel:
    {{ npm }} --workspace=app run start -- --tunnel --go -c

# Run full test suite (TypeScript protocol tests + React Native app tests + Python backend tests)
test:
    {{ npm }} --workspace=@roundtable/protocol test
    {{ npm }} --workspace=app test
    cd server; {{ pytest_run }}

# Run integration test with simulated audio clients against the real pipeline
fake-clients devices="3":
    cd server; {{ py_run }} scripts/fake_client.py --devices {{ devices }}

