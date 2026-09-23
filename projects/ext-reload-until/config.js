// Checkout page for the one-time Pro purchase. Empty string => "Pro coming soon" (button hidden).
export const CHECKOUT_URL = '';
export const MIN_INTERVAL_SEC = 3;
export const ALARM_MIN_SEC = 30; // chrome.alarms minimum for packed extensions
export const DEFAULTS = {
  intervalSec: 30,
  jitterPct: 0,
  mode: 'none', // 'none' | 'appears' | 'disappears'
  text: '',
  regex: false,
  selector: '',
  notify: true,
  sound: true,
  focus: false
};
