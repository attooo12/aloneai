// Checkout page for the one-time Pro purchase. Empty string => "Pro coming soon" (buy button hidden).
// TODO(parent): set to the Stripe Payment Link for Tab Vault Pro once it exists.
export const CHECKOUT_URL = '';
export const PRO_PRICE = '€5';

export const FREE_SESSION_LIMIT = 10; // named sessions on the Free plan (auto snapshots don't count)

export const DEFAULT_SETTINGS = {
  autoMinutes: 5, // periodic crash-safety snapshot interval
  autoKeep: 20, // rolling auto snapshots kept (protected ones are extra, see PROTECTED_MAX)
  lazy: false, // experimental: discard restored background tabs so they load on click
  backup: 'off', // Pro scheduled backup: 'off' | 'daily' | 'weekly'
  backupLast: 0 // ms timestamp of the last successful scheduled/manual backup
};
export const AUTO_MINUTES_CHOICES = [1, 5, 15, 30];
export const AUTO_KEEP_CHOICES = [10, 20, 50];

// Snapshot guard: if the number of real tabs suddenly falls below half of the previous full snapshot (and that
// snapshot had at least DROP_MIN tabs), the previous snapshot is marked "protected" and is not rotated out.
export const DROP_MIN = 4;
export const DROP_RATIO = 0.5;
export const PROTECTED_MAX = 10;

export const BACKUP_FOLDER = 'Tab Vault backups';
export const BACKUP_PERIOD_MS = { daily: 24 * 3600e3, weekly: 7 * 24 * 3600e3 };
