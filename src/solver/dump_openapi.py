# src/solver/.venv/bin/python src/solver/dump_openapi.py
import json
from server import app

with open("src/solver/openapi.json", "w") as f:
    json.dump(app.openapi(), f)
