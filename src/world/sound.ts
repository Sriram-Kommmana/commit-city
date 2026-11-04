// Sound effects, synthesised live with no audio files. On by default: browsers only allow audio after the visitor
// first clicks, taps or presses a key, so it starts then. The button turns it off.
// There is no background music or wind: a siren, the commit line's zip and hits react to the journey.

export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let sirenGain: GainNode;
  let sirenOsc: OscillatorNode;
  let noise: AudioBuffer;
  let on = true;

  const kick = (t: number) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.3);
  };

  const burst = (t: number, length: number, level: number, type: BiquadFilterType, cutoff: number) => {
    const s = ctx!.createBufferSource();
    s.buffer = noise;
    const f = ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + length + 0.02);
  };

  const start = () => {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    const size = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

    // A two-tone siren for the chase, quiet and off-key enough to stay out of the way.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 660;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(lp).connect(sirenGain).connect(master);
    sirenOsc.start();

  };

  const wake = () => {
    if (!on) return;
    if (!ctx) start();
    // Safari can create the context suspended even inside a click, so resume it either way.
    if (ctx!.state === 'suspended') ctx!.resume();
  };

  return {
    get on() {
      return on;
    },
    /** Starts the sound if it's on. Call from a click, tap or key press, the only times a browser allows it. */
    wake,
    set(value: boolean) {
      on = value;
      if (on) wake();
      else ctx?.suspend();
      return on;
    },
    toggle() {
      return this.set(!on);
    },
    /** Called as the journey moves, with its position. */
    update(p: number) {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      const chase = p > 0.57 && p < 0.77;
      sirenGain.gain.setTargetAtTime(chase ? 0.035 : 0, t, 0.2);
      if (chase) sirenOsc.frequency.setValueAtTime(Math.floor(t * 2.4) % 2 ? 660 : 880, t);
    },
    /** The commit line firing: a quick rising zip. */
    zip() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(320, t);
      o.frequency.exponentialRampToValueAtTime(1800, t + 0.12);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.2);
      burst(t, 0.12, 0.25, 'highpass', 3000);
    },
    /** A hit for cuts and impacts. */
    hit() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      burst(t, 0.3, 0.6, 'lowpass', 900);
      kick(t);
    },
    stop() {
      ctx?.close();
    },
  };
}
