export function enableCardDrag(container, onDrop) {
  let pending = null;
  let drag = null;
  let holdTimer = null;

  const clearPending = () => { clearTimeout(holdTimer); pending = null; };
  const finish = async (event) => {
    clearTimeout(holdTimer);
    if (!drag) { pending = null; return; }
    event.preventDefault();
    const active = drag;
    drag = null;
    active.ghost.remove();
    active.card.classList.remove("is-dragging");
    container.querySelectorAll(".drop-target").forEach((node) => node.classList.remove("drop-target"));
    const destination = document.elementFromPoint(event.clientX, event.clientY)?.closest(".board-lane");
    if (destination?.dataset.listId) {
      const targetCard = document.elementFromPoint(event.clientX, event.clientY)?.closest(".board-card");
      const cards = [...destination.querySelectorAll(".board-card")].filter((card) => card.dataset.cardId !== active.cardId);
      let position = cards.length;
      if (targetCard) {
        const rect = targetCard.getBoundingClientRect();
        position = cards.indexOf(targetCard) + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
      }
      await onDrop(active.cardId, destination.dataset.listId, Math.max(0, position));
    }
    pending = null;
  };

  container.querySelectorAll(".drag-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const card = handle.closest(".board-card");
      if (!card) return;
      pending = { event, card, cardId: card.dataset.cardId, startX: event.clientX, startY: event.clientY, touch: event.pointerType === "touch" };
      if (pending.touch) holdTimer = setTimeout(() => startDrag(pending?.event), 230);
    });
  });

  const startDrag = (event) => {
    if (!pending || drag) return;
    const card = pending.card;
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = card.querySelector(".board-card-title")?.textContent || "Tarjeta";
    document.body.append(ghost);
    card.classList.add("is-dragging");
    drag = { card, cardId: pending.cardId, ghost };
    moveGhost(event);
  };

  const moveGhost = (event) => {
    if (!drag) return;
    event.preventDefault();
    drag.ghost.style.left = `${event.clientX + 12}px`;
    drag.ghost.style.top = `${event.clientY + 12}px`;
    const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest(".board-lane");
    container.querySelectorAll(".drop-target").forEach((node) => node.classList.remove("drop-target"));
    lane?.classList.add("drop-target");
  };

  const onMove = (event) => {
    if (!pending) return;
    if (!drag && !pending.touch && Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > 8) startDrag(event);
    if (drag) moveGhost(event);
  };
  const onUp = (event) => { if (drag) void finish(event); else clearPending(); };
  document.addEventListener("pointermove", onMove, { passive: false });
  document.addEventListener("pointerup", onUp, { passive: false });
  document.addEventListener("pointercancel", onUp, { passive: false });

  return () => {
    clearPending();
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
  };
}
