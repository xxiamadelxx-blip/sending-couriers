// Only user actions trigger feedback; system sound/haptic preferences still apply.
let audioContext;
export function feedback(kind, settings, native = window.CourierNative) {
  const sound = settings?.soundEnabled !== false, haptic = settings?.hapticsEnabled !== false;
  if (native?.feedback) { native.feedback(kind, sound, haptic); return; }
  if (haptic) { try { navigator.vibrate?.(kind === 'error' ? [18, 35, 18] : kind === 'success' ? 22 : 8); } catch { } }
  if (!sound) return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioContext ??= new Context();
    audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.frequency.value = kind === 'success' ? 720 : kind === 'error' ? 220 : 480;
    gain.gain.setValueAtTime(0.035, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(now); oscillator.stop(now + 0.05);
  } catch { }
}
