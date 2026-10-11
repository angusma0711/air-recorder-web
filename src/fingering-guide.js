(() => {
const { FINGER_STATES, HOLE_METADATA } = globalThis.AirRecorderData;
const { translate } = globalThis.AirRecorderI18n;

const LOGICAL_HOLES = Object.freeze([
  ["thumb"], ["h1"], ["h2"], ["h3"], ["h4"], ["h5"], ["h6l", "h6r"], ["h7l", "h7r"]
]);

function stateForKeys(fingering, keys) {
  if (keys[0] === "thumb") return fingering.thumb;
  const values = keys.map((key) => fingering.holes[key]);
  if (values.every((value) => value === values[0])) return values[0];
  return values[0] === FINGER_STATES.CLOSED ? "leftClosed" : "rightClosed";
}

function buildWrittenFingeringGuide(note, recorderType, language = "zh") {
  if (!note?.fingering) throw new TypeError("A note with fingering data is required.");
  if (recorderType && note.system !== recorderType && note.instrument !== recorderType) {
    throw new RangeError(`The ${note.pitchId} fingering does not belong to ${recorderType}.`);
  }
  const lines = LOGICAL_HOLES.map((keys) => {
    const metadata = HOLE_METADATA[keys[0]];
    const state = stateForKeys(note.fingering, keys);
    return {
      code: metadata.shortLabel,
      hand: metadata.hand,
      finger: metadata.finger,
      hole: metadata.hole,
      state,
      text: translate(language, "writtenGuideLine", {
        code: metadata.shortLabel,
        finger: translate(language, `finger_${metadata.hand}_${metadata.finger}`),
        hole: metadata.hole === 0 ? translate(language, "backHole") : translate(language, "numberedHole", { number: metadata.hole }),
        action: translate(language, `guideState_${state}`)
      })
    };
  });
  return {
    title: translate(language, "fingeringGuideTitle", { note: note.displayLabel }),
    pitchId: note.pitchId,
    recorderType,
    lines
  };
}

globalThis.AirRecorderFingeringGuide = Object.freeze({ LOGICAL_HOLES, buildWrittenFingeringGuide });
})();
