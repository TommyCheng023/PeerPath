from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import match, history

app = FastAPI(title="PeerPath API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(match.router, prefix="/api")
app.include_router(history.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "PeerPath API is running"}
