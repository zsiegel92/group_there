from fastapi import FastAPI
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


basic_http_bearer_dependency = Depends(HTTPBearer())


def authorize_token(
    token: HTTPAuthorizationCredentials = basic_http_bearer_dependency,
) -> bool:
    import os

    if token.credentials != os.environ["GROUPTHERE_SOLVER_API_KEY"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return True


app = FastAPI(
    name="solver",
    dependencies=[
        Depends(authorize_token),
    ],
)


@app.get("/")
def read_root():
    return {"message": "Hello, World!"}
