"""FastAPI application entrypoint for DayBoard."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.database import initialize_database
from backend.routers import boards, cards, lists, today

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"

app = FastAPI(
    title="DayBoard",
    description="Tu espacio personal para organizar el día, guardado en tu ordenador.",
    version="0.1.0",
)

# The browser UI is served from this same local origin. Keep API CORS closed to
# other hosts while allowing the two standard local development origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(boards.router)
app.include_router(lists.router)
app.include_router(cards.router)
app.include_router(today.router)


@app.on_event("startup")
def startup() -> None:
    initialize_database()


@app.get("/api/health", tags=["sistema"])
def health():
    return {"ok": True, "app": "DayBoard"}


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
