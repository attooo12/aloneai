// Checkout page for the one-time Pro purchase. Empty string => "Pro coming soon" (button hidden).
export const CHECKOUT_URL = 'https://buy.stripe.com/aFabJ1byddJtb240cifIs00';
export const MIN_INTERVAL_SEC = 3;
export const MAX_INTERVAL_SEC = 7 * 24 * 3600; // page timers (setTimeout) overflow past ~24.8 days and fire at once
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
