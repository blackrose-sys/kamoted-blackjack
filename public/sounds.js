/* ═══════════════════════════════════════════════════════════════════
   SOUNDS — Procedural Audio via Web Audio API
   All sounds generated at runtime, no audio files needed
   ═══════════════════════════════════════════════════════════════════ */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.3;
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._initialized = true;
    } catch (e) {
      console.warn('Web Audio API not available');
      this.enabled = false;
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  _gain(value = this.volume) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(this.ctx.destination);
    return g;
  }

  // Card deal — short percussive snap
  cardDeal() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.04;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.8;

    const gain = this._gain(this.volume * 0.6);
    source.connect(filter);
    filter.connect(gain);
    source.start(now);
  }

  // Card flip — slightly longer with tonal element
  cardFlip() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.06;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 6) * 0.5
        + Math.sin(t * 4000 * Math.PI * 2) * Math.pow(1 - i / bufferSize, 10) * 0.3;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    const gain = this._gain(this.volume * 0.4);
    source.connect(filter);
    filter.connect(gain);
    source.start(now);
  }

  // Chip clink — metallic ping
  chipClink() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2800, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.1);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(4200, now);
    osc2.frequency.exponentialRampToValueAtTime(3000, now + 0.08);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    gain.connect(this.ctx.destination);

    osc.connect(gain);
    osc2.connect(gain);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.15);
    osc2.stop(now + 0.15);
  }

  // Win — ascending pleasant tones
  win() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = this.ctx.createGain();
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.25, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      gain.connect(this.ctx.destination);

      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  // Blackjack — special fanfare
  blackjack() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;

      const gain = this.ctx.createGain();
      const t = now + i * 0.1;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      gain.connect(this.ctx.destination);

      osc.connect(gain);
      osc2.connect(gain);
      osc.start(t);
      osc2.start(t);
      osc.stop(t + 0.5);
      osc2.stop(t + 0.5);
    });
  }

  // Lose — descending minor tones
  lose() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [440, 349.23]; // A4, F4

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = this.ctx.createGain();
      const t = now + i * 0.2;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.2, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      gain.connect(this.ctx.destination);

      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  // Bust — impact thud
  bust() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    gain.connect(this.ctx.destination);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.2);

    // Add noise
    const bufferSize = this.ctx.sampleRate * 0.08;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 4);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g2 = this._gain(this.volume * 0.15);
    src.connect(g2);
    src.start(now);
  }

  // Click — UI button click
  click() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1200;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    gain.connect(this.ctx.destination);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  // Push — neutral tone
  push() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 440;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    gain.connect(this.ctx.destination);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

// Global instance
const sounds = new SoundEngine();
