# pixi run --manifest-path src/solver/pyproject.toml python-dump-openapi
import json
from pathlib import Path

from server import webapp

with (Path(__file__).with_name("openapi.json")).open("w") as f:
    json.dump(webapp.openapi(), f)
