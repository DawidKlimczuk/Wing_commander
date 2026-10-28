// Dźwięk syntetyzowany w WebAudio - piski PC-speakera i "Sound Blaster" FM w jednym.
class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ambient = null;
    try { this.muted = localStorage.getItem("gemini.muted") === "1"; } catch { /* brak storage */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem("gemini.muted", this.muted ? "1" : "0"); } catch { /* brak storage */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  tone(freq, dur, { type = "square", vol = 0.12, at = 0, slide = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.2, at = 0, from = 2000, to = 200, q = 1 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  hover() { this.tone(1760, 0.03, { vol: 0.04 }); }
  click() { this.tone(880, 0.04, { vol: 0.08 }); this.tone(1320, 0.05, { vol: 0.06, at: 0.035 }); }
  type() { this.tone(2400 + Math.random() * 400, 0.012, { vol: 0.025 }); }
  beep() { this.tone(1000, 0.12, { type: "square", vol: 0.06 }); }

  buy() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, { at: i * 0.07, vol: 0.09 }));
    this.tone(2093, 0.4, { at: 0.36, type: "triangle", vol: 0.1 });
    this.noise(0.15, { at: 0.34, vol: 0.08, from: 8000, to: 3000 });
  }

  error() {
    this.tone(220, 0.18, { type: "sawtooth", vol: 0.08 });
    this.tone(165, 0.3, { type: "sawtooth", vol: 0.08, at: 0.16 });
  }

  door() { this.noise(0.45, { vol: 0.14, from: 1200, to: 120, q: 4 }); this.tone(90, 0.4, { type: "triangle", vol: 0.1, slide: -40 }); }

  launch() {
    this.noise(3.2, { vol: 0.35, from: 300, to: 3000, q: 2 });
    this.tone(55, 2.8, { type: "sawtooth", vol: 0.12, slide: 180, attack: 0.6 });
    this.noise(1.6, { at: 3.0, vol: 0.25, from: 6000, to: 200 });
  }

  land() { this.noise(1.2, { vol: 0.2, from: 2000, to: 100, q: 3 }); this.tone(110, 1, { type: "triangle", vol: 0.1, slide: -60 }); }

  // ambient: niski szum bazy + spokojne, oryginalne arpeggio FM-podobne
  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const ctx = this.ctx, out = ctx.createGain();
    out.gain.value = 0.0;
    out.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
    out.connect(this.master);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 380;
    lp.connect(out);
    const drones = [55, 55.4, 82.4].map(fq => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = fq; g.gain.value = 0.05;
      o.connect(g).connect(lp); o.start();
      return o;
    });
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07; lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(lp.frequency); lfo.start();

    // A-moll, F, C, G - po 8 kroków
    const chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]];
    const pattern = [0, 2, 1, 3, 2, 1, 0, 2];
    const midi = n => 440 * Math.pow(2, (n - 69) / 12);
    let step = 0, next = ctx.currentTime + 0.5;
    const tick = () => {
      while (next < ctx.currentTime + 0.3) {
        const chord = chords[Math.floor(step / 8) % chords.length];
        const n = chord[pattern[step % 8]] + 12;
        const o = ctx.createOscillator(), g = ctx.createGain(), m = ctx.createOscillator(), mg = ctx.createGain();
        o.type = "sine"; o.frequency.value = midi(n);
        m.frequency.value = midi(n) * 2; mg.gain.value = midi(n) * 0.8;   // modulacja FM
        m.connect(mg).connect(o.frequency);
        g.gain.setValueAtTime(0, next);
        g.gain.linearRampToValueAtTime(0.03, next + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, next + 0.5);
        o.connect(g).connect(out);
        o.start(next); m.start(next); o.stop(next + 0.55); m.stop(next + 0.55);
        if (step % 8 === 0) {
          const b = ctx.createOscillator(), bg = ctx.createGain();
          b.type = "triangle"; b.frequency.value = midi(chord[0] - 12);
          bg.gain.setValueAtTime(0.06, next); bg.gain.exponentialRampToValueAtTime(0.0001, next + 2.2);
          b.connect(bg).connect(out); b.start(next); b.stop(next + 2.3);
        }
        next += 0.28;
        step++;
      }
    };
    const timer = setInterval(tick, 100);
    this.ambient = { out, drones, lfo, timer };
  }

  stopAmbient() {
    if (!this.ambient) return;
    const { out, drones, lfo, timer } = this.ambient;
    clearInterval(timer);
    out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    setTimeout(() => { drones.forEach(d => d.stop()); lfo.stop(); out.disconnect(); }, 1500);
    this.ambient = null;
  }
}

export const sound = new Sound();
