export async function syncDnrRules(sites) {
  // Get existing dynamic rules to remove
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);

  // Strip X-Frame-Options and CSP from ALL sub_frame responses.
  // Scoping to only configured domains breaks redirect chains (e.g. SSO),
  // where an intermediate domain sends frame-ancestors that blocks the iframe.
  const addRules = [{
    id: 1,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "X-Frame-Options", operation: "remove" },
        { header: "Content-Security-Policy", operation: "remove" }
      ]
    },
    condition: {
      resourceTypes: ["sub_frame"]
    }
  }];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}
