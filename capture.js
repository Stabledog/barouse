const ACK_TIMEOUT_MS = 500;

export async function captureTab(targetIframe) {
  if (!targetIframe) return { handled: false };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { handled: false };

  const payload = { url: tab.url, title: tab.title };

  return new Promise((resolve) => {
    function onMessage(event) {
      if (event.data?.type === "barouse:tab-capture-ack") {
        cleanup();
        resolve({ handled: true });
      }
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve({ handled: false, tab: payload });
    }, ACK_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);

    targetIframe.contentWindow.postMessage({
      type: "barouse:tab-capture",
      payload
    }, "*");
  });
}
