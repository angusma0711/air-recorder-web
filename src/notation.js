(() => {
const VEXFLOW_PITCH_MAP = Object.freeze({
  F4: "f/4",
  "F#4": "f#/4",
  G4: "g/4",
  "G#4": "g#/4",
  A4: "a/4",
  "A#4": "a#/4",
  B4: "b/4",
  C5: "c/5",
  "C#5": "c#/5",
  D5: "d/5",
  "D#5": "d#/5",
  E5: "e/5",
  F5: "f/5",
  "F#5": "f#/5",
  G5: "g/5",
  "G#5": "g#/5",
  A5: "a/5",
  "A#5": "a#/5",
  B5: "b/5",
  C6: "c/6",
  "C#6": "c#/6",
  D6: "d/6",
  "D#6": "d#/6",
  E6: "e/6",
  F6: "f/6",
  "F#6": "f#/6",
  G6: "g/6",
  "G#6": "g#/6",
  A6: "a/6",
  "A#6": "a#/6",
  B6: "b/6",
  C7: "c/7",
  "C#7": "c#/7",
  D7: "d/7"
});

const PITCH_CLASS_OFFSETS = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
});

const ACCIDENTAL_OFFSETS = Object.freeze({ "": 0, "#": 1, b: -1 });

function pitchToMidi(pitchId) {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(pitchId);
  if (!match) throw new TypeError(`Invalid pitch ID: ${pitchId}`);

  const [, pitchClass, accidental, octaveText] = match;
  return (Number(octaveText) + 1) * 12
    + PITCH_CLASS_OFFSETS[pitchClass]
    + ACCIDENTAL_OFFSETS[accidental];
}

const MIDDLE_LINE_B4_MIDI = pitchToMidi("B4");

function getStemDirection(pitchId, Stem) {
  return pitchToMidi(pitchId) < MIDDLE_LINE_B4_MIDI ? Stem.UP : Stem.DOWN;
}

function renderError(container, message) {
  container.replaceChildren();
  const error = document.createElement("div");
  error.className = "notation-error";
  error.setAttribute("role", "status");
  error.textContent = message;
  container.append(error);
}

function renderNotation(container, pitchId) {
  const vexKey = VEXFLOW_PITCH_MAP[pitchId];
  if (!vexKey) {
    renderError(container, `未能顯示音高 ${pitchId}。`);
    return false;
  }

  const VexFlow = globalThis.VexFlow;
  if (!VexFlow) {
    renderError(container, "樂譜元件未能載入，請重新開啟頁面。");
    return false;
  }

  try {
    const { Accidental, Formatter, Renderer, Stave, StaveNote, Stem, Voice } = VexFlow;
    const width = Math.min(550, Math.max(280, Math.floor(container.clientWidth || 500)));
    const height = 180;
    container.replaceChildren();

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();
    const stave = new Stave(12, 34, width - 24);
    stave.addClef("treble").setContext(context).draw();

    const note = new StaveNote({ clef: "treble", keys: [vexKey], duration: "q" });
    note.setStemDirection(getStemDirection(pitchId, Stem));
    if (pitchId.includes("#")) note.addModifier(new Accidental("#"), 0);
    note.setCenterAlignment(true);

    const voice = new Voice({ numBeats: 1, beatValue: 4 }).addTickables([note]);
    new Formatter().joinVoices([voice]).formatToStave([voice], stave);
    voice.draw(context, stave);

    const svg = container.querySelector("svg");
    if (svg) {
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
    return true;
  } catch (error) {
    console.error("VexFlow notation rendering failed:", error);
    renderError(container, "樂譜暫時未能顯示，請重新開啟頁面。");
    return false;
  }
}

function renderAllNotation(scope = document) {
  scope.querySelectorAll("[data-notation-pitch]").forEach((container) => {
    renderNotation(container, container.dataset.notationPitch);
  });
}

globalThis.AirRecorderNotation = Object.freeze({
  VEXFLOW_PITCH_MAP,
  getStemDirection,
  pitchToMidi,
  renderAllNotation,
  renderNotation
});
})();
