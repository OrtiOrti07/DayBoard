import { api } from "../api.js";
import { openSheet } from "../components/bottom-sheet.js";
import { enableCardDrag } from "../components/dragdrop.js";
import { showToast } from "../components/toast.js";
import { setUndo, state } from "../store.js";
import { localDateString } from "./today.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function button(label, className, action) {
  const node = el("button", className, label);
  node.type = "button";
  node.setAttribute("aria-label", label);
  node.addEventListener("click", action);
  return node;
}

async function createBoard(onChange) {
  const values = await openSheet({
    title: "Un tablero nuevo",
    description: "Crea un espacio para ordenar un proyecto o una parte de tu vida.",
    fields: [
      { name: "title", label: "Nombre", placeholder: "Ej. Proyecto personal", required: true, maxLength: 160 },
      { name: "emoji", label: "Emoji", value: "✳️", maxLength: 12 },
    ],
    submitLabel: "Crear tablero",
  });
  if (!values) return;
  const board = await api.createBoard({ title: values.title, emoji: values.emoji || "✳️", color: "#7165ef" });
  state.selectedBoardId = board.id;
  await onChange();
  showToast("Tablero creado");
}

async function createCard(boardId, listId, onChange) {
  const values = await openSheet({
    title: "Nueva tarjeta",
    fields: [
      { name: "title", label: "Título", placeholder: "¿Qué hay que hacer?", required: true, maxLength: 160 },
      { name: "due_date", label: "Fecha límite (opcional)", type: "date" },
    ],
    submitLabel: "Añadir tarjeta",
  });
  if (!values) return;
  await api.createCard({ board_id: boardId, list_id: listId, title: values.title, due_date: values.due_date || null });
  await onChange();
}

async function editCard(card, onChange) {
  const values = await openSheet({
    title: "Editar tarjeta",
    description: "Puedes cambiar el título, añadir un detalle o ajustar su fecha.",
    fields: [
      { name: "title", label: "Título", value: card.title, required: true, maxLength: 160 },
      { name: "description", label: "Descripción", type: "textarea", value: card.description || "", maxLength: 10000 },
      { name: "due_date", label: "Fecha límite", type: "date", value: card.due_date || "" },
    ],
    submitLabel: "Guardar cambios",
  });
  if (!values) return;
  await api.updateCard(card.id, { title: values.title, description: values.description, due_date: values.due_date || null });
  await onChange();
}

async function removeCard(card, onChange) {
  const confirm = await openSheet({
    title: "Eliminar tarjeta",
    description: `“${card.title}” se moverá a la papelera y podrás deshacerlo ahora mismo.`,
    submitLabel: "Eliminar",
  });
  if (!confirm) return;
  await api.deleteCard(card.id);
  setUndo({ label: "Tarjeta eliminada", action: async () => { await api.restoreCard(card.id); await onChange(); } });
  await onChange();
  showToast("Tarjeta eliminada", { actionLabel: "Deshacer", onAction: async () => { await state.undo?.action(); state.undo = null; } });
}

async function removeBoard(board, onChange) {
  const confirm = await openSheet({
    title: "Eliminar tablero",
    description: `“${board.title}” y sus tarjetas se moverán a la papelera. Puedes restaurarlo ahora mismo.`,
    submitLabel: "Eliminar tablero",
  });
  if (!confirm) return;
  await api.deleteBoard(board.id);
  setUndo({ label: "Tablero eliminado", action: async () => { await api.restoreBoard(board.id); state.selectedBoardId = board.id; await onChange(); } });
  await onChange();
  showToast("Tablero eliminado", { actionLabel: "Deshacer", onAction: async () => { await state.undo?.action(); state.undo = null; } });
}

async function renameBoard(board, onChange) {
  const values = await openSheet({
    title: "Editar tablero",
    fields: [
      { name: "title", label: "Nombre", value: board.title, required: true, maxLength: 160 },
      { name: "emoji", label: "Emoji", value: board.emoji, maxLength: 12 },
    ],
    submitLabel: "Guardar",
  });
  if (!values) return;
  await api.updateBoard(board.id, { title: values.title, emoji: values.emoji || "✳️" });
  await onChange();
  showToast("Tablero actualizado");
}

async function editList(taskList, onChange) {
  const values = await openSheet({
    title: "Editar lista",
    fields: [{ name: "title", label: "Nombre", value: taskList.title, required: true, maxLength: 160 }],
    submitLabel: "Guardar",
  });
  if (!values) return;
  await api.updateList(taskList.id, { title: values.title });
  await onChange();
}

async function archiveList(taskList, onChange) {
  const confirm = await openSheet({
    title: "Archivar lista",
    description: `“${taskList.title}” y sus tarjetas quedarán archivadas.`,
    submitLabel: "Archivar",
  });
  if (!confirm) return;
  await api.deleteList(taskList.id);
  await onChange();
  showToast("Lista archivada");
}

async function addList(board, onChange) {
  const values = await openSheet({
    title: "Añadir lista",
    fields: [{ name: "title", label: "Nombre de la lista", placeholder: "Ej. En espera", required: true, maxLength: 160 }],
    submitLabel: "Añadir lista",
  });
  if (!values) return;
  await api.createList({ board_id: board.id, title: values.title });
  await onChange();
}

function boardCard(card, list, onChange) {
  const article = el("article", `board-card${card.is_done ? " is-done" : ""}`);
  article.dataset.cardId = card.id;
  const check = el("button", `task-check${card.is_done ? " is-done" : ""}`);
  check.type = "button";
  check.setAttribute("aria-label", `${card.is_done ? "Marcar pendiente" : "Completar"}: ${card.title}`);
  check.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 4 4 8-9"></path></svg>';
  check.addEventListener("click", async () => {
    try { await api.updateCard(card.id, { is_done: !card.is_done }); await onChange(); }
    catch { /* api.js presents the error. */ }
  });
  const copy = el("button", "board-card-copy");
  copy.type = "button";
  copy.setAttribute("aria-label", `Editar tarjeta: ${card.title}`);
  copy.append(el("div", "board-card-title", card.title));
  if (card.due_date) {
    const date = el("div", `board-card-date${!card.is_done && card.due_date < localDateString() ? " is-overdue" : ""}`, new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(`${card.due_date}T12:00:00`)));
    copy.append(date);
  }
  copy.addEventListener("click", () => editCard(card, onChange));
  const handle = el("button", "drag-handle");
  handle.type = "button";
  handle.setAttribute("aria-label", `Mover tarjeta: ${card.title}`);
  handle.title = "Mantén pulsado para mover";
  handle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="4" r="1.1"/><circle cx="11" cy="4" r="1.1"/><circle cx="5" cy="8" r="1.1"/><circle cx="11" cy="8" r="1.1"/><circle cx="5" cy="12" r="1.1"/><circle cx="11" cy="12" r="1.1"/></svg>';
  const remove = button(`Eliminar tarjeta: ${card.title}`, "icon-button card-remove", () => removeCard(card, onChange));
  remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"></path></svg>';
  article.append(check, copy, handle, remove);
  return article;
}

export function renderBoards({ onChange }) {
  const page = el("section", "boards-view");
  const switcher = el("div", "board-switcher");
  for (const board of state.boards) {
    const chip = el("button", `board-chip${board.id === state.selectedBoardId ? " is-selected" : ""}`);
    chip.type = "button";
    chip.setAttribute("aria-label", `Abrir tablero ${board.title}`);
    chip.append(el("span", "board-emoji", board.emoji), el("span", "", board.title));
    chip.addEventListener("click", () => { state.selectedBoardId = board.id; onChange(); });
    switcher.append(chip);
  }
  const addBoardChip = button("+ Tablero", "board-chip", () => createBoard(onChange));
  switcher.append(addBoardChip);
  page.append(switcher);

  const board = state.boards.find((item) => item.id === state.selectedBoardId);
  if (!board) {
    const empty = el("div", "placeholder-page");
    empty.append(el("div", "placeholder-art", "✳"), el("h1", "", "Tus ideas empiezan aquí"), el("p", "", "Crea un tablero y reúne tus tareas en un solo lugar."));
    const create = button("Crear mi primer tablero", "primary-button", () => createBoard(onChange));
    create.style.marginTop = "18px";
    empty.append(create);
    page.append(empty);
    return page;
  }

  const header = el("header", "board-header");
  const heading = el("div", "board-heading");
  heading.append(el("div", "board-heading-icon", board.emoji));
  const copy = el("div", "board-heading-copy");
  copy.append(el("h1", "", board.title));
  const taskCount = board.lists.reduce((sum, list) => sum + list.cards.length, 0);
  copy.append(el("p", "", `${taskCount} ${taskCount === 1 ? "tarjeta" : "tarjetas"} · solo tú puedes verlo`));
  heading.append(copy);
  const edit = button("Editar tablero", "icon-button", () => renameBoard(board, onChange));
  edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.7 4.2 4.2-.7L19.7 7.8a2.1 2.1 0 0 0-3-3L4 16.5Z"></path><path d="m14.9 6.6 3 3"></path></svg>';
  heading.append(edit);
  const remove = button("Eliminar tablero", "icon-button", () => removeBoard(board, onChange));
  remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"></path></svg>';
  heading.append(remove);
  header.append(heading);
  page.append(header);

  const lanes = el("div", "board-lanes");
  lanes.setAttribute("aria-label", `Listas del tablero ${board.title}`);
  for (const list of board.lists) {
    const lane = el("section", "board-lane");
    lane.dataset.listId = list.id;
    const laneHead = el("div", "lane-head");
    laneHead.append(el("span", "lane-dot"), el("h2", "lane-title", list.title), el("span", "lane-count", String(list.cards.length)));
    const listIndex = board.lists.findIndex((item) => item.id === list.id);
    const moveList = async (offset) => {
      const ordered = board.lists.map((item) => item.id);
      const targetIndex = listIndex + offset;
      if (targetIndex < 0 || targetIndex >= ordered.length) return;
      [ordered[listIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[listIndex]];
      try { await api.reorderLists({ board_id: board.id, ordered_ids: ordered }); await onChange(); }
      catch { /* api.js presents the error. */ }
    };
    const moveLeft = button(`Mover ${list.title} a la izquierda`, "icon-button lane-order", () => moveList(-1));
    moveLeft.textContent = "‹";
    moveLeft.disabled = listIndex === 0;
    const moveRight = button(`Mover ${list.title} a la derecha`, "icon-button lane-order", () => moveList(1));
    moveRight.textContent = "›";
    moveRight.disabled = listIndex === board.lists.length - 1;
    laneHead.append(moveLeft, moveRight);
    const editListButton = button(`Renombrar lista ${list.title}`, "icon-button lane-menu", () => editList(list, onChange));
    editListButton.textContent = "···";
    editListButton.style.fontSize = "18px";
    laneHead.append(editListButton);
    const archiveButton = button(`Archivar lista ${list.title}`, "icon-button lane-menu", () => archiveList(list, onChange));
    archiveButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16l-1 13H5L4 7Zm-1-3h18v3H3zM10 11h4"></path></svg>';
    laneHead.append(archiveButton);
    lane.append(laneHead);

    const cards = el("div", "lane-cards");
    cards.dataset.listId = list.id;
    for (const card of list.cards) cards.append(boardCard(card, list, onChange));
    lane.append(cards);
    const add = button("+ Añadir tarjeta", "lane-add", () => createCard(board.id, list.id, onChange));
    lane.append(add);
    lanes.append(lane);
  }
  const addList = button("+ Añadir una lista", "add-list-card", () => addList(board, onChange));
  lanes.append(addList);
  page.append(lanes);
  enableCardDrag(lanes, async (cardId, listId, position) => {
    try { await api.reorderCard({ card_id: cardId, target_list_id: listId, target_position: position }); await onChange(); }
    catch { /* api.js presents the error. */ }
  });
  return page;
}

export async function createBoardTask(onChange) {
  const board = state.boards.find((item) => item.id === state.selectedBoardId);
  if (!board) return createBoard(onChange);
  const firstList = board.lists.find((list) => !list.title.toLowerCase().includes("hecho")) || board.lists[0];
  if (firstList) return createCard(board.id, firstList.id, onChange);
}
