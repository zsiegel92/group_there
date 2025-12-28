from fastapi import FastAPI
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../../.env",
        env_file_encoding="utf-8",
    )
    GROUPTHERE_SOLVER_API_KEY: str | None = None
    GOOGLE_ROUTES_API_KEY: str | None = None


settings = Settings()


basic_http_bearer_dependency = Depends(HTTPBearer())


def authorize_token(
    token: HTTPAuthorizationCredentials = basic_http_bearer_dependency,
) -> bool:
    if settings.GROUPTHERE_SOLVER_API_KEY is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server API Error!",
        )
    if token.credentials != settings.GROUPTHERE_SOLVER_API_KEY:
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
