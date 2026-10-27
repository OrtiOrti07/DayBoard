import { showToast } from "./components/toast.js";
import { localApi } from "./local-api.js";

let staticMode = location.hostname.endsWith("github.io");

function pageUrl(path) {
  return new URL(path.replace(/^\/+/, ""), document.baseURI);
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(pageUrl(path), {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch (error) {
    const message = "No se pudo conectar con DayBoard. Comprueba que el servidor siga en marcha.";
    showToast(message, { actionLabel: "Reintentar", onAction: () => window.location.reload(), isError: true, duration: 9000 });
    throw error;
  }

  if (!response.ok) {
    let detail = "No se pudo guardar el cambio.";
    try {
      const payload = await response.json();
      detail = typeof payload.detail === "string" ? payload.detail : detail;
    } catch { /* The server may return an empty response. */ }
    const error = new Error(detail);
    error.status = response.status;
    showToast(detail, { isError: true });
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  async health() {
    if (staticMode) return localApi.health();
    try {
      const response = await fetch(pageUrl("/api/health"), { cache: "no-store" });
      if (!response.ok) throw new Error("API local no disponible");
      return response.json();
    } catch {
      // This also supports GitHub Pages with a custom domain.
      staticMode = true;
      return localApi.health();
    }
  },
  boards: () => staticMode ? localApi.boards() : request("/api/boards"),
  createBoard: (body) => staticMode ? localApi.createBoard(body) : request("/api/boards", json("POST", body)),
  updateBoard: (id, body) => staticMode ? localApi.updateBoard(id, body) : request(`/api/boards/${encodeURIComponent(id)}`, json("PATCH", body)),
  deleteBoard: (id) => staticMode ? localApi.deleteBoard(id) : request(`/api/boards/${encodeURIComponent(id)}`, { method: "DELETE" }),
  restoreBoard: (id) => staticMode ? localApi.restoreBoard(id) : request(`/api/boards/${encodeURIComponent(id)}/restore`, { method: "POST" }),
  createList: (body) => staticMode ? localApi.createList(body) : request("/api/lists", json("POST", body)),
  updateList: (id, body) => staticMode ? localApi.updateList(id, body) : request(`/api/lists/${encodeURIComponent(id)}`, json("PATCH", body)),
  deleteList: (id) => staticMode ? localApi.deleteList(id) : request(`/api/lists/${encodeURIComponent(id)}`, { method: "DELETE" }),
  reorderLists: (body) => staticMode ? localApi.reorderLists(body) : request("/api/lists/reorder", json("POST", body)),
  createCard: (body) => staticMode ? localApi.createCard(body) : request("/api/cards", json("POST", body)),
  updateCard: (id, body) => staticMode ? localApi.updateCard(id, body) : request(`/api/cards/${encodeURIComponent(id)}`, json("PATCH", body)),
  deleteCard: (id) => staticMode ? localApi.deleteCard(id) : request(`/api/cards/${encodeURIComponent(id)}`, { method: "DELETE" }),
  restoreCard: (id) => staticMode ? localApi.restoreCard(id) : request(`/api/cards/${encodeURIComponent(id)}/restore`, { method: "POST" }),
  reorderCard: (body) => staticMode ? localApi.reorderCard(body) : request("/api/cards/reorder", json("POST", body)),
  today: (date) => staticMode ? localApi.today(date) : request(`/api/today?date=${encodeURIComponent(date)}`),
};
