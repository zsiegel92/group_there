# src/solver/.venv/bin/python src/solver/dump_openapi.py
import json
from server import webapp

with open("src/solver/openapi.json", "w") as f:
    json.dump(webapp.openapi(), f)
