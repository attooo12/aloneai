// Firefox-only shim, loaded in the background alongside sw.js.
// Firefox has no EyeDropper API (see eyedropper-polyfill.js). The polyfill's fallback samples a screenshot of
// the tab instead, which only the background context can take (chrome.tabs.captureVisibleTab). This just
// answers that one request; sw.js itself is unmodified.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== '__aloneaiCapture') return false;
  // sender.tab is only set for a real content script on a real tab (the popup's "picker window" has no tab
  // of its own to capture): the polyfill treats a null reply as "this mode isn't available here".
  if (!sender.tab) { sendResponse(null); return false; }
  chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }).then(sendResponse, () => sendResponse(null));
  return true;
});
