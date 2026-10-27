"""Card creation, completion, scheduling, ordering and soft deletion."""

from datetime import date

from fastapi import APIRouter, HTTPException

from backend.database import database, local_now, new_id
from backend.models import CardCreate, CardPatch, CardReorder

router = APIRouter(prefix="/api/cards", tags=["tarjetas"])


def _get_card(db, card_id: str):
    row = db.execute(
        """SELECT c.*, l.board_id FROM cards c JOIN lists l ON l.id = c.list_id
           WHERE c.id = ? AND c.deleted_at IS NULL""", (card_id,)
    ).fetchone()
    if not row:
        return None
    card = dict(row)
    card["is_done"] = bool(card["is_done"])
    return card


def _done_list(db, board_id: str, *, done: bool):
    rows = db.execute(
        "SELECT id, title FROM lists WHERE board_id = ? AND archived = 0 ORDER BY position",
        (board_id,),
    ).fetchall()
    is_done_name = lambda title: any(word in title.casefold() for word in ("hecho", "complet", "done"))
    if done:
        return next((row["id"] for row in rows if is_done_name(row["title"])), None)
    return next((row["id"] for row in rows if not is_done_name(row["title"])), rows[0]["id"] if rows else None)


def _insert_position(db, list_id: str):
    return db.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM cards WHERE list_id = ? AND deleted_at IS NULL",
        (list_id,),
    ).fetchone()["n"]


@router.post("", status_code=201)
def create_card(body: CardCreate):
    now = local_now()
    card_id = new_id()
    with database() as db:
        list_row = None
        if body.list_id:
            list_row = db.execute(
                """SELECT l.*, b.id AS live_board FROM lists l JOIN boards b ON b.id = l.board_id
                   WHERE l.id = ? AND l.archived = 0 AND b.deleted_at IS NULL""",
                (body.list_id,),
            ).fetchone()
            if not list_row or (body.board_id and list_row["board_id"] != body.board_id):
                raise HTTPException(404, "No se encontró la lista.")
        elif body.board_id:
            list_row = db.execute(
                """SELECT l.* FROM lists l JOIN boards b ON b.id = l.board_id
                   WHERE l.board_id = ? AND l.archived = 0 AND b.deleted_at IS NULL
                   ORDER BY l.position LIMIT 1""",
                (body.board_id,),
            ).fetchone()
            if not list_row:
                raise HTTPException(404, "El tablero no tiene listas activas.")
        else:
            list_row = db.execute(
                """SELECT l.* FROM lists l JOIN boards b ON b.id = l.board_id
                   WHERE l.archived = 0 AND b.deleted_at IS NULL ORDER BY b.position, l.position LIMIT 1"""
            ).fetchone()
        if not list_row:
            raise HTTPException(404, "No hay un tablero disponible para esta tarjeta.")
        position = _insert_position(db, list_row["id"])
        db.execute(
            """INSERT INTO cards(id, list_id, title, description, position, due_date,
               created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (card_id, list_row["id"], body.title, body.description, position,
             body.due_date.isoformat() if body.due_date else None, now, now),
        )
        return _get_card(db, card_id)


@router.patch("/{card_id}")
def update_card(card_id: str, body: CardPatch):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "No hay cambios que guardar.")
    with database() as db:
        current = _get_card(db, card_id)
        if not current:
            raise HTTPException(404, "No se encontró la tarjeta.")
        destination = changes.get("list_id", current["list_id"])
        destination_row = db.execute(
            """SELECT l.*, b.deleted_at AS board_deleted FROM lists l
               JOIN boards b ON b.id = l.board_id WHERE l.id = ?""", (destination,)
        ).fetchone()
        if not destination_row or destination_row["archived"] or destination_row["board_deleted"]:
            raise HTTPException(404, "No se encontró la lista de destino.")
        if "is_done" in changes and "list_id" not in changes:
            done_destination = _done_list(db, destination_row["board_id"], done=changes["is_done"])
            if done_destination:
                destination = done_destination
                changes["list_id"] = destination
        if "list_id" in changes and "is_done" not in changes:
            done_title = destination_row["title"].casefold()
            changes["is_done"] = int(any(word in done_title for word in ("hecho", "complet", "done")))
        if "is_done" in changes:
            changes["is_done"] = int(changes["is_done"])
            changes["completed_at"] = local_now() if changes["is_done"] else None
        if "due_date" in changes:
            changes["due_date"] = changes["due_date"].isoformat() if changes["due_date"] else None
        if destination != current["list_id"]:
            changes["position"] = _insert_position(db, destination)
        assignments = ", ".join(f"{key} = ?" for key in changes)
        db.execute(
            f"UPDATE cards SET {assignments}, updated_at = ? WHERE id = ?",
            (*changes.values(), local_now(), card_id),
        )
        return _get_card(db, card_id)


@router.post("/reorder")
def reorder_card(body: CardReorder):
    with database() as db:
        card = _get_card(db, body.card_id)
        if not card:
            raise HTTPException(404, "No se encontró la tarjeta.")
        target = db.execute(
            """SELECT l.*, b.deleted_at AS board_deleted FROM lists l
               JOIN boards b ON b.id = l.board_id WHERE l.id = ?""", (body.target_list_id,)
        ).fetchone()
        if not target or target["archived"] or target["board_deleted"]:
            raise HTTPException(404, "No se encontró la lista de destino.")

        source_id = card["list_id"]
        source_ids = [row["id"] for row in db.execute(
            "SELECT id FROM cards WHERE list_id = ? AND deleted_at IS NULL ORDER BY position, created_at", (source_id,)
        ).fetchall() if row["id"] != body.card_id]
        if source_id == body.target_list_id:
            target_ids = source_ids
        else:
            target_ids = [row["id"] for row in db.execute(
                "SELECT id FROM cards WHERE list_id = ? AND deleted_at IS NULL ORDER BY position, created_at", (body.target_list_id,)
            ).fetchall() if row["id"] != body.card_id]
        index = min(body.target_position, len(target_ids))
        target_ids.insert(index, body.card_id)
        now = local_now()
        if source_id != body.target_list_id:
            for position, item_id in enumerate(source_ids):
                db.execute("UPDATE cards SET position = ? WHERE id = ?", (position, item_id))
        for position, item_id in enumerate(target_ids):
            if item_id == body.card_id:
                title = target["title"].casefold()
                is_done = int(any(word in title for word in ("hecho", "complet", "done")))
                db.execute(
                    """UPDATE cards SET list_id = ?, position = ?, is_done = ?, completed_at = ?, updated_at = ?
                       WHERE id = ?""",
                    (body.target_list_id, position, is_done,
                     now if is_done else None, now, item_id),
                )
            else:
                db.execute("UPDATE cards SET position = ? WHERE id = ?", (position, item_id))
        return _get_card(db, body.card_id)


@router.delete("/{card_id}")
def delete_card(card_id: str):
    with database() as db:
        cursor = db.execute(
            "UPDATE cards SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
            (local_now(), local_now(), card_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "No se encontró la tarjeta.")
        return {"ok": True}


@router.post("/{card_id}/restore")
def restore_card(card_id: str):
    with database() as db:
        cursor = db.execute(
            "UPDATE cards SET deleted_at = NULL, updated_at = ?, position = (SELECT COALESCE(MAX(c2.position), -1) + 1 FROM cards c2 WHERE c2.list_id = cards.list_id AND c2.deleted_at IS NULL) WHERE id = ? AND deleted_at IS NOT NULL",
            (local_now(), card_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "No se encontró la tarjeta eliminada.")
        return _get_card(db, card_id)
