/** A Web Audio context, or `null` where the browser has none (or refuses to make one). */
export function makeAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor)
    return null;
  try {
    return new Ctor();
  }
  catch {
    return null;
  }
}
