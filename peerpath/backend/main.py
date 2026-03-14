from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, match, history
from services.db import init_database, is_database_configured

app = FastAPI(title="PeerPath API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    if is_database_configured():
        init_database()


app.include_router(auth.router, prefix="/api")
app.include_router(match.router, prefix="/api")
app.include_router(history.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "PeerPath API is running"}
