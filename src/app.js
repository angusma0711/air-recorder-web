(() => {
const { FINGER_STATES, HOLE_KEYS, HOLE_METADATA, RECORDER_SYSTEMS, createOpenFingering, getDefaultActivePitchIds } = globalThis.AirRecorderData;
const { accuracy, buildChoices, chooseNext, compareFingerings } = globalThis.AirRecorderLogic;
const { renderAllNotation } = globalThis.AirRecorderNotation;
const { translate } = globalThis.AirRecorderI18n;
const { buildWrittenFingeringGuide } = globalThis.AirRecorderFingeringGuide;
const { BrowserPitchDetector, comparePitch } = globalThis.AirRecorderPitch;

const root = document.querySelector("#app");
const demoSound = new globalThis.AirRecorderSound.RecorderSound(() => render());
let demoError = false;
const MODE_META = Object.freeze({
  learn: { icon: "♪", label: "learn", description: "learnDesc" },
  fingering: { icon: "●", label: "fingering", description: "fingeringDesc" },
  identify: { icon: "?", label: "identify", description: "identifyDesc" },
  staff: { icon: "譜", label: "staff", description: "staffDesc" }
});

const stored = loadPreferences();
const activeBySystem = Object.fromEntries(Object.keys(RECORDER_SYSTEMS).map((id) => {
  const valid = new Set(RECORDER_SYSTEMS[id].notes.map((note) => note.pitchId));
  const saved = Array.isArray(stored.activeBySystem?.[id]) ? stored.activeBySystem[id].filter((pitch) => valid.has(pitch)) : [];
  return [id, new Set(saved.length ? saved : getDefaultActivePitchIds(id))];
}));

const state = {
  screen: "setup", language: loadLanguage(), systemId: RECORDER_SYSTEMS[stored.systemId] ? stored.systemId : "baroque",
  activeBySystem, settingsOpen: false, mode: "learn", learnIndex: 0, learnScaffold: "full", target: null,
  input: createOpenFingering(), feedback: null, wrongKeys: [], solved: false, answeredChoice: null, choices: [],
  detector: { status: "idle", reading: null, errorKey: null },
  stats: { attempts: 0, correct: 0, practiced: new Set() }
};

const pitchDetector = new BrowserPitchDetector({
  onState(status) { state.detector.status = status; if (status === "idle") state.detector.reading = null; render(); },
  onWaiting() {
    if (state.detector.status !== "waiting" || state.detector.reading) {
      state.detector.status = "waiting"; state.detector.reading = null; render();
    }
  },
  onPitch(reading) { state.detector.status = "detected"; state.detector.reading = reading; state.detector.errorKey = null; render(); },
  onError(error) { state.detector.status = "error"; state.detector.reading = null; state.detector.errorKey = error?.message === "disconnected" ? "microphoneDisconnected" : "microphoneUnavailable"; render(); }
});

root.addEventListener("click", handleClick);
root.addEventListener("change", handleChange);
root.addEventListener("keydown", handleKeydown);
root.addEventListener("cancel", () => { state.settingsOpen = false; }, true);
window.addEventListener("beforeunload", () => pitchDetector.stop());
window.addEventListener("pagehide", () => demoSound.stop());
render();

function t(key, values) { return translate(state.language, key, values); }
function loadLanguage() { try { return sessionStorage.getItem("air-recorder-language") === "en" ? "en" : "zh"; } catch { return "zh"; } }
function loadPreferences() { try { return JSON.parse(localStorage.getItem("air-recorder-v1") || "{}"); } catch { return {}; } }
function savePreferences() {
  try { localStorage.setItem("air-recorder-v1", JSON.stringify({ systemId: state.systemId,
    activeBySystem: Object.fromEntries(Object.entries(state.activeBySystem).map(([id, pitches]) => [id, [...pitches]])) })); } catch { /* Optional storage. */ }
}
function currentSystem() { return RECORDER_SYSTEMS[state.systemId]; }
function activeNotes() { const active = state.activeBySystem[state.systemId]; return currentSystem().notes.filter((note) => active.has(note.pitchId)); }
function displayedNote() {
  if (state.mode === "learn") { const notes = activeNotes(); return notes[Math.min(state.learnIndex, Math.max(0, notes.length - 1))]; }
  return state.target;
}
function systemLabel(id, short = false) { const suffix = short ? "Short" : ""; return t(`system${id[0].toUpperCase()}${id.slice(1)}${suffix}`); }
function systemDetail(id) { return t(id === "baroque" ? "baroqueDetail" : id === "german" ? "germanDetail" : "altoDetail"); }
function teachingLabel(note) { return activeNotes().filter((item) => item.noteName === note.noteName).length > 1 ? note.displayLabel : note.noteName; }
function detectorAllowed() { return state.mode !== "identify" || Boolean(state.answeredChoice); }
function guideAllowed() { return state.mode === "learn" || state.solved || Boolean(state.feedback) || Boolean(state.answeredChoice); }

function setLanguage(language) {
  if (!["zh", "en"].includes(language) || state.language === language) return;
  state.language = language; try { sessionStorage.setItem("air-recorder-language", language); } catch { /* Optional. */ } render();
}
function resetQuestion(previousPitchId = "") {
  demoSound.stop();
  const notes = activeNotes(); state.target = chooseNext(notes, previousPitchId); state.input = createOpenFingering();
  state.feedback = null; state.wrongKeys = []; state.solved = false; state.answeredChoice = null;
  state.choices = state.target ? buildChoices(notes, state.target) : [];
}
function resetSession() { state.stats = { attempts: 0, correct: 0, practiced: new Set() }; resetQuestion(); }
function setSystem(systemId) {
  if (!RECORDER_SYSTEMS[systemId]) return;
  state.systemId = systemId; state.learnIndex = 0; state.settingsOpen = false; savePreferences(); resetQuestion(); render();
}
function setMode(mode) { if (!MODE_META[mode]) return; state.mode = mode; state.settingsOpen = false; resetQuestion(state.target?.pitchId || ""); render(); }
function recordAttempt(correct) { state.stats.attempts += 1; if (correct) state.stats.correct += 1; if (state.target) state.stats.practiced.add(state.target.pitchId); }

function render() {
  document.documentElement.lang = state.language === "en" ? "en" : "zh-Hant";
  const skip = document.querySelector(".skip-link"); if (skip) skip.textContent = t("skip");
  if (state.screen === "setup") renderSetup(); else renderLearningApp();
  requestAnimationFrame(() => { renderAllNotation(root); const dialog = root.querySelector("#lesson-settings-dialog"); if (state.settingsOpen && dialog && !dialog.open) dialog.showModal(); });
}
function languageControl() {
  return `<div class="language-control" role="group" aria-label="${t("language")}"><button type="button" data-action="set-language" data-language="zh" aria-pressed="${state.language === "zh"}">中文</button><span aria-hidden="true">|</span><button type="button" data-action="set-language" data-language="en" aria-pressed="${state.language === "en"}">EN</button></div>`;
}
function renderSetup() {
  root.innerHTML = `<div class="setup-shell shell"><main class="setup-card" id="main-content"><div class="setup-top"><div class="brand-mark">${t("brandMark")}</div>${languageControl()}</div><h1 class="setup-title">Air Recorder <span class="setup-version">V2.1</span></h1><p class="subtitle">${t("tagline")}</p><p class="eyebrow">${t("chooseRecorderBoth")}</p><div class="instrument-grid" role="radiogroup" aria-label="${t("chooseRecorder")}">${Object.values(RECORDER_SYSTEMS).map((item) => `<button class="instrument-card ${item.id === state.systemId ? "selected" : ""}" type="button" role="radio" aria-checked="${item.id === state.systemId}" data-action="select-system" data-system="${item.id}"><strong>${systemLabel(item.id)}</strong><span>${systemDetail(item.id)}</span></button>`).join("")}</div><div class="setup-settings-summary"><span class="active-set-label">${t("selectedNotes", { count: activeNotes().length })}</span><button class="ghost-button" type="button" data-action="open-settings">⚙ ${t("lessonSettings")}</button></div><div class="setup-actions"><button class="primary-button" type="button" data-action="start">${t("start")}</button></div></main>${lessonSettingsDialog(currentSystem())}</div>`;
}
function renderLearningApp() {
  if (!state.target || !activeNotes().some((note) => note.pitchId === state.target.pitchId)) resetQuestion();
  const meta = MODE_META[state.mode]; const stats = state.stats;
  root.innerHTML = `<div class="shell app-shell"><header class="app-header"><div class="header-brand"><span class="mini-note" aria-hidden="true">♪</span> Air Recorder <span class="version-label">V2.1</span></div><div class="header-actions">${languageControl()}<div class="system-control"><label for="system-select">${t("currentRecorder")}</label><select id="system-select" data-action="change-system" aria-label="${t("currentRecorder")}">${Object.values(RECORDER_SYSTEMS).map((item) => `<option value="${item.id}" ${item.id === state.systemId ? "selected" : ""}>${systemLabel(item.id)}</option>`).join("")}</select></div><button class="ghost-button settings-button" type="button" data-action="open-settings">⚙ ${t("lessonSettings")}</button></div></header><div class="main-layout"><aside class="sidebar" aria-label="${t("learnGroup")}"><nav class="mode-nav" aria-label="${t("learnGroup")}">${modeButtons()}</nav><section class="stats-card" aria-label="${t("session")}"><h2>${t("session")}</h2><div class="stat-row"><span>${t("practisedNotes")}</span><strong>${stats.practiced.size}</strong></div><div class="stat-row"><span>${t("correctAnswers")}</span><strong>${stats.correct}</strong></div><div class="stat-row"><span>${t("accuracy")}</span><strong>${accuracy(stats.correct, stats.attempts)}%</strong></div><button type="button" class="ghost-button reset-button" data-action="reset-session">${t("resetSession")}</button></section></aside><main class="content" id="main-content"><div class="content-heading"><div><h1>${t(meta.label)}</h1><p>${t(meta.description)}</p></div><span class="active-set-label">${systemLabel(state.systemId, true)} · ${t("lessonCount", { count: activeNotes().length })}</span></div>${renderMode()}</main></div>${lessonSettingsDialog(currentSystem())}</div>`;
}
function modeButtons() { return Object.entries(MODE_META).map(([id, item]) => `<button type="button" class="nav-button ${id === state.mode ? "active" : ""}" data-action="set-mode" data-mode="${id}" aria-current="${id === state.mode ? "page" : "false"}"><span class="nav-icon" aria-hidden="true">${item.icon}</span>${t(item.label)}</button>`).join(""); }
function lessonSettingsDialog(system) {
  const active = state.activeBySystem[state.systemId];
  return `<dialog class="teacher-settings" id="lesson-settings-dialog" aria-labelledby="settings-title"><div class="settings-header"><div><p class="eyebrow">${t("teacherTool")}</p><h2 id="settings-title">${t("settingsTitle")}</h2></div><button class="dialog-close" type="button" data-action="close-settings" aria-label="${t("closeSettings")}">×</button></div><div class="settings-body"><p class="active-set-label">${t("settingsHelp")}</p><div class="note-check-grid">${system.notes.map((note) => `<label class="note-check"><input type="checkbox" data-action="toggle-active-note" value="${note.pitchId}" ${active.has(note.pitchId) ? "checked" : ""}/>${note.displayLabel}</label>`).join("")}</div></div><div class="dialog-actions"><span class="active-set-label">${t("selectedCount", { count: active.size })}</span><button class="primary-button" type="button" data-action="close-settings">${t("done")}</button></div></dialog>`;
}
function renderMode() {
  if (!activeNotes().length) return `<div class="empty-warning">${t("noNotes")}</div>`;
  if (state.mode === "learn") return renderLearnMode();
  if (state.mode === "identify") return renderIdentifyMode();
  return renderFingeringMode(state.mode === "staff");
}
function renderLearnMode() {
  const notes = activeNotes(); state.learnIndex = Math.min(state.learnIndex, notes.length - 1); const note = notes[state.learnIndex]; const showStaff = state.learnScaffold === "full";
  return `<section class="workspace-card v21-workspace" aria-labelledby="learn-note-title"><div class="top-tools"><span class="eyebrow">${t(showStaff ? "hintFull" : "hintName")}</span><button class="ghost-button" type="button" data-action="toggle-scaffold">${t(showStaff ? "reduceHint" : "showFullHint")}</button></div><div class="v21-grid"><div class="notation-panel">${showStaff ? notationHtml(note) : ""}<h2 class="large-note" id="learn-note-title">${note.noteName}</h2><div class="pitch-id">${note.displayLabel}</div>${feedbackHtml()}</div><div class="recorder-panel">${recorderSvg(note.fingering, false)}${note.alternateFingerings.length ? `<p class="active-set-label">${t("alternate", { count: note.alternateFingerings.length })}</p>` : ""}</div><div class="assist-column">${writtenGuideHtml(note)}${pitchDetectorHtml(note, true)}</div></div><div class="note-strip" aria-label="${t("learn")}">${notes.map((item, index) => `<button class="note-pill ${index === state.learnIndex ? "active" : ""}" type="button" data-action="select-learn-note" data-index="${index}" aria-pressed="${index === state.learnIndex}">${item.displayLabel}</button>`).join("")}</div><div class="button-row between"><button class="secondary-button" type="button" data-action="previous-note">← ${t("previous")}</button><button class="secondary-button" type="button" data-action="next-note">${t("next")} →</button></div></section>`;
}
function renderFingeringMode(staffOnly) {
  const note = state.target; const targetLabel = teachingLabel(note);
  return `<section class="workspace-card v21-workspace"><div class="v21-grid"><div class="notation-panel"><div class="prompt-box"><div class="prompt-label">${t(staffOnly ? "readStaff" : "targetNote")}</div><h2>${t(staffOnly ? "fingerThis" : "fingerPrompt", { note: targetLabel })}</h2></div>${staffOnly ? notationHtml(note) : `<div class="large-note" aria-hidden="true">${targetLabel}</div>`}<p class="active-set-label">${t("interactionHelp")}</p>${feedbackHtml()}<div class="button-row">${state.solved ? `<button class="primary-button" type="button" data-action="next-question">${t("nextQuestion")}</button>` : `<button class="primary-button" type="button" data-action="check-fingering">${t("checkAnswer")}</button><button class="secondary-button" type="button" data-action="retry">${t("tryAgain")}</button>`}</div></div><div class="recorder-panel">${recorderSvg(state.input, true, state.wrongKeys)}</div><div class="assist-column">${guideAllowed() ? writtenGuideHtml(note) : ""}${pitchDetectorHtml(note, true)}</div></div></section>`;
}
function renderIdentifyMode() {
  const target = state.target; const answered = Boolean(state.answeredChoice);
  return `<section class="workspace-card v21-workspace"><div class="v21-grid"><div class="recorder-panel"><div class="prompt-box"><div class="prompt-label">${t("observeFingering")}</div><h2>${t("whatNote")}</h2></div>${recorderSvg(target.fingering, false)}</div><div class="notation-panel"><div class="choice-grid" role="group" aria-label="${t("chooseNote")}">${state.choices.map((note) => { const selected = state.answeredChoice === note.pitchId; const className = answered && note.pitchId === target.pitchId ? "correct" : selected ? "incorrect" : ""; return `<button type="button" class="choice-button ${className}" data-action="answer-note" data-pitch="${note.pitchId}" ${answered ? "disabled" : ""}>${note.displayLabel}</button>`; }).join("")}</div>${feedbackHtml()}${answered ? `<div class="reveal-card">${notationHtml(target)}<h2 class="large-note">${target.noteName}</h2></div><div class="button-row"><button class="primary-button" type="button" data-action="next-question">${t("nextQuestion")}</button></div>` : ""}</div><div class="assist-column">${answered ? writtenGuideHtml(target) : ""}${pitchDetectorHtml(target, answered)}</div></div></section>`;
}
function feedbackHtml() { return state.feedback ? `<div class="feedback ${state.feedback.type}" role="status" aria-live="polite">${state.feedback.text}</div>` : `<div aria-live="polite" class="visually-hidden"></div>`; }
function notationHtml(note) { return note ? `<div class="staff-wrap"><div class="notation-container" data-notation-pitch="${note.pitchId}" role="img" aria-label="${t("staffAlt", { note: note.displayLabel })}"></div></div>` : ""; }
function writtenGuideHtml(note) {
  const guide = buildWrittenFingeringGuide(note, state.systemId, state.language);
  return `<section class="written-guide" aria-labelledby="guide-title"><div class="panel-kicker">${t("fingeringGuide")}</div><h3 id="guide-title">${guide.title}</h3><ul>${guide.lines.map((line) => `<li class="${line.hand}"><span class="guide-code">${line.code}</span><span>${line.text.replace(`${line.code} `, "")}</span></li>`).join("")}</ul><div class="demo-sound"><button class="secondary-button" type="button" data-action="play-demo">${t(demoSound.playing ? "stopDemo" : "playDemo")}</button><small>${t("synthDemo")}</small>${demoError ? `<p role="alert">${t("demoUnavailable")}</p>` : ""}</div></section>`;
}
function pitchDetectorHtml(note, allowed) {
  const detector = state.detector; const running = pitchDetector.running; const requesting = detector.status === "requesting"; const reading = detector.reading;
  const comparison = allowed && reading ? comparePitch(note.pitchId, reading) : { outcome: "waiting", tuning: null };
  let body = `<p class="detector-message">${t("detectorIdle")}</p>`;
  if (!allowed) body = `<p class="detector-message">${t("answerFirst")}</p>`;
  else if (detector.status === "error") body = `<p class="detector-message error-text">${t(detector.errorKey || "microphoneUnavailable")}</p>`;
  else if ((running || requesting) && !reading) body = `<div class="listening-label">● ${t("listening")}</div><strong>${t("playTarget", { note: note.pitchId })}</strong><p class="detector-message">${t("waitingForStablePitch")}</p>`;
  else if (reading) {
    const outcomeText = comparison.outcome === "correct" ? `✓ ${t("correctPitch")}` : t("differentPitch");
    const marker = Math.max(0, Math.min(100, 50 + reading.cents));
    body = `<div class="pitch-readout"><div><span>${t("target")}</span><strong>${note.pitchId}</strong></div><div><span>${t("detected")}</span><strong>${reading.pitchId}</strong></div></div><div class="detector-outcome ${comparison.outcome}">${outcomeText}</div>${comparison.outcome === "correct" ? `<div class="tuning-scale"><span>${t("tooLow")}</span><span>${t("inTune")}</span><span>${t("tooHigh")}</span><i style="left:${marker}%"></i></div><div class="stable-label">${t("stablePitch")}</div>` : `<p class="detector-message">${t("checkFingering", { note: note.noteName })}</p>`}`;
  }
  return `<section class="pitch-detector" aria-labelledby="pitch-title"><div class="panel-kicker">🎤</div><h3 id="pitch-title">${t("pitchDetector")}</h3>${body}<button class="${running ? "secondary-button" : "primary-button"}" type="button" data-action="${running ? "stop-pitch" : "start-pitch"}" ${allowed && !requesting ? "" : "disabled"}>${running ? t("stopPitchDetection") : requesting ? `● ${t("listening")}` : `🎤 ${t("startPitchDetection")}`}</button><small>${t("localPrivacy")}</small></section>`;
}
function holeLabel(key) { if (key === "thumb") return t("thumb"); const number = Number(key.match(/\d/)[0]); if (key.endsWith("l")) return t("splitLeft", { number }); if (key.endsWith("r")) return t("splitRight", { number }); return t("hole", { number }); }
function recorderSvg(fingering, interactive, wrongKeys = []) {
  const wrong = new Set(wrongKeys); const holes = [["h1",140,105],["h2",140,145],["h3",140,185],["h4",140,225],["h5",140,265],["h6l",124,310],["h6r",156,310],["h7l",124,355],["h7r",156,355]];
  const thumb = holeSvg("thumb", 55, 115, fingering.thumb, interactive, wrong.has("thumb"));
  const front = holes.map(([key, x, y]) => holeSvg(key, x, y, fingering.holes[key], interactive, wrong.has(key))).join("");
  const codes = `<text class="finger-code left" x="15" y="120">LT</text>${[["L1",170,110],["L2",170,150],["L3",170,190],["R1",85,230],["R2",85,270],["R3",82,315],["R4",82,360]].map(([code,x,y]) => `<text class="finger-code ${code[0] === "L" ? "left" : "right"}" x="${x}" y="${y}">${code}</text>`).join("")}`;
  const logicalKeys = ["thumb","h1","h2","h3","h4","h5","h6l","h7l"];
  const summary = logicalKeys.map((key) => { const meta = HOLE_METADATA[key]; const value = key === "thumb" ? fingering.thumb : key === "h6l" || key === "h7l" ? splitState(fingering, meta.hole) : fingering.holes[key]; return `<span class="${meta.hand}"><strong>${meta.shortLabel}</strong> ${stateSymbol(value)}</span>`; }).join("");
  return `<div class="recorder-shell"><svg class="recorder-svg" viewBox="0 0 280 420" role="img" aria-label="${t(interactive ? "interactiveDiagram" : "recorderDiagram")}"><defs><linearGradient id="half-hole-fill" x1="0" x2="1"><stop offset="50%" stop-color="#17324d"/><stop offset="50%" stop-color="#fff"/></linearGradient></defs><path class="recorder-body" d="M112 20 H168 L176 55 L164 78 L170 390 Q140 410 110 390 L116 78 L104 55 Z"/><path class="recorder-detail" d="M109 55 H171 M113 74 H167 M111 378 H169 M116 88 H164"/><line class="thumb-guide" x1="74" y1="115" x2="111" y2="115"/>${thumb}${front}${codes}<text class="hand-zone left" x="16" y="88">L ${t("leftHand")}</text><text class="hand-zone right" x="188" y="235">R ${t("rightHand")}</text></svg><div class="fingering-summary" aria-label="${t("holeStates")}">${summary}</div><div class="legend" aria-label="${t("legend")}"><span>● ${t("closed")}</span><span>○ ${t("open")}</span><span>◐ ${t("half")}</span></div><div class="finger-legend" aria-label="${t("handLegend")}">${fingerLegend()}</div></div>`;
}
function fingerLegend() { const keys = ["thumb","h1","h2","h3","h4","h5","h6l","h7l"]; return keys.map((key) => { const meta = HOLE_METADATA[key]; return `<span class="${meta.hand}"><b>${meta.shortLabel}</b> ${t(`finger_${meta.hand}_${meta.finger}`)}</span>`; }).join(""); }
function holeSvg(key, x, y, value, interactive, isWrong) { const hand = HOLE_METADATA[key].hand; const circle = `<circle class="ownership-ring ${hand}" cx="${x}" cy="${y}" r="17"/><circle class="hole ${value} ${isWrong ? "wrong" : ""}" cx="${x}" cy="${y}" r="11"/>`; if (!interactive) return `<g class="hole-group ${hand}">${circle}</g>`; return `<g class="hole-button ${hand}" role="button" tabindex="0" data-action="toggle-hole" data-hole="${key}" aria-label="${holeLabel(key)}：${stateText(value)}，${t(hand === "left" ? "leftHand" : "rightHand")}，${HOLE_METADATA[key].shortLabel}"><circle cx="${x}" cy="${y}" r="24" fill="transparent"/>${circle}</g>`; }
function splitState(fingering, number) { const left = fingering.holes[`h${number}l`]; const right = fingering.holes[`h${number}r`]; return left === right ? left : FINGER_STATES.HALF; }
function stateSymbol(value) { return value === FINGER_STATES.CLOSED ? "●" : value === FINGER_STATES.HALF ? "◐" : "○"; }
function stateText(value) { return t(value === FINGER_STATES.CLOSED ? "closed" : value === FINGER_STATES.HALF ? "half" : "open"); }
function localizedFeedback(differences) { const first = differences[0]; const action = first.expected === "open" ? t("openAction") : first.expected === "half" ? t("halfAction") : t("closeAction"); return t("almost", { hole: holeLabel(first.key), action, more: differences.length > 1 ? t("moreHoles", { count: differences.length - 1 }) : "" }); }

async function startPitchDetection() {
  demoSound.stop();
  if (window.location.protocol === "file:") {
    state.detector = { status: "error", reading: null, errorKey: "openFromLocalhost" }; render(); return;
  }
  state.detector = { status: "requesting", reading: null, errorKey: null }; render();
  try { await pitchDetector.start(); }
  catch (error) { state.detector.status = "error"; state.detector.errorKey = error?.message === "unsupported" ? "detectorUnsupported" : "microphoneUnavailable"; render(); }
}
async function stopPitchDetection() { await pitchDetector.stop(); }
function handleClick(event) {
  const control = event.target.closest("[data-action]"); if (!control) return; const action = control.dataset.action;
  if (action === "set-language") return setLanguage(control.dataset.language);
  if (action === "play-demo") {
    if (demoSound.playing) return demoSound.stop();
    const note = displayedNote();
    if (!note || !detectorAllowed()) return;
    const pitch = note.pitchId;
    demoError = false;
    // Resume audio directly in the click handler for Safari's gesture policy.
    const playback = demoSound.play(pitch);
    pitchDetector.stop();
    playback.catch(() => { demoError = true; render(); });
    return;
  }
  if (action === "select-system") return setSystem(control.dataset.system);
  if (action === "start") { state.screen = "app"; resetQuestion(); return render(); }
  if (action === "open-settings") { state.settingsOpen = true; render(); return; }
  if (action === "close-settings") { state.settingsOpen = false; const dialog = root.querySelector("#lesson-settings-dialog"); if (dialog?.open) dialog.close(); return; }
  if (action === "set-mode") return setMode(control.dataset.mode);
  if (action === "reset-session") { resetSession(); return render(); }
  if (action === "toggle-scaffold") { state.learnScaffold = state.learnScaffold === "full" ? "name" : "full"; return render(); }
  if (action === "select-learn-note") { demoSound.stop(); state.learnIndex = Number(control.dataset.index); state.feedback = null; return render(); }
  if (action === "previous-note" || action === "next-note") { demoSound.stop(); const length = activeNotes().length; state.learnIndex = (state.learnIndex + (action === "next-note" ? 1 : -1) + length) % length; state.feedback = null; return render(); }
  if (action === "toggle-hole") { toggleHole(control.dataset.hole); return render(); }
  if (action === "retry") { state.input = createOpenFingering(); state.feedback = null; state.wrongKeys = []; return render(); }
  if (action === "check-fingering") return checkFingering();
  if (action === "next-question") { resetQuestion(state.target?.pitchId); return render(); }
  if (action === "answer-note") return answerNote(control.dataset.pitch);
  if (action === "start-pitch") return startPitchDetection();
  if (action === "stop-pitch") return stopPitchDetection();
}
function handleChange(event) {
  const control = event.target.closest("[data-action]"); if (!control) return;
  if (control.dataset.action === "change-system") return setSystem(control.value);
  if (control.dataset.action === "toggle-active-note") { state.settingsOpen = true; const active = state.activeBySystem[state.systemId]; if (control.checked) active.add(control.value); else if (active.size > 1) active.delete(control.value); else { control.checked = true; control.setCustomValidity(t("minimumOne")); control.reportValidity(); control.setCustomValidity(""); return; } state.learnIndex = 0; savePreferences(); resetQuestion(); render(); }
}
function handleKeydown(event) { const control = event.target.closest('[role="button"][data-action="toggle-hole"]'); if (control && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); toggleHole(control.dataset.hole); render(); } }
function toggleHole(key) { state.feedback = null; state.wrongKeys = []; if (key === "thumb") state.input.thumb = state.input.thumb === "open" ? "closed" : state.input.thumb === "closed" ? "half" : "open"; else if (HOLE_KEYS.includes(key)) state.input.holes[key] = state.input.holes[key] === "open" ? "closed" : "open"; }
function checkFingering() { const differences = compareFingerings(state.input, state.target.fingering); const correct = differences.length === 0; recordAttempt(correct); state.wrongKeys = differences.map((difference) => difference.key); state.solved = correct; state.feedback = { type: correct ? "success" : "error", text: correct ? t("correctFingering", { note: teachingLabel(state.target) }) : localizedFeedback(differences) }; render(); }
function answerNote(pitchId) { if (state.answeredChoice) return; const correct = pitchId === state.target.pitchId; state.answeredChoice = pitchId; recordAttempt(correct); state.feedback = { type: correct ? "success" : "error", text: t(correct ? "correctNote" : "correctWas", { note: teachingLabel(state.target) }) }; render(); }
})();
