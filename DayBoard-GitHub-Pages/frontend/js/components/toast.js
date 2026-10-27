const root = document.querySelector("#toast-root");
let currentTimer;

export function showToast(message, options = {}) {
  const { actionLabel, onAction, isError = false, duration = 4200 } = options;
  root.replaceChildren();
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(text);
  if (actionLabel && onAction) {
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = actionLabel;
    action.addEventListener("click", async () => {
      clearTimeout(currentTimer);
      root.replaceChildren();
      await onAction();
    });
    toast.append(action);
  }
  root.append(toast);
  clearTimeout(currentTimer);
  if (duration > 0) currentTimer = setTimeout(() => toast.remove(), duration);
}
