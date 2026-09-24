import { isPro, verifyToken, normalizeToken } from './license.js';
import { CHECKOUT_URL, PRO_PRICE } from './config.js';

const $ = (id) => document.getElementById(id);
for (const el of document.querySelectorAll('.price')) el.textContent = PRO_PRICE;

async function refresh() {
  const pro = await isPro();
  $('plan-status').innerHTML = pro ? '<b class="ok">Pro is active.</b> Thank you for supporting an independent tool.' : 'You are on the <b>Free</b> plan.';
  const hasCheckout = !!CHECKOUT_URL && !pro;
  $('buy-wrap').hidden = !hasCheckout;
  $('soon').hidden = pro || !!CHECKOUT_URL;
}

$('buy').addEventListener('click', () => { if (CHECKOUT_URL) chrome.tabs.create({ url: CHECKOUT_URL }); });

$('save').addEventListener('click', async () => {
  const key = normalizeToken($('license').value);
  if (!(await verifyToken(key))) {
    $('msg').innerHTML = '<span class="error">This license key is not valid.</span>';
    return;
  }
  await chrome.storage.sync.set({ license: key });
  $('msg').innerHTML = '<span class="ok">Saved. Pro unlocked.</span>';
  refresh();
});

$('remove').addEventListener('click', async () => {
  await chrome.storage.sync.remove('license');
  $('license').value = '';
  $('msg').textContent = 'Removed.';
  refresh();
});

chrome.storage.sync.get('license').then(({ license }) => { if (license) $('license').value = license; });
refresh();
