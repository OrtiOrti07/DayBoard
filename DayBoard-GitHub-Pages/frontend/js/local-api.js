// Browser storage adapter used when DayBoard is published as a static GitHub Page.
// The locally hosted app continues to use the FastAPI/SQLite implementation.
const STORAGE_KEY = "dayboard-static-v1";

const now = () => new Date().toISOString();
const id = () => globalThis.crypto?.randomUUID?.() || `db-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function freshState() {
  const created = now();
  const boardId = "personal-board";
  return {
    boards: [{ id: boardId, title: "Mi espacio", emoji: "🌿", color: "#7165ef", position: 0, created_at: created, updated_at: created, deleted_at: null }],
    lists: ["Por hacer", "En curso", "Hecho"].map((title, position) => ({
      id: `personal-list-${position + 1}`, board_id: boardId, title, position, wip_limit: null,
      archived: false, created_at: created,
    })),
    cards: [],
  };
}

function read() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const value = JSON.parse(saved);
      if (Array.isArray(value.boards) && Array.isArray(value.lists) && Array.isArray(value.cards)) return value;
    }
  } catch { /* Start with a clean local browser profile if saved data is unreadable. */ }
  const value = freshState();
  write(value);
  return value;
}

function write(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function boardShape(data, board) {
  return {
    ...board,
    lists: data.lists
      .filter((list) => list.board_id === board.id && !list.archived)
      .sort((a, b) => a.position - b.position)
      .map((list) => ({
        ...list,
        cards: data.cards.filter((card) => card.list_id === list.id && !card.deleted_at)
          .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
          .map((card) => ({ ...card, is_done: Boolean(card.is_done) })),
      })),
  };
}

function findCard(data, cardId) {
  const card = data.cards.find((item) => item.id === cardId && !item.deleted_at);
  if (!card) throw new Error("No se encontró la tarjeta.");
  return card;
}

function findList(data, listId, { active = true } = {}) {
  const list = data.lists.find((item) => item.id === listId && (!active || !item.archived));
  if (!list) throw new Error("No se encontró la lista.");
  return list;
}

function nextPosition(data, listId) {
  return data.cards.filter((card) => card.list_id === listId && !card.deleted_at)
    .reduce((max, card) => Math.max(max, card.position), -1) + 1;
}

function doneList(data, boardId, done) {
  const lists = data.lists.filter((item) => item.board_id === boardId && !item.archived).sort((a, b) => a.position - b.position);
  const matches = (title) => ["hecho", "complet", "done"].some((word) => title.toLocaleLowerCase().includes(word));
  return done ? lists.find((item) => matches(item.title)) : lists.find((item) => !matches(item.title)) || lists[0];
}

function cardShape(data, card) {
  const list = data.lists.find((item) => item.id === card.list_id);
  const board = list && data.boards.find((item) => item.id === list.board_id);
  return {
    ...card,
    is_done: Boolean(card.is_done),
    list_title: list?.title || "",
    board_id: board?.id || "",
    board_title: board?.title || "",
    board_emoji: board?.emoji || "✳️",
  };
}

export const localApi = {
  async health() { return { ok: true, app: "DayBoard", storage: "browser" }; },

  async boards() {
    const data = read();
    return data.boards.filter((board) => !board.deleted_at).sort((a, b) => a.position - b.position)
      .map((board) => boardShape(data, board));
  },

  async createBoard(body) {
    const data = read();
    const board = { id: id(), title: body.title, emoji: body.emoji || "✳️", color: body.color || "#7165ef",
      position: data.boards.filter((item) => !item.deleted_at).length, created_at: now(), updated_at: now(), deleted_at: null };
    data.boards.push(board);
    ["Por hacer", "En curso", "Hecho"].forEach((title, position) => data.lists.push({
      id: id(), board_id: board.id, title, position, wip_limit: null, archived: false, created_at: now(),
    }));
    write(data);
    return boardShape(data, board);
  },

  async updateBoard(boardId, changes) {
    const data = read();
    const board = data.boards.find((item) => item.id === boardId && !item.deleted_at);
    if (!board) throw new Error("No se encontró el tablero.");
    Object.assign(board, changes, { updated_at: now() });
    write(data);
    return boardShape(data, board);
  },

  async deleteBoard(boardId) {
    const data = read();
    const board = data.boards.find((item) => item.id === boardId && !item.deleted_at);
    if (!board) throw new Error("No se encontró el tablero.");
    board.deleted_at = now(); board.updated_at = now(); write(data);
    return { ok: true };
  },

  async restoreBoard(boardId) {
    const data = read();
    const board = data.boards.find((item) => item.id === boardId && item.deleted_at);
    if (!board) throw new Error("No se encontró el tablero eliminado.");
    board.deleted_at = null; board.updated_at = now(); write(data);
    return boardShape(data, board);
  },

  async createList(body) {
    const data = read();
    const board = data.boards.find((item) => item.id === body.board_id && !item.deleted_at);
    if (!board) throw new Error("No se encontró el tablero.");
    const list = { id: id(), board_id: body.board_id, title: body.title,
      position: data.lists.filter((item) => item.board_id === body.board_id).length,
      wip_limit: body.wip_limit ?? null, archived: false, created_at: now() };
    data.lists.push(list); write(data);
    return { ...list, cards: [] };
  },

  async updateList(listId, changes) {
    const data = read();
    const list = findList(data, listId, { active: false });
    Object.assign(list, changes); write(data);
    return { ...list };
  },

  async deleteList(listId) {
    const data = read();
    const list = findList(data, listId, { active: false });
    if (!list.archived && data.lists.filter((item) => item.board_id === list.board_id && !item.archived).length <= 1) {
      throw new Error("Cada tablero necesita al menos una lista activa.");
    }
    list.archived = true; write(data);
    return { ok: true, archived: true };
  },

  async reorderLists(body) {
    const data = read();
    const active = data.lists.filter((item) => item.board_id === body.board_id && !item.archived);
    if (active.length !== body.ordered_ids.length || active.some((item) => !body.ordered_ids.includes(item.id))) {
      throw new Error("El orden debe incluir todas las listas activas del tablero.");
    }
    body.ordered_ids.forEach((listId, position) => { findList(data, listId, { active: false }).position = position; });
    write(data);
    return { ok: true, ordered_ids: body.ordered_ids };
  },

  async createCard(body) {
    const data = read();
    let list;
    if (body.list_id) {
      list = findList(data, body.list_id);
      if (body.board_id && list.board_id !== body.board_id) throw new Error("No se encontró la lista.");
    } else {
      const boardId = body.board_id || data.boards.find((item) => !item.deleted_at)?.id;
      if (!boardId) throw new Error("No hay un tablero disponible para esta tarjeta.");
      list = data.lists.filter((item) => item.board_id === boardId && !item.archived).sort((a, b) => a.position - b.position)[0];
    }
    if (!list) throw new Error("El tablero no tiene listas activas.");
    const card = { id: id(), list_id: list.id, title: body.title, description: body.description || "",
      position: nextPosition(data, list.id), due_date: body.due_date || null, is_done: false, completed_at: null,
      created_at: now(), updated_at: now(), deleted_at: null };
    data.cards.push(card); write(data);
    return cardShape(data, card);
  },

  async updateCard(cardId, changes) {
    const data = read();
    const card = findCard(data, cardId);
    const currentList = findList(data, card.list_id, { active: false });
    if (Object.hasOwn(changes, "list_id")) {
      const target = findList(data, changes.list_id);
      if (!Object.hasOwn(changes, "is_done")) changes.is_done = ["hecho", "complet", "done"].some((word) => target.title.toLocaleLowerCase().includes(word));
    } else if (Object.hasOwn(changes, "is_done")) {
      const target = doneList(data, currentList.board_id, Boolean(changes.is_done));
      if (target) changes.list_id = target.id;
    }
    if (changes.list_id && changes.list_id !== card.list_id) card.position = nextPosition(data, changes.list_id);
    Object.assign(card, changes, { updated_at: now() });
    if (Object.hasOwn(changes, "is_done")) {
      card.is_done = Boolean(changes.is_done);
      card.completed_at = card.is_done ? now() : null;
    }
    write(data);
    return cardShape(data, card);
  },

  async deleteCard(cardId) {
    const data = read();
    const card = findCard(data, cardId);
    card.deleted_at = now(); card.updated_at = now(); write(data);
    return { ok: true };
  },

  async restoreCard(cardId) {
    const data = read();
    const card = data.cards.find((item) => item.id === cardId && item.deleted_at);
    if (!card) throw new Error("No se encontró la tarjeta eliminada.");
    card.deleted_at = null; card.position = nextPosition(data, card.list_id); card.updated_at = now(); write(data);
    return cardShape(data, card);
  },

  async reorderCard(body) {
    const data = read();
    const card = findCard(data, body.card_id);
    const target = findList(data, body.target_list_id);
    const sourceId = card.list_id;
    const sourceCards = data.cards.filter((item) => item.list_id === sourceId && !item.deleted_at && item.id !== card.id)
      .sort((a, b) => a.position - b.position);
    const targetCards = sourceId === target.id ? sourceCards : data.cards
      .filter((item) => item.list_id === target.id && !item.deleted_at && item.id !== card.id)
      .sort((a, b) => a.position - b.position);
    targetCards.splice(Math.min(body.target_position, targetCards.length), 0, card);
    if (sourceId !== target.id) sourceCards.forEach((item, position) => { item.position = position; });
    targetCards.forEach((item, position) => { item.list_id = target.id; item.position = position; });
    card.is_done = ["hecho", "complet", "done"].some((word) => target.title.toLocaleLowerCase().includes(word));
    card.completed_at = card.is_done ? now() : null;
    card.updated_at = now();
    write(data);
    return cardShape(data, card);
  },

  async today(day) {
    const data = read();
    const liveBoards = data.boards.filter((board) => !board.deleted_at);
    const visible = data.cards.filter((card) => !card.deleted_at && liveBoards.some((board) =>
      data.lists.some((list) => list.id === card.list_id && list.board_id === board.id)));
    const today = visible.filter((card) => card.due_date === day).map((card) => cardShape(data, card))
      .sort((a, b) => Number(a.is_done) - Number(b.is_done) || a.position - b.position);
    const overdue = visible.filter((card) => !card.is_done && card.due_date && card.due_date < day)
      .map((card) => cardShape(data, card)).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.position - b.position);
    return { date: day, today, overdue,
      summary: { total: today.length, completed: today.filter((card) => card.is_done).length, overdue: overdue.length } };
  },
};
