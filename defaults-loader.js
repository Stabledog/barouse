const PBKDF2_ITERATIONS = 100000;

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function decryptToken(encrypted, password) {
  const salt = b64ToBytes(encrypted.salt);
  const iv = b64ToBytes(encrypted.iv);
  const ciphertext = b64ToBytes(encrypted.ciphertext);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const plainBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plainBytes);
}

function showPasswordDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999";

    const box = document.createElement("div");
    box.style.cssText =
      "background:#1e1e2e;color:#cdd6f4;padding:24px;border-radius:8px;font-family:system-ui;min-width:300px";

    box.innerHTML = `
      <h3 style="margin:0 0 12px">Podifill Setup</h3>
      <p style="margin:0 0 12px;font-size:14px;color:#a6adc8">Enter password to unlock configuration</p>
      <input type="password" id="podifill-pw" style="width:100%;padding:8px;border:1px solid #45475a;background:#313244;color:#cdd6f4;border-radius:4px;box-sizing:border-box;font-size:14px" autofocus>
      <p id="podifill-err" style="color:#f38ba8;font-size:13px;margin:8px 0 0;display:none"></p>
      <div style="margin-top:16px;text-align:right">
        <button id="podifill-skip" style="padding:6px 16px;margin-right:8px;background:none;border:1px solid #45475a;color:#a6adc8;border-radius:4px;cursor:pointer">Skip</button>
        <button id="podifill-ok" style="padding:6px 16px;background:#89b4fa;border:none;color:#1e1e2e;border-radius:4px;cursor:pointer;font-weight:600">Unlock</button>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.appendChild(box);

    const pwInput = box.querySelector("#podifill-pw");
    const errEl = box.querySelector("#podifill-err");

    function submit() {
      const pw = pwInput.value;
      if (!pw) {
        errEl.textContent = "Password required";
        errEl.style.display = "block";
        return;
      }
      overlay.remove();
      resolve(pw);
    }

    box.querySelector("#podifill-ok").addEventListener("click", submit);
    pwInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    box.querySelector("#podifill-skip").addEventListener("click", () => {
      overlay.remove();
      resolve(null);
    });
  });
}

async function loadDefaults() {
  try {
    const url = chrome.runtime.getURL("defaults.json");
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function applyDefaults() {
  const data = await loadDefaults();
  if (!data || !data.encrypted_token) return false;

  const password = await showPasswordDialog();
  if (!password) return false;

  let token;
  try {
    token = await decryptToken(data.encrypted_token, password);
  } catch {
    console.error("podifill: decryption failed (wrong password?)");
    return false;
  }

  await chrome.storage.sync.set({
    barouse_github_creds: {
      host: data.host || "github.com",
      owner: data.owner || "",
      repo: data.repo || "",
      token,
    },
  });

  return true;
}
