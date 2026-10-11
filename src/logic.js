(() => {
const { HOLE_KEYS, HOLE_LABELS } = globalThis.AirRecorderData;

function cloneFingering(fingering) {
  return { thumb: fingering.thumb, holes: { ...fingering.holes } };
}

function compareFingerings(actual, expected) {
  const differences = [];
  if (actual.thumb !== expected.thumb) {
    differences.push({ key: "thumb", label: HOLE_LABELS.thumb, actual: actual.thumb, expected: expected.thumb });
  }
  for (const key of HOLE_KEYS) {
    if (actual.holes[key] !== expected.holes[key]) {
      differences.push({ key, label: HOLE_LABELS[key], actual: actual.holes[key], expected: expected.holes[key] });
    }
  }
  return differences;
}

function feedbackFor(differences) {
  if (!differences.length) return "正確！";
  const first = differences[0];
  const action = first.expected === "open" ? "打開" : first.expected === "half" ? "按半孔" : "按住";
  const more = differences.length > 1 ? `，另有 ${differences.length - 1} 個位置要檢查` : "";
  return `差一點。${first.label}應該${action}${more}。`;
}

function chooseNext(notes, previousPitchId = "", random = Math.random) {
  if (notes.length <= 1) return notes[0];
  const candidates = notes.filter((note) => note.pitchId !== previousPitchId);
  return candidates[Math.floor(random() * candidates.length)];
}

function buildChoices(notes, target, count = 4, random = Math.random) {
  const others = notes.filter((note) => note.pitchId !== target.pitchId);
  for (let index = others.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [others[index], others[swap]] = [others[swap], others[index]];
  }
  const choices = [target, ...others.slice(0, Math.max(1, count - 1))];
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [choices[index], choices[swap]] = [choices[swap], choices[index]];
  }
  return choices;
}

function accuracy(correct, attempts) {
  return attempts ? Math.round((correct / attempts) * 100) : 0;
}

globalThis.AirRecorderLogic = Object.freeze({
  accuracy,
  buildChoices,
  chooseNext,
  cloneFingering,
  compareFingerings,
  feedbackFor
});
})();
