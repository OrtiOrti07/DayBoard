const overlayRoot = document.querySelector("#overlay-root");

export function openSheet({ title, description = "", fields = [], submitLabel = "Guardar", cancelLabel = "Cancelar" }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "sheet-backdrop";
    const sheet = document.createElement("section");
    sheet.className = "bottom-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "sheet-title");

    const handle = document.createElement("div");
    handle.className = "sheet-handle";
    const heading = document.createElement("h2");
    heading.className = "sheet-heading";
    heading.id = "sheet-title";
    heading.textContent = title;
    sheet.append(handle, heading);
    if (description) {
      const copy = document.createElement("p");
      copy.className = "sheet-description";
      copy.textContent = description;
      sheet.append(copy);
    }

    const form = document.createElement("form");
    const controls = new Map();
    for (const field of fields) {
      const wrap = document.createElement("div");
      wrap.className = "sheet-field";
      const label = document.createElement("label");
      label.textContent = field.label;
      label.htmlFor = `sheet-${field.name}`;
      const control = field.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
      if (field.type !== "textarea") control.type = field.type || "text";
      control.id = `sheet-${field.name}`;
      control.name = field.name;
      control.placeholder = field.placeholder || "";
      control.value = field.value ?? "";
      control.required = Boolean(field.required);
      if (field.maxLength) control.maxLength = field.maxLength;
      if (field.type === "date") control.autocomplete = "off";
      controls.set(field.name, control);
      wrap.append(label, control);
      form.append(wrap);
    }

    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "pill-button";
    cancel.textContent = cancelLabel;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "primary-button";
    submit.textContent = submitLabel;
    actions.append(cancel, submit);
    form.append(actions);
    sheet.append(form);
    backdrop.append(sheet);
    overlayRoot.append(backdrop);

    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown);
      backdrop.remove();
      resolve(result);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close(null);
      if (event.key === "Tab") {
        const focusable = [...sheet.querySelectorAll("input, textarea, button")];
        if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault(); focusable.at(-1).focus();
        } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
          event.preventDefault(); focusable[0].focus();
        }
      }
    };
    cancel.addEventListener("click", () => close(null));
    backdrop.addEventListener("pointerdown", (event) => { if (event.target === backdrop) close(null); });
    document.addEventListener("keydown", onKeyDown);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = Object.fromEntries([...controls].map(([name, control]) => [name, control.value.trim()]));
      close(values);
    });
    requestAnimationFrame(() => (controls.values().next().value || submit).focus());
  });
}
