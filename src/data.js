(() => {
const CLOSED = "closed";
const OPEN = "open";
const HALF = "half";

const HOLE_KEYS = ["h1", "h2", "h3", "h4", "h5", "h6l", "h6r", "h7l", "h7r"];

const HOLE_LABELS = {
  thumb: "拇指孔",
  h1: "第 1 孔",
  h2: "第 2 孔",
  h3: "第 3 孔",
  h4: "第 4 孔",
  h5: "第 5 孔",
  h6l: "第 6 孔左側",
  h6r: "第 6 孔右側",
  h7l: "第 7 孔左側",
  h7r: "第 7 孔右側"
};

// Standard recorder playing position: the left hand operates the thumb hole
// and front holes 1-3; the right hand operates front holes 4-7. Ownership is
// independent of whether a hole is open, closed, half-covered, or split.
const HOLE_METADATA = Object.freeze({
  thumb: Object.freeze({ hand: "left", finger: "thumb", shortLabel: "LT", hole: 0 }),
  h1: Object.freeze({ hand: "left", finger: "index", shortLabel: "L1", hole: 1 }),
  h2: Object.freeze({ hand: "left", finger: "middle", shortLabel: "L2", hole: 2 }),
  h3: Object.freeze({ hand: "left", finger: "ring", shortLabel: "L3", hole: 3 }),
  h4: Object.freeze({ hand: "right", finger: "index", shortLabel: "R1", hole: 4 }),
  h5: Object.freeze({ hand: "right", finger: "middle", shortLabel: "R2", hole: 5 }),
  h6l: Object.freeze({ hand: "right", finger: "ring", shortLabel: "R3", hole: 6, side: "left" }),
  h6r: Object.freeze({ hand: "right", finger: "ring", shortLabel: "R3", hole: 6, side: "right" }),
  h7l: Object.freeze({ hand: "right", finger: "little", shortLabel: "R4", hole: 7, side: "left" }),
  h7r: Object.freeze({ hand: "right", finger: "little", shortLabel: "R4", hole: 7, side: "right" })
});

const SYSTEMS = {
  baroque: {
    id: "baroque",
    instrument: "soprano",
    system: "baroque",
    label: "高音直笛（巴洛克式）",
    shortLabel: "高音・巴洛克式",
    source: "fingering_baroque.pdf",
    startMidi: 72,
    beginner: ["G5", "A5", "B5", "C6", "D6"]
  },
  german: {
    id: "german",
    instrument: "soprano",
    system: "german",
    label: "高音直笛（德式）",
    shortLabel: "高音・德式",
    source: "fingering_german.pdf",
    startMidi: 72,
    beginner: ["G5", "A5", "B5", "C6", "D6"]
  },
  alto: {
    id: "alto",
    instrument: "alto",
    system: "alto",
    label: "中音直笛",
    shortLabel: "中音直笛",
    source: "fingering_alto.pdf",
    startMidi: 65,
    beginner: ["F4", "G4", "A4", "B4", "C5"]
  }
};

// Each source row was transcribed visually from the supplied Yamaha chart.
// Finger strings represent h1-h5, h6-left/right, h7-left/right.
const BAROQUE_ROWS = [
  ["C", "closed", "CCCCCCCCC"],
  ["C#", "closed", "CCCCCCCCO"],
  ["D", "closed", "CCCCCCCOO"],
  ["D#", "closed", "CCCCCCOOO"],
  ["E", "closed", "CCCCCOOOO"],
  ["F", "closed", "CCCCOCCCC"],
  ["F#", "closed", "CCCOCCCOO"],
  ["G", "closed", "CCCOOOOOO"],
  ["G#", "closed", "CCOCCCOOO"],
  ["A", "closed", "CCOOOOOOO"],
  ["A#", "closed", "COCCOOOOO"],
  ["B", "closed", "COOOOOOOO", [["closed", "OCCOOOOOO"]]],
  ["C", "closed", "OCOOOOOOO"],
  ["C#", "open", "CCOOOOOOO", [["closed", "OOOOOOOOO"]]],
  ["D", "open", "OCOOOOOOO"],
  ["D#", "open", "OCCCCCCOO"],
  ["E", "half", "CCCCCOOOO"],
  ["F", "half", "CCCCOCCOO"],
  ["F#", "half", "CCCOCOOOO"],
  ["G", "half", "CCCOOOOOO"],
  ["G#", "half", "CCOCOOOOO"],
  ["A", "half", "CCOOOOOOO"],
  ["A#", "closed", "CCOCCCCOO"],
  ["B", "half", "CCOCCOOOO", [["half", "COOOCCCCC"]]],
  ["C", "half", "COOCCOOOO"],
  ["C#", "half", "COCCCOOCC"],
  ["D", "half", "COCCOCCOO"]
];

const GERMAN_ROWS = [
  ["C", "closed", "CCCCCCCCC"],
  ["C#", "closed", "CCCCCCCCO"],
  ["D", "closed", "CCCCCCCOO"],
  ["D#", "closed", "CCCCCCOOO"],
  ["E", "closed", "CCCCCOOOO"],
  ["F", "closed", "CCCCOOOOO"],
  ["F#", "closed", "CCCOCCCCC"],
  ["G", "closed", "CCCOOOOOO"],
  ["G#", "closed", "CCOCCCOOO"],
  ["A", "closed", "CCOOOOOOO"],
  ["A#", "closed", "COCCOOOOO"],
  ["B", "closed", "COOOOOOOO", [["closed", "OCCOOOOOO"]]],
  ["C", "closed", "OCOOOOOOO"],
  ["C#", "open", "CCOOOOOOO", [["closed", "OOOOOOOOO"]]],
  ["D", "open", "OCOOOOOOO"],
  ["D#", "open", "OCCCCCCOO"],
  ["E", "half", "CCCCCOOOO"],
  ["F", "half", "CCCCOOOOO"],
  ["F#", "half", "CCCOCOOCC", [["half", "CCCOCCOOO"]]],
  ["G", "half", "CCCOOOOOO"],
  ["G#", "half", "CCCOCCCCC"],
  ["A", "half", "CCOOOOOOO"],
  ["A#", "half", "CCOCCCCOO"],
  ["B", "half", "CCOCCOOOO"],
  ["C", "half", "COOCCOOOO"],
  ["C#", "half", "COCCOCCCC"],
  ["D", "half", "COCCOCCOO"]
];

const ALTO_ROWS = [
  ["F", "closed", "CCCCCCCCC"],
  ["F#", "closed", "CCCCCCCCO"],
  ["G", "closed", "CCCCCCCOO"],
  ["G#", "closed", "CCCCCCOOO"],
  ["A", "closed", "CCCCCOOOO"],
  ["A#", "closed", "CCCCOCCCC"],
  ["B", "closed", "CCCOCCCOO"],
  ["C", "closed", "CCCOOOOOO"],
  ["C#", "closed", "CCOCCCOOO"],
  ["D", "closed", "CCOOOOOOO"],
  ["D#", "closed", "COCCOOOOO"],
  ["E", "closed", "COOOOOOOO", [["closed", "OCCOOOOOO"]]],
  ["F", "closed", "OCOOOOOOO"],
  ["F#", "open", "CCOOOOOOO", [["closed", "OOOOOOOOO"]]],
  ["G", "open", "OCOOOOOOO"],
  ["G#", "open", "OCCCCCCOO"],
  ["A", "half", "CCCCCOOOO"],
  ["A#", "half", "CCCCOCCOO"],
  ["B", "half", "CCCOCOOOO"],
  ["C", "half", "CCCOOOOOO"],
  ["C#", "half", "CCOCOOOOO"],
  ["D", "half", "CCOOOOOOO"],
  ["D#", "closed", "CCOCCCCOO"],
  ["E", "half", "CCOCCOOOO", [["half", "COOOCCCCC"]]],
  ["F", "half", "COOCCOOOO"],
  ["F#", "half", "COCCCOOCC"],
  ["G", "half", "COCCOCCOO"]
];

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function pitchIdFromMidi(midi) {
  const name = PITCH_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function fingeringFrom(thumb, fingerString) {
  const holes = Object.fromEntries(
    HOLE_KEYS.map((key, index) => [key, fingerString[index] === "C" ? CLOSED : OPEN])
  );
  return { thumb, holes };
}

function buildNotes(system, sourceRows) {
  return sourceRows.map((row, index) => {
    const [sourceName, thumb, fingerString, alternatives = []] = row;
    const midi = system.startMidi + index;
    const pitchId = pitchIdFromMidi(midi);
    if (pitchId.replace(/\d$/, "") !== sourceName) {
      throw new Error(`Source pitch order mismatch for ${system.id}: ${sourceName}/${pitchId}`);
    }
    return {
      instrument: system.instrument,
      system: system.system,
      noteName: pitchId.replace("#", "♯").replace(/\d$/, ""),
      pitchId,
      midi,
      displayLabel: pitchId.replace("#", "♯"),
      fingering: fingeringFrom(thumb, fingerString),
      alternateFingerings: alternatives.map(([altThumb, altString]) => fingeringFrom(altThumb, altString)),
      source: system.source
    };
  });
}

const RECORDER_SYSTEMS = Object.fromEntries(
  Object.entries(SYSTEMS).map(([id, system]) => {
    const rows = id === "baroque" ? BAROQUE_ROWS : id === "german" ? GERMAN_ROWS : ALTO_ROWS;
    return [id, { ...system, notes: buildNotes(system, rows) }];
  })
);

function getDefaultActivePitchIds(systemId) {
  return [...RECORDER_SYSTEMS[systemId].beginner];
}

function createOpenFingering() {
  return {
    thumb: OPEN,
    holes: Object.fromEntries(HOLE_KEYS.map((key) => [key, OPEN]))
  };
}

const FINGER_STATES = { CLOSED, OPEN, HALF };

globalThis.AirRecorderData = Object.freeze({
  FINGER_STATES,
  HOLE_KEYS,
  HOLE_LABELS,
  HOLE_METADATA,
  RECORDER_SYSTEMS,
  createOpenFingering,
  getDefaultActivePitchIds
});
})();
