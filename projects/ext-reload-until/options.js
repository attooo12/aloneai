import { isPro, verifyToken } from './license.js';
import { CHECKOUT_URL } from './config.js';

const $ = (id) => document.getElementById(id);

async function refresh() {
  const pro = await isPro();
  $('plan-status').innerHTML = pro ? '<b class="ok">Pro is active.</b> Thank you for supporting an independent tool.' : 'You are on the <b>Free</b> plan.';
  const hasCheckout = !!CHECKOUT_URL && !pro;
  $('buy-wrap').hidden = !hasCheckout;
  $('soon').hidden = pro || !!CHECKOUT_URL;
}

$('buy').addEventListener('click', () => { if (CHECKOUT_URL) chrome.tabs.create({ url: CHECKOUT_URL }); });

$('save').addEventListener('click', async () => {
  const key = $('license').value.trim();
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
