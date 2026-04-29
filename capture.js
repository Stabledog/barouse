export async function captureTab(targetIframe) {
  if (!targetIframe) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  targetIframe.contentWindow.postMessage({
    type: "barouse:tab-capture",
    payload: {
      url: tab.url,
      title: tab.title
    }
  }, "*");
}
