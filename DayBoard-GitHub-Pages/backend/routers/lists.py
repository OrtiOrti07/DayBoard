"""Board columns (lists)."""

from fastapi import APIRouter, HTTPException

from backend.database import database, local_now, new_id
from backend.models import ListCreate, ListPatch, ListReorder

router = APIRouter(prefix="/api/lists", tags=["listas"])


@router.post("/reorder")
def reorder_lists(body: ListReorder):
    with database() as db:
        if not db.execute(
            "SELECT 1 FROM boards WHERE id = ? AND deleted_at IS NULL", (body.board_id,)
        ).fetchone():
            raise HTTPException(404, "No se encontró el tablero.")
        current_ids = [row["id"] for row in db.execute(
            "SELECT id FROM lists WHERE board_id = ? AND archived = 0 ORDER BY position", (body.board_id,)
        ).fetchall()]
        if len(body.ordered_ids) != len(current_ids) or set(body.ordered_ids) != set(current_ids):
            raise HTTPException(400, "El orden debe incluir todas las listas activas del tablero.")
        for position, list_id in enumerate(body.ordered_ids):
            db.execute("UPDATE lists SET position = ? WHERE id = ?", (position, list_id))
        return {"ok": True, "ordered_ids": body.ordered_ids}


@router.post("", status_code=201)
def create_list(body: ListCreate):
    now = local_now()
    list_id = new_id()
    with database() as db:
        if not db.execute(
            "SELECT 1 FROM boards WHERE id = ? AND deleted_at IS NULL", (body.board_id,)
        ).fetchone():
            raise HTTPException(404, "No se encontró el tablero.")
        position = db.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM lists WHERE board_id = ?",
            (body.board_id,),
        ).fetchone()["n"]
        db.execute(
            """INSERT INTO lists(id, board_id, title, position, wip_limit, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (list_id, body.board_id, body.title, position, body.wip_limit, now),
        )
        return {"id": list_id, "board_id": body.board_id, "title": body.title,
                "position": position, "wip_limit": body.wip_limit, "archived": False, "cards": []}


@router.patch("/{list_id}")
def update_list(list_id: str, body: ListPatch):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "No hay cambios que guardar.")
    with database() as db:
        row = db.execute("SELECT id FROM lists WHERE id = ?", (list_id,)).fetchone()
        if not row:
            raise HTTPException(404, "No se encontró la lista.")
        assignments = ", ".join(f"{key} = ?" for key in changes)
        values = [int(value) if key == "archived" else value for key, value in changes.items()]
        db.execute(f"UPDATE lists SET {assignments} WHERE id = ?", (*values, list_id))
        updated = db.execute("SELECT * FROM lists WHERE id = ?", (list_id,)).fetchone()
        result = dict(updated)
        result["archived"] = bool(result["archived"])
        return result


@router.delete("/{list_id}")
def delete_list(list_id: str):
    with database() as db:
        row = db.execute("SELECT * FROM lists WHERE id = ?", (list_id,)).fetchone()
        if not row:
            raise HTTPException(404, "No se encontró la lista.")
        live_lists = db.execute(
            "SELECT COUNT(*) AS n FROM lists WHERE board_id = ? AND archived = 0", (row["board_id"],)
        ).fetchone()["n"]
        if live_lists <= 1:
            raise HTTPException(409, "Cada tablero necesita al menos una lista activa.")
        db.execute("UPDATE lists SET archived = 1 WHERE id = ?", (list_id,))
        return {"ok": True, "archived": True}
