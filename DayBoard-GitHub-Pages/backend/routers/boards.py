"""Board creation, listing, editing and soft deletion."""

from fastapi import APIRouter, HTTPException

from backend.database import database, local_now, new_id
from backend.models import BoardCreate, BoardPatch

router = APIRouter(prefix="/api/boards", tags=["tableros"])


def _board(db, board_id: str, *, include_archived: bool = False):
    row = db.execute(
        "SELECT * FROM boards WHERE id = ? AND deleted_at IS NULL", (board_id,)
    ).fetchone()
    if not row:
        return None
    board = dict(row)
    query = "SELECT * FROM lists WHERE board_id = ?"
    if not include_archived:
        query += " AND archived = 0"
    query += " ORDER BY position, created_at"
    board["lists"] = []
    for list_row in db.execute(query, (board_id,)).fetchall():
        task_list = dict(list_row)
        task_list["archived"] = bool(task_list["archived"])
        task_list["cards"] = [
            dict(card)
            for card in db.execute(
                """SELECT * FROM cards WHERE list_id = ? AND deleted_at IS NULL
                   ORDER BY position, created_at""",
                (task_list["id"],),
            ).fetchall()
        ]
        for card in task_list["cards"]:
            card["is_done"] = bool(card["is_done"])
        board["lists"].append(task_list)
    return board


@router.get("")
def get_boards():
    with database() as db:
        rows = db.execute(
            "SELECT id FROM boards WHERE deleted_at IS NULL ORDER BY position, created_at"
        ).fetchall()
        return [_board(db, row["id"]) for row in rows]


@router.post("", status_code=201)
def create_board(body: BoardCreate):
    now = local_now()
    board_id = new_id()
    with database() as db:
        position = db.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM boards WHERE deleted_at IS NULL"
        ).fetchone()["n"]
        db.execute(
            """INSERT INTO boards(id, title, emoji, color, position, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (board_id, body.title, body.emoji or "✳️", body.color, position, now, now),
        )
        for index, title in enumerate(("Por hacer", "En curso", "Hecho")):
            db.execute(
                "INSERT INTO lists(id, board_id, title, position, created_at) VALUES (?, ?, ?, ?, ?)",
                (new_id(), board_id, title, index, now),
            )
        return _board(db, board_id)


@router.get("/{board_id}")
def get_board(board_id: str):
    with database() as db:
        board = _board(db, board_id)
        if not board:
            raise HTTPException(404, "No se encontró el tablero.")
        return board


@router.patch("/{board_id}")
def update_board(board_id: str, body: BoardPatch):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "No hay cambios que guardar.")
    with database() as db:
        if not db.execute(
            "SELECT 1 FROM boards WHERE id = ? AND deleted_at IS NULL", (board_id,)
        ).fetchone():
            raise HTTPException(404, "No se encontró el tablero.")
        assignments = ", ".join(f"{key} = ?" for key in changes)
        db.execute(
            f"UPDATE boards SET {assignments}, updated_at = ? WHERE id = ?",
            (*changes.values(), local_now(), board_id),
        )
        return _board(db, board_id)


@router.delete("/{board_id}")
def delete_board(board_id: str):
    with database() as db:
        cursor = db.execute(
            "UPDATE boards SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
            (local_now(), local_now(), board_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "No se encontró el tablero.")
        return {"ok": True}


@router.post("/{board_id}/restore")
def restore_board(board_id: str):
    with database() as db:
        cursor = db.execute(
            "UPDATE boards SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL",
            (local_now(), board_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "No se encontró el tablero eliminado.")
        return _board(db, board_id)
