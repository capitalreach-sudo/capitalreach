/**
 * The notification ping: two short sine notes (E6 then a soft A6), synthesised
 * with WebAudio at the moment of use. No audio asset to load, nothing on the
 * network, and the whole thing is quieter and shorter than any stock "ding" —
 * this platform's register is a ledger, not a slot machine.
 *
 * Browsers block audio until the user has interacted with the page; play()
 * failing for that reason is silently fine — the pulse animation still shows.
 * The preference is per-browser (localStorage), default ON.
 */
const PREF_KEY = "cr_notif_sound";

export function soundEnabled(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== "off"; } catch { return true; }
}

export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch { /* private mode */ }
}

let ctx: AudioContext | null = null;

export function playPing(): void {
  if (!soundEnabled()) return;
  try {
    type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") { void ctx.resume().catch(() => {}); }
    const now = ctx.currentTime;
    for (const [freq, at, dur, peak] of [[1318.5, 0, 0.09, 0.04], [1760, 0.09, 0.14, 0.03]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(peak, now + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + dur + 0.02);
    }
  } catch { /* audio unavailable — the visual pulse still happens */ }
}
