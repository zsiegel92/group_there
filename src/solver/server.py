from app_infra import app
from models import Problem


@app.get("/")
def read_root():
    return {"message": "Hello, World!"}


@app.post("/solve")
def solve(problem: Problem):
    return {"message": "Hello, World!"}
