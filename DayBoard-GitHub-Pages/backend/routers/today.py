"""Date-based task feed for the Today screen."""

from datetime import date

from fastapi import APIRouter, Query

from backend.database import database

router = APIRouter(prefix="/api/today", tags=["hoy"])


@router.get("")
def get_today(day: date = Query(default_factory=date.today, alias="date")):
    with database() as db:
        rows = db.execute(
            """SELECT c.*, l.title AS list_title, l.board_id, b.title AS board_title,
                      b.emoji AS board_emoji
               FROM cards c JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id
               WHERE c.deleted_at IS NULL AND b.deleted_at IS NULL AND c.due_date = ?
               ORDER BY c.is_done, c.position, c.created_at""",
            (day.isoformat(),),
        ).fetchall()
        overdue_rows = db.execute(
            """SELECT c.*, l.title AS list_title, l.board_id, b.title AS board_title,
                      b.emoji AS board_emoji
               FROM cards c JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id
               WHERE c.deleted_at IS NULL AND b.deleted_at IS NULL AND c.is_done = 0
                 AND c.due_date < ?
               ORDER BY c.due_date, c.position, c.created_at""",
            (day.isoformat(),),
        ).fetchall()
        today_cards = [dict(row) for row in rows]
        overdue = [dict(row) for row in overdue_rows]
        for card in today_cards:
            card["is_done"] = bool(card["is_done"])
        return {
            "date": day.isoformat(),
            "today": today_cards,
            "overdue": overdue,
            "summary": {
                "total": len(today_cards),
                "completed": sum(1 for card in today_cards if card["is_done"]),
                "overdue": len(overdue),
            },
        }
