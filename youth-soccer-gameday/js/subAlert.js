// Vibration + an audible two-tone chime for "a substitution is due". Both
// are feature-detected and fail silently where unsupported — iOS Safari in
// particular has no Vibration API at all, and both APIs can be blocked
// inside a sandboxed iframe (this app's Claude Artifact deployment), so
// there's no dependency on either actually working; the on-screen fair-play
// banner (liveGame.js) is always there as the fallback.
//
// Most mobile browsers only allow audio to start from inside a real user
// gesture, so the AudioContext is created lazily on the coach's first tap
// anywhere in the app — by the time a sub is actually due, it's long since
// unlocked and ready for a script-triggered chime.
let audioCtx = null;

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioCtx = new Ctx();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

document.addEventListener('click', () => {
  const ctx = ensureAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}, { once: true });

function beep(ctx, frequency, startAt) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + 0.35);
}

export function playSubDueAlert() {
  if (navigator.vibrate) {
    try {
      navigator.vibrate([180, 90, 180]);
    } catch {
      // Ignore — vibration is a nice-to-have, not load-bearing.
    }
  }

  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  beep(ctx, 880, now);
  beep(ctx, 1046.5, now + 0.28);
}
