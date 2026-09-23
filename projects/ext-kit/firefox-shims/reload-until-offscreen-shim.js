// Firefox-only shim, loaded in the background page *before* sw.js.
// Firefox's MV3 background is an event page with a real DOM (Audio, AudioContext, etc.), so there is no
// offscreen-document API and none is needed: sw.js's playSound() can talk to "offscreen" in this very page.
// This just satisfies the calls sw.js makes so the same sw.js source runs unmodified on both browsers.
if (!chrome.offscreen) {
  chrome.offscreen = {
    hasDocument: async () => true,
    createDocument: async () => {},
    closeDocument: async () => {}
  };
}
