// Plays a short synthesized alert (three beeps) with WebAudio. No audio files, no network.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'beep') return;
  beep().finally(() => chrome.runtime.sendMessage({ type: 'beepDone' }).catch(() => {}));
});

async function beep() {
  const ctx = new AudioContext();
  const t0 = ctx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = i === 2 ? 1320 : 880;
    const t = t0 + i * 0.28;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  }
  await new Promise((r) => setTimeout(r, 1100));
  await ctx.close();
}
