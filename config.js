const STORAGE_KEY = "barouse_config";

export function getDefaultConfig() {
  return {
    sites: [
      { url: "https://example.com", label: "Example" }
    ]
  };
}

export function validateConfig(config) {
  if (!config || typeof config !== "object") {
    return { valid: false, error: "Config must be an object" };
  }
  if (!Array.isArray(config.sites)) {
    return { valid: false, error: "Config must have a 'sites' array" };
  }
  const seen = new Set();
  for (let i = 0; i < config.sites.length; i++) {
    const site = config.sites[i];
    if (!site || typeof site !== "object") {
      return { valid: false, error: `Site ${i}: must be an object` };
    }
    if (typeof site.url !== "string" || !site.url.match(/^https?:\/\//)) {
      return { valid: false, error: `Site ${i}: url must start with http:// or https://` };
    }
    if (typeof site.label !== "string" || site.label.trim() === "") {
      return { valid: false, error: `Site ${i}: label must be a non-empty string` };
    }
    if (seen.has(site.url)) {
      return { valid: false, error: `Site ${i}: duplicate url "${site.url}"` };
    }
    seen.add(site.url);
  }
  return { valid: true };
}

export async function loadConfig() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    return result[STORAGE_KEY];
  }
  const defaultConfig = getDefaultConfig();
  await chrome.storage.local.set({ [STORAGE_KEY]: defaultConfig });
  return defaultConfig;
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}
