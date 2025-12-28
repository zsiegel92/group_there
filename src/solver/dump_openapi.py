import json

from server import app

openapi_json = json.dumps(app.openapi(), indent=2)
with open("openapi.json", "w") as f:
    f.write(openapi_json)