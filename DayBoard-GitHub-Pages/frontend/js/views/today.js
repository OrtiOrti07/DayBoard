import { api } from "../api.js";
import { openSheet } from "../components/bottom-sheet.js";
import { showToast } from "../components/toast.js";
import { setUndo, state } from "../store.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function dateLabel(value, options = { weekday: "long", day: "numeric", month: "long" }) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", options).format(new Date(year, month - 1, day));
}

function createCheck(isDone, title) {
  const check = el("button", `task-check${isDone ? " is-done" : ""}`);
  check.type = "button";
  check.setAttribute("aria-label", `${isDone ? "Marcar pendiente" : "Completar"}: ${title}`);
  check.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 4 4 8-9"></path></svg>';
  return check;
}

function taskRow(card, { overdue = false, onChange }) {
  const row = el("article", `task-row${card.is_done ? " is-complete" : ""}`);
  const check = createCheck(Boolean(card.is_done), card.title);
  check.addEventListener("click", async () => {
    const wasOpen = !card.is_done;
    try {
      await api.updateCard(card.id, { is_done: wasOpen });
      await onChange();
      if (wasOpen && state.today?.summary.total > 0 && state.today.summary.completed === state.today.summary.total) {
        confetti();
        showToast("¡Has completado todo lo de hoy! ✨");
      }
    } catch { /* api.js presents the error. */ }
  });
  const copy = el("div", "task-copy");
  copy.append(el("div", "task-title", card.title));
  const meta = el("div", "task-meta");
  if (card.board_title) meta.append(el("span", "meta-chip", `${card.board_emoji || "✳️"} ${card.board_title}`));
  if (overdue && card.due_date) meta.append(el("span", "meta-chip overdue", `Venció ${dateLabel(card.due_date, { day: "numeric", month: "short" })}`));
  else if (card.list_title) meta.append(el("span", "meta-chip", card.list_title));
  copy.append(meta);
  row.append(check, copy);

  if (overdue) {
    const actions = el("div", "overdue-actions");
    const moves = [
      ["Hoy", localDateString()],
      ["Mañana", localDateString(new Date(Date.now() + 86400000))],
      ["+1 sem.", localDateString(new Date(Date.now() + 7 * 86400000))],
    ];
    for (const [label, date] of moves) {
      const button = el("button", "", label);
      button.type = "button";
      button.setAttribute("aria-label", `Reprogramar ${card.title} para ${label.toLowerCase()}`);
      button.addEventListener("click", async () => {
        try { await api.updateCard(card.id, { due_date: date }); await onChange(); showToast(`Tarea reprogramada: ${label.toLowerCase()}`); }
        catch { /* api.js presents the error. */ }
      });
      actions.append(button);
    }
    copy.append(actions);
  }
  return row;
}

function confetti() {
  const colors = ["#7165ef", "#f5ab75", "#66bb93", "#f1798a", "#f2d25c"];
  for (let index = 0; index < 28; index += 1) {
    const piece = el("i", "confetti-piece");
    piece.style.left = `${34 + Math.random() * 32}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--x", `${Math.round((Math.random() - .5) * 310)}px`);
    piece.style.setProperty("--y", `${Math.round(120 + Math.random() * 280)}px`);
    piece.style.setProperty("--r", `${Math.round((Math.random() - .5) * 900)}deg`);
    document.body.append(piece);
    setTimeout(() => piece.remove(), 1000);
  }
}

export async function createTodayTask(onChange) {
  const values = await openSheet({
    title: "Una cosa a la vez",
    description: "Anota una tarea y la guardaremos para hoy.",
    fields: [
      { name: "title", label: "¿Qué quieres hacer?", placeholder: "Ej. Preparar la presentación", required: true, maxLength: 160 },
    ],
    submitLabel: "Añadir a Hoy",
  });
  if (!values) return;
  await api.createCard({ title: values.title, due_date: localDateString() });
  await onChange();
  showToast("Añadida a tu día");
}

export function renderToday({ onChange }) {
  const feed = state.today || { date: localDateString(), today: [], overdue: [], summary: { total: 0, completed: 0, overdue: 0 } };
  const page = el("section", "today-view");
  const date = el("div", "date-line");
  date.append(el("span", "date-spark", "✳"), el("span", "", dateLabel(feed.date)));
  page.append(date);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const done = feed.summary.completed;
  const total = feed.summary.total;
  const percentage = total ? Math.round((done / total) * 100) : 0;
  const hero = el("header", "hero");
  hero.append(el("div", "hero-kicker", "tu espacio, tu ritmo"));
  hero.append(el("h1", "", `${greeting} ☀️`));
  hero.append(el("p", "", total ? (done === total ? "Todo listo. Haz una pausa y disfruta." : "Un paso pequeño también cuenta.") : "Un día nuevo empieza con una buena intención."));
  hero.append(el("span", "hero-spark", "✦"));
  page.append(hero);

  const summary = el("div", "summary-grid");
  const cards = [
    [String(Math.max(0, total - done)), "Por hacer"],
    [String(done), "Completadas"],
    [String(feed.summary.overdue), "Atrasadas"],
  ];
  for (const [number, label] of cards) {
    const item = el("div", "summary-card");
    const numberRow = el("div", "summary-number");
    numberRow.append(el("span", "summary-dot"), el("span", "", number));
    item.append(numberRow, el("div", "summary-label", label));
    summary.append(item);
  }
  page.append(summary);

  const progress = el("div", "progress-card");
  const progressHead = el("div", "progress-head");
  progressHead.append(el("span", "", "Tu día va así"), el("span", "", `${percentage}%`));
  const track = el("div", "progress-track");
  const fill = el("div", "progress-fill");
  fill.style.width = `${percentage}%`;
  track.append(fill);
  progress.append(progressHead, track);
  page.append(progress);

  const section = el("section", "tasks-section");
  const heading = el("div", "section-row");
  heading.append(el("h2", "section-title", "Lo de hoy"), el("span", "count-badge", String(total)));
  section.append(heading);
  if (feed.today.length) {
    const list = el("div", "task-list");
    for (const card of feed.today) list.append(taskRow(card, { onChange }));
    section.append(list);
  } else {
    const empty = el("div", "task-list empty-state");
    empty.append(el("div", "empty-icon", "☀"), el("h3", "", "Espacio para lo importante"), el("p", "", "Añade una tarea y empieza a despejar el día."));
    const add = el("button", "pill-button", "+ Añadir tarea");
    add.type = "button";
    add.addEventListener("click", () => createTodayTask(onChange));
    empty.append(add);
    section.append(empty);
  }
  page.append(section);

  if (feed.overdue.length) {
    const overdue = el("section", "tasks-section overdue-section");
    const overdueHeading = el("div", "section-row");
    overdueHeading.append(el("h2", "section-title", "Cuando puedas"), el("span", "count-badge", String(feed.overdue.length)));
    overdue.append(overdueHeading);
    const list = el("div", "task-list");
    for (const card of feed.overdue) list.append(taskRow(card, { overdue: true, onChange }));
    overdue.append(list);
    page.append(overdue);
  }

  const quotes = ["Ve a tu ritmo. Lo importante es seguir avanzando.", "Un poco de claridad cambia todo el día.", "Haz sitio para lo que de verdad importa.", "Hoy también cuenta, aunque vayas despacio."];
  page.append(el("p", "quote", `“${quotes[new Date().getDate() % quotes.length]}”`));
  return page;
}
