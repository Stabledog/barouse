import { getCredentials, saveCredentials, validateToken } from "./github-sync.js";

const form = document.getElementById("creds-form");
const ownerEl = document.getElementById("owner");
const repoEl = document.getElementById("repo");
const tokenEl = document.getElementById("token");
const statusEl = document.getElementById("status");

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = ok ? "ok" : "err";
}

async function init() {
  const creds = await getCredentials();
  if (creds) {
    ownerEl.value = creds.owner || "";
    repoEl.value = creds.repo || "";
    tokenEl.value = creds.token || "";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const owner = ownerEl.value.trim();
  const repo = repoEl.value.trim();
  const token = tokenEl.value.trim();

  if (!owner || !repo || !token) {
    showStatus("All fields are required.", false);
    return;
  }

  showStatus("Validating token...", true);

  try {
    const valid = await validateToken({ owner, repo, token });
    if (!valid) {
      showStatus("Invalid token — got 401 from GitHub.", false);
      return;
    }
  } catch (err) {
    showStatus("Could not reach GitHub — credentials saved anyway.", false);
    await saveCredentials({ owner, repo, token });
    return;
  }

  await saveCredentials({ owner, repo, token });
  showStatus("Saved.", true);
});

init();
