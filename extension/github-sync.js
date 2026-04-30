const CREDS_KEY = "barouse_github_creds";
const CONFIG_FILENAME = ".barouse-cfg.json";

let cachedSha = null;

function apiBase(host) {
  if (!host || host === "github.com") return "https://api.github.com";
  return `https://${host}/api/v3`;
}

async function ghFetch(creds, path, options = {}) {
  const url = apiBase(creds.host) + path;
  const headers = {
    Authorization: `Bearer ${creds.token}`,
    Accept: "application/vnd.github+json",
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
}

export async function getCredentials() {
  const result = await chrome.storage.sync.get(CREDS_KEY);
  return result[CREDS_KEY] || null;
}

export async function saveCredentials({ owner, repo, token, host }) {
  await chrome.storage.sync.set({
    [CREDS_KEY]: { owner, repo, token, host: host || "github.com" },
  });
}

export async function validateToken(creds) {
  const resp = await ghFetch(creds, "/user");
  return resp.ok;
}

export async function fetchConfigFromGitHub() {
  const creds = await getCredentials();
  if (!creds) return null;

  const resp = await ghFetch(
    creds,
    `/repos/${creds.owner}/${creds.repo}/contents/${CONFIG_FILENAME}`
  );

  if (resp.status === 404) {
    cachedSha = null;
    return null;
  }

  if (!resp.ok) {
    throw new Error(`GitHub GET failed: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  cachedSha = data.sha;

  const decoded = atob(data.content.replace(/\n/g, ""));
  return JSON.parse(decoded);
}

export async function pushConfigToGitHub(config) {
  const creds = await getCredentials();
  if (!creds) return false;

  const body = {
    message: "barouse: update config",
    content: btoa(JSON.stringify(config, null, 2)),
  };
  if (cachedSha) {
    body.sha = cachedSha;
  }

  const resp = await ghFetch(
    creds,
    `/repos/${creds.owner}/${creds.repo}/contents/${CONFIG_FILENAME}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (resp.ok) {
    const data = await resp.json();
    cachedSha = data.content.sha;
    return true;
  }

  if (resp.status === 409) {
    // SHA conflict — re-fetch and retry once
    console.warn("barouse: config conflict, re-fetching and retrying...");
    await fetchConfigFromGitHub();

    body.sha = cachedSha;
    const retry = await ghFetch(
      creds,
      `/repos/${creds.owner}/${creds.repo}/contents/${CONFIG_FILENAME}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (retry.ok) {
      const data = await retry.json();
      cachedSha = data.content.sha;
      return true;
    }

    throw new Error(
      "barouse: unresolvable config conflict — remote file was modified by another browser"
    );
  }

  throw new Error(`GitHub PUT failed: ${resp.status} ${resp.statusText}`);
}
