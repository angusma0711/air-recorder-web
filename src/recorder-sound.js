(() => {
// A gentle recorder-like tone, not a recording of an acoustic instrument.
class RecorderSound {
  constructor(onChange = () => {}) { this.onChange = onChange; this.context = null; this.voices = []; this.generation = 0; this.playing = false; }
  stop() {
    const wasPlaying = this.playing;
    this.generation += 1;
    for (const voice of this.voices) { voice.onended = null; try { voice.stop(); } catch {} voice.disconnect(); }
    this.voices = [];
    this.playing = false;
    if (wasPlaying) this.onChange();
  }
  async play(pitchId) {
    this.stop();
    const generation = this.generation;
    const match = /^([A-G])(#|b)?(-?\d+)$/.exec(pitchId);
    if (!match) throw new Error("Invalid pitch");
    const midi = (Number(match[3]) + 1) * 12 + ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("Audio unavailable");
    this.context ||= new Context();
    await this.context.resume();
    if (generation !== this.generation) return;
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const now = this.context.currentTime;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.18, now + 0.06);
    envelope.gain.linearRampToValueAtTime(0.15, now + 0.18);
    envelope.gain.setValueAtTime(0.15, now + 1.2);
    envelope.gain.linearRampToValueAtTime(0, now + 1.45);
    envelope.connect(this.context.destination);
    [1, 0.12, 0.035].forEach((amplitude, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency * (index + 1);
      gain.gain.value = amplitude;
      oscillator.connect(gain); gain.connect(envelope);
      oscillator.onended = () => {
        oscillator.disconnect(); gain.disconnect();
        if (index === 0) { envelope.disconnect(); if (generation === this.generation) { this.voices = []; this.playing = false; this.onChange(); } }
      };
      this.voices.push(oscillator);
      oscillator.start(now); oscillator.stop(now + 1.5);
    });
    this.playing = true;
    this.onChange();
  }
}
globalThis.AirRecorderSound = { RecorderSound };
})();
