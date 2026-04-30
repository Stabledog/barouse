import { validateConfig } from "./config.js";

const editorEl = document.getElementById("settings-editor");
const textareaEl = document.getElementById("settings-textarea");
const saveBtn = document.getElementById("settings-save");
const cancelBtn = document.getElementById("settings-cancel");
const errorEl = document.getElementById("settings-error");

let onSaveCallback = null;
let onCancelCallback = null;

saveBtn.addEventListener("click", () => {
  errorEl.classList.add("hidden");

  let parsed;
  try {
    parsed = JSON.parse(textareaEl.value);
  } catch (e) {
    errorEl.textContent = `Invalid JSON: ${e.message}`;
    errorEl.classList.remove("hidden");
    return;
  }

  const result = validateConfig(parsed);
  if (!result.valid) {
    errorEl.textContent = result.error;
    errorEl.classList.remove("hidden");
    return;
  }

  if (onSaveCallback) onSaveCallback(parsed);
});

cancelBtn.addEventListener("click", () => {
  if (onCancelCallback) onCancelCallback();
});

export function openSettingsEditor(currentConfig, onSave, onCancel) {
  textareaEl.value = JSON.stringify(currentConfig, null, 2);
  errorEl.classList.add("hidden");
  onSaveCallback = onSave;
  onCancelCallback = onCancel;
}

export function closeSettingsEditor() {
  onSaveCallback = null;
  onCancelCallback = null;
}
