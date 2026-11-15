// HELIX BREACH — every sound is synthesized with WebAudio: no audio files, no
// network. Gunshots are filtered noise bursts shaped per weapon, the rest are
// short oscillators and clicks. Created lazily on the first user gesture, so the
// page never fights the browser's autoplay rules.
export function createAudio(settings) {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = settings.muted ? 0 : settings.volume;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(dur, filterFreq, type, gain, when = 0) {
    if (!ensure() || ctx.state === 'suspended') return; // no gesture yet: stay silent
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.2, dur + 0.05);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, type, gain, slideTo = null, when = 0) {
    if (!ensure() || ctx.state === 'suspended') return; // no gesture yet: stay silent
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const SHOTS = {
    pistol: () => { noise(0.09, 1800, 'lowpass', 0.5); noise(0.05, 4000, 'highpass', 0.25); },
    rifle: () => { noise(0.11, 1200, 'lowpass', 0.6); noise(0.06, 3200, 'highpass', 0.3); tone(160, 0.08, 'sine', 0.4, 60); },
    smg: () => { noise(0.08, 2200, 'lowpass', 0.45); noise(0.04, 5000, 'highpass', 0.2); },
    sniper: () => { noise(0.22, 900, 'lowpass', 0.85); noise(0.1, 2500, 'highpass', 0.35); tone(110, 0.18, 'sine', 0.55, 45); },
    shotgun: () => { noise(0.2, 700, 'lowpass', 0.9); noise(0.08, 2000, 'highpass', 0.3); tone(90, 0.15, 'sine', 0.6, 40); },
  };

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { settings.muted = m; if (master) master.gain.value = m ? 0 : settings.volume; },
    setVolume(v) { settings.volume = v; if (master && !settings.muted) master.gain.value = v; },
    shot(kind, dist = 0, isPlayer = true) {
      if (!ensure()) return;
      const att = isPlayer ? 1 : Math.max(0.08, 1 - dist / 70);
      const fn = SHOTS[kind] || SHOTS.rifle;
      // Re-run the shot with attenuation by scaling the master briefly is not
      // possible per-sound, so distant shots use a quieter, duller variant.
      if (att < 1) {
        noise(0.09, 900, 'lowpass', 0.35 * att);
      } else fn();
    },
    dryFire() { tone(1400, 0.04, 'square', 0.12); },
    reload() { tone(900, 0.05, 'square', 0.1); tone(600, 0.05, 'square', 0.1, null, 0.35); tone(1100, 0.05, 'square', 0.12, null, 0.7); },
    hitmarker(kill) { tone(kill ? 1560 : 1180, 0.06, 'sine', 0.22); if (kill) tone(1980, 0.09, 'sine', 0.2, null, 0.06); },
    hitTaken() { noise(0.12, 500, 'lowpass', 0.5); tone(120, 0.12, 'sine', 0.4, 70); },
    explosion(dist = 0) {
      const att = Math.max(0.15, 1 - dist / 90);
      noise(0.9, 300, 'lowpass', 0.9 * att);
      tone(55, 0.8, 'sine', 0.7 * att, 28);
    },
    beep(final = false) { tone(final ? 1320 : 880, final ? 0.3 : 0.09, 'sine', 0.25); },
    defuseTick() { tone(1040, 0.05, 'sine', 0.16); },
    footstep(run) { noise(0.05, 500, 'lowpass', run ? 0.1 : 0.05); },
    roundWin() { tone(523, 0.14, 'triangle', 0.25); tone(659, 0.14, 'triangle', 0.25, null, 0.14); tone(784, 0.28, 'triangle', 0.3, null, 0.28); },
    roundLose() { tone(392, 0.18, 'triangle', 0.22); tone(311, 0.3, 'triangle', 0.25, null, 0.18); },
    click() { tone(800, 0.04, 'square', 0.1); },
    buy() { tone(660, 0.07, 'sine', 0.2); tone(990, 0.1, 'sine', 0.2, null, 0.07); },
    denied() { tone(220, 0.12, 'square', 0.15); },
  };
}
