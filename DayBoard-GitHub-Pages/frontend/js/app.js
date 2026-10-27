import { api } from "./api.js";
import { openSheet } from "./components/bottom-sheet.js";
import { showToast } from "./components/toast.js";
import { setBoards, setToday, state } from "./store.js";
import { renderToday, createTodayTask, localDateString } from "./views/today.js";
import { renderBoards, createBoardTask } from "./views/boards.js";

const view = document.querySelector("#view");
const quickAdd = document.querySelector("#quick-add");
const routes = {
  today: { title: "Hoy", render: ({ onChange }) => renderToday({ onChange }), add: createTodayTask },
  boards: { title: "Tableros", render: ({ onChange }) => renderBoards({ onChange }), add: createBoardTask },
  calendar: { title: "Agenda", symbol: "▦", description: "Pronto podrás ver y mover tus tareas desde una agenda semanal o mensual." },
  habits: { title: "Hábitos", symbol: "♡", description: "Estamos preparando tu espacio para crear hábitos y seguir tus rachas." },
  more: { title: "Tu espacio", symbol: "✦", description: "En las próximas fases llegarán notas, enfoque y estadísticas." },
};

async function loadData() {
  const [boards, today] = await Promise.all([api.boards(), api.today(localDateString())]);
  setBoards(boards);
  setToday(today);
}

function updateNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    const selected = item.dataset.route === state.route;
    item.classList.toggle("is-active", selected);
    if (selected) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  quickAdd.setAttribute("aria-label", state.route === "boards" ? "Crear tarjeta o tablero" : "Crear tarea");
  document.title = `${routes[state.route]?.title || "Hoy"} — DayBoard`;
}

function render() {
  updateNavigation();
  const route = routes[state.route] || routes.today;
  if (route.render) {
    view.replaceChildren(route.render({ onChange: refresh }));
    return;
  }
  const page = document.createElement("section");
  page.className = "placeholder-page";
  const art = document.createElement("div"); art.className = "placeholder-art"; art.textContent = route.symbol;
  const title = document.createElement("h1"); title.textContent = route.title;
  const description = document.createElement("p"); description.textContent = route.description;
  page.append(art, title, description);
  view.replaceChildren(page);
}

async function refresh() {
  await loadData();
  render();
}

function routeFromHash() {
  const route = location.hash.replace(/^#/, "") || "today";
  state.route = Object.hasOwn(routes, route) ? route : "today";
  render();
}

document.querySelectorAll(".nav-item").forEach((link) => link.addEventListener("click", () => {
  state.route = link.dataset.route;
}));
window.addEventListener("hashchange", routeFromHash);
quickAdd.addEventListener("click", async () => {
  const route = routes[state.route];
  if (route?.add) {
    try { await route.add(refresh); }
    catch { /* api.js displays a helpful message. */ }
  }
});
document.querySelector("[data-action='search']").addEventListener("click", () => showToast("La búsqueda global llegará en una fase posterior."));

document.addEventListener("keydown", (event) => {
  const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (editing || event.altKey || event.metaKey) return;
  if (event.key.toLowerCase() === "n") { event.preventDefault(); quickAdd.click(); }
  if (event.key === "/") { event.preventDefault(); showToast("La búsqueda global llegará en una fase posterior."); }
  if (event.key.toLowerCase() === "t") { location.hash = "today"; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    if (state.undo) {
      event.preventDefault();
      void state.undo.action().then(() => { state.undo = null; showToast("Acción deshecha"); });
    }
  }
});

// Respect the requested no-zoom behavior on touch screens and trackpads.
document.addEventListener("wheel", (event) => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && ["+", "=", "-", "0"].includes(event.key)) event.preventDefault();
});
document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
document.addEventListener("touchmove", (event) => { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", (event) => {
  const now = Date.now();
  if (now - lastTouchEnd < 280 && !event.target.closest("input, textarea, select")) event.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

try {
  await api.health();
  await loadData();
  routeFromHash();
} catch {
  view.replaceChildren();
  const unavailable = document.createElement("div");
  unavailable.className = "placeholder-page";
  const title = document.createElement("h1"); title.textContent = "DayBoard está iniciando";
  const copy = document.createElement("p"); copy.textContent = "Cuando el servidor esté listo, vuelve a intentarlo.";
  const retry = document.createElement("button"); retry.className = "primary-button"; retry.textContent = "Reintentar"; retry.style.marginTop = "16px";
  retry.addEventListener("click", async () => { try { await api.health(); await refresh(); } catch { /* api.js displays the error. */ } });
  unavailable.append(title, copy, retry);
  view.append(unavailable);
}
