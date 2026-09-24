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

// A page never receives its own runtime.sendMessage, and here sw.js and offscreen.js share the background page.
// So the beep request (sw.js → offscreen.js) and its beepDone reply are delivered to this page's own listeners.
{
  const localListeners = [];
  const addListener = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
  chrome.runtime.onMessage.addListener = (fn) => { localListeners.push(fn); addListener(fn); };
  const send = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = (msg, ...rest) => {
    if (msg?.target !== 'offscreen' && msg?.type !== 'beepDone') return send(msg, ...rest);
    const sender = { id: chrome.runtime.id, url: location.href };
    setTimeout(() => { for (const fn of localListeners) fn(msg, sender, () => {}); });
    return Promise.resolve();
  };
}
