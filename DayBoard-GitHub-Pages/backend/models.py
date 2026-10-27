"""Validated request bodies for the phase-one API."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

ShortText = Annotated[str, Field(min_length=1, max_length=160)]
HexColor = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class BoardCreate(InputModel):
    title: ShortText
    emoji: Annotated[str, Field(max_length=12)] = "✳️"
    color: HexColor = "#7165ef"


class BoardPatch(InputModel):
    title: ShortText = None
    emoji: Annotated[str, Field(max_length=12)] = None
    color: HexColor = None


class ListCreate(InputModel):
    board_id: str
    title: ShortText
    wip_limit: Annotated[int, Field(ge=1, le=999)] | None = None


class ListPatch(InputModel):
    title: ShortText = None
    wip_limit: Annotated[int, Field(ge=1, le=999)] | None = None
    archived: bool = None


class ListReorder(InputModel):
    board_id: str
    ordered_ids: Annotated[list[str], Field(min_length=1, max_length=80)]


class CardCreate(InputModel):
    title: ShortText
    board_id: str | None = None
    list_id: str | None = None
    description: Annotated[str, Field(max_length=10000)] = ""
    due_date: date | None = None


class CardPatch(InputModel):
    title: ShortText = None
    description: Annotated[str, Field(max_length=10000)] = None
    due_date: date | None = None
    is_done: bool = None
    list_id: str = None


class CardReorder(InputModel):
    card_id: str
    target_list_id: str
    target_position: Annotated[int, Field(ge=0)]
