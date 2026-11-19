// Default blind structure. Edit here, or build one in the Structure side panel.
// `minutes` is the level length. Set `break: true` for a break level.
const DEFAULT_LEVELS = [
  { sb: 100,  bb: 200,   minutes: 20 },
  { sb: 200,  bb: 400,   minutes: 20 },
  { sb: 300,  bb: 600,   minutes: 20 },
  { sb: 400,  bb: 800,   minutes: 20 },
  { break: true,         minutes: 10 },
  { sb: 500,  bb: 1000,  minutes: 20 },
  { sb: 600,  bb: 1200,  minutes: 20 },
  { sb: 800,  bb: 1600,  minutes: 20 },
  { sb: 1000, bb: 2000,  minutes: 20 },
  { break: true,         minutes: 10 },
  { sb: 1500, bb: 3000,  minutes: 20 },
  { sb: 2000, bb: 4000,  minutes: 20 },
  { sb: 3000, bb: 6000,  minutes: 20 },
  { sb: 4000, bb: 8000,  minutes: 20 },
  { sb: 5000, bb: 10000, minutes: 20 },
];

const WARNING_SECONDS = 60;
const STORAGE_KEY = "tournament-board.structure";
const SAVED_KEY = "tournament-board.saved-structures";

const $ = (id) => document.getElementById(id);
const el = {
  level: $("level"),
  timer: $("timer"),
  progress: $("progress"),
  sb: $("sb"),
  bb: $("bb"),
  next: $("next"),
  toggle: $("toggle"),
  prev: $("prev"),
  nextBtn: $("nextBtn"),
  reset: $("reset"),
  panel: $("panel"),
  panelToggle: $("panelToggle"),
  structureList: $("structureList"),
  addLevel: $("addLevel"),
  addBreak: $("addBreak"),
  applyStructure: $("applyStructure"),
  defaultStructure: $("defaultStructure"),
  panelError: $("panelError"),
  saveName: $("saveName"),
  saveStructure: $("saveStructure"),
  savedList: $("savedList"),
  loadSaved: $("loadSaved"),
  deleteSaved: $("deleteSaved"),
};

const clone = (levels) => levels.map((l) => ({ ...l }));

function isValidStructure(levels) {
  return (
    Array.isArray(levels) &&
    levels.length > 0 &&
    levels.every(
      (l) =>
        l && Number.isFinite(l.minutes) && l.minutes > 0 &&
        (l.break || (Number.isFinite(l.sb) && Number.isFinite(l.bb) && l.sb > 0 && l.bb > 0))
    )
  );
}

function loadStructure() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidStructure(saved)) return saved;
  } catch {
    // Corrupt or unavailable storage; fall back to default.
  }
  return clone(DEFAULT_LEVELS);
}

function saveStructure(levels) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  } catch {
    // Storage unavailable (e.g. private mode); structure still applies for this session.
  }
}

let levels = loadStructure();
let draft = clone(levels);
let levelIndex = 0;
let remainingMs = levels[0].minutes * 60_000;
let running = false;
let endTime = 0;
let tickHandle = null;

const fmtChips = (n) => n.toLocaleString("en-US");

function fmtTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function blindNumber(list, index) {
  return list.slice(0, index + 1).filter((l) => !l.break).length;
}

// ---------- Board ----------

function render() {
  const lvl = levels[levelIndex];
  const totalMs = lvl.minutes * 60_000;

  el.level.textContent = lvl.break ? "Break" : `Level ${blindNumber(levels, levelIndex)}`;
  el.level.classList.toggle("break", !!lvl.break);

  el.sb.textContent = lvl.break ? "—" : fmtChips(lvl.sb);
  el.bb.textContent = lvl.break ? "—" : fmtChips(lvl.bb);

  el.timer.textContent = fmtTime(remainingMs);
  el.timer.classList.toggle("warning", remainingMs <= WARNING_SECONDS * 1000);
  el.timer.classList.toggle("paused", !running);
  el.progress.style.width = `${Math.min(100, (1 - remainingMs / totalMs) * 100)}%`;

  const upcoming = levels.slice(levelIndex + 1).find((l) => !l.break);
  const nextIsBreak = levels[levelIndex + 1]?.break;
  if (!upcoming) {
    el.next.textContent = "Final level";
  } else {
    el.next.textContent =
      (nextIsBreak ? "Break next · then " : "Next: ") +
      `${fmtChips(upcoming.sb)} / ${fmtChips(upcoming.bb)}`;
  }

  el.toggle.textContent = running ? "Pause" : "Start";
  document.title = `${fmtTime(remainingMs)} · ${el.level.textContent}`;

  el.structureList.querySelectorAll(".structure-row").forEach((row, i) => {
    row.classList.toggle("current", i === levelIndex);
  });
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.3);
    });
  } catch {
    // Audio not available; ignore.
  }
}

function setLevel(index) {
  levelIndex = Math.min(Math.max(index, 0), levels.length - 1);
  remainingMs = levels[levelIndex].minutes * 60_000;
  if (running) endTime = Date.now() + remainingMs;
  render();
}

function tick() {
  remainingMs = endTime - Date.now();
  if (remainingMs <= 0) {
    beep();
    if (levelIndex < levels.length - 1) {
      setLevel(levelIndex + 1);
    } else {
      remainingMs = 0;
      pause();
    }
  }
  render();
}

function start() {
  if (running) return;
  running = true;
  endTime = Date.now() + remainingMs;
  tickHandle = setInterval(tick, 250);
  render();
}

function pause() {
  if (!running) return;
  running = false;
  clearInterval(tickHandle);
  remainingMs = Math.max(0, endTime - Date.now());
  render();
}

// ---------- Structure panel ----------

function setPanelOpen(open) {
  el.panel.classList.toggle("open", open);
  el.panelToggle.setAttribute("aria-expanded", String(open));
}

function numberInput(value, onChange, label) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.value = value ?? "";
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => {
    const n = Number(input.value);
    input.classList.toggle("invalid", !(input.value !== "" && Number.isFinite(n) && n > 0));
    onChange(n);
  });
  return input;
}

function renderStructure() {
  el.structureList.replaceChildren();

  draft.forEach((lvl, i) => {
    const row = document.createElement("li");
    row.className = "structure-row";

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = lvl.break ? "—" : `L${blindNumber(draft, i)}`;
    row.append(num);

    if (lvl.break) {
      const label = document.createElement("span");
      label.className = "break-label";
      label.textContent = "Break";
      row.append(label);
    } else {
      row.append(
        numberInput(lvl.sb, (n) => (lvl.sb = n), `Level ${i + 1} small blind`),
        numberInput(lvl.bb, (n) => (lvl.bb = n), `Level ${i + 1} big blind`)
      );
    }

    row.append(numberInput(lvl.minutes, (n) => (lvl.minutes = n), `Level ${i + 1} minutes`));

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "✕";
    remove.title = "Remove";
    remove.addEventListener("click", () => {
      draft.splice(i, 1);
      renderStructure();
    });
    row.append(remove);

    el.structureList.append(row);
  });

  showMessage("");
  render();
}

function addLevel() {
  const last = [...draft].reverse().find((l) => !l.break);
  const minutes = last?.minutes ?? 20;
  const sb = last ? last.sb * 2 : 100;
  const bb = last ? last.bb * 2 : 200;
  draft.push({ sb, bb, minutes });
  renderStructure();
  el.structureList.lastElementChild?.scrollIntoView({ block: "nearest" });
}

function addBreak() {
  draft.push({ break: true, minutes: 10 });
  renderStructure();
  el.structureList.lastElementChild?.scrollIntoView({ block: "nearest" });
}

function showMessage(text, ok = false) {
  el.panelError.textContent = text;
  el.panelError.classList.toggle("ok", ok);
}

// Returns an error message for the draft, or "" if it is valid.
function draftError() {
  if (!draft.length) return "Add at least one level.";
  if (!isValidStructure(draft)) return "All blinds and minutes must be positive numbers.";
  const bad = draft.findIndex((l) => !l.break && l.bb < l.sb);
  if (bad !== -1) return `Level ${blindNumber(draft, bad)}: big blind must be ≥ small blind.`;
  return "";
}

function applyStructure() {
  const error = draftError();
  if (error) {
    showMessage(error);
    return;
  }

  const prevDuration = levels[levelIndex].minutes;
  levels = clone(draft);
  saveStructure(levels);

  levelIndex = Math.min(levelIndex, levels.length - 1);
  if (levels[levelIndex].minutes !== prevDuration) {
    // Current level's length changed: restart it with the new length.
    setLevel(levelIndex);
  }
  renderStructure();
  showMessage("Structure applied.", true);
}

function loadDefault() {
  draft = clone(DEFAULT_LEVELS);
  renderStructure();
  showMessage("Default loaded. Click Apply to use it.", true);
}

// ---------- Saved structures (localStorage) ----------

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      return Object.fromEntries(Object.entries(saved).filter(([, lv]) => isValidStructure(lv)));
    }
  } catch {
    // Corrupt or unavailable storage.
  }
  return {};
}

function writeSaved(saved) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

function renderSavedList(selected) {
  const names = Object.keys(readSaved()).sort((a, b) => a.localeCompare(b));
  el.savedList.replaceChildren(
    ...(names.length
      ? names.map((name) => new Option(name, name, false, name === selected))
      : [new Option("No saved structures", "")])
  );
  el.savedList.disabled = el.loadSaved.disabled = el.deleteSaved.disabled = !names.length;
}

function saveNamed() {
  const name = el.saveName.value.trim();
  if (!name) {
    showMessage("Enter a name to save the structure.");
    el.saveName.focus();
    return;
  }
  const error = draftError();
  if (error) {
    showMessage(error);
    return;
  }
  const saved = readSaved();
  if (saved[name] && !confirm(`Overwrite saved structure "${name}"?`)) return;
  saved[name] = clone(draft);
  if (!writeSaved(saved)) {
    showMessage("Could not save: browser storage is unavailable.");
    return;
  }
  renderSavedList(name);
  showMessage(`Saved "${name}".`, true);
}

function loadNamed() {
  const name = el.savedList.value;
  const lv = readSaved()[name];
  if (!lv) {
    showMessage("Saved structure not found.");
    renderSavedList();
    return;
  }
  draft = clone(lv);
  el.saveName.value = name;
  renderStructure();
  showMessage(`Loaded "${name}". Click Apply to use it.`, true);
}

function deleteNamed() {
  const name = el.savedList.value;
  if (!name || !confirm(`Delete saved structure "${name}"?`)) return;
  const saved = readSaved();
  delete saved[name];
  writeSaved(saved);
  renderSavedList();
  showMessage(`Deleted "${name}".`, true);
}

// ---------- Events ----------

el.toggle.addEventListener("click", () => (running ? pause() : start()));
el.prev.addEventListener("click", () => setLevel(levelIndex - 1));
el.nextBtn.addEventListener("click", () => setLevel(levelIndex + 1));
el.reset.addEventListener("click", () => setLevel(levelIndex));

el.panelToggle.addEventListener("click", () => setPanelOpen(!el.panel.classList.contains("open")));
el.addLevel.addEventListener("click", addLevel);
el.addBreak.addEventListener("click", addBreak);
el.applyStructure.addEventListener("click", applyStructure);
el.defaultStructure.addEventListener("click", loadDefault);
el.saveStructure.addEventListener("click", saveNamed);
el.loadSaved.addEventListener("click", loadNamed);
el.deleteSaved.addEventListener("click", deleteNamed);

document.addEventListener("keydown", (e) => {
  // Don't hijack keys while editing the structure.
  if (e.target === el.saveName) {
    if (e.key === "Enter") saveNamed();
    return;
  }
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) applyStructure();
    return;
  }
  if (e.code === "Space") { e.preventDefault(); running ? pause() : start(); }
  else if (e.key === "ArrowRight") setLevel(levelIndex + 1);
  else if (e.key === "ArrowLeft") setLevel(levelIndex - 1);
  else if (e.key === "r" || e.key === "R") setLevel(levelIndex);
  else if (e.key === "s" || e.key === "S") setPanelOpen(!el.panel.classList.contains("open"));
  else if (e.key === "Escape") setPanelOpen(false);
  else if (e.key === "f" || e.key === "F") {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  }
});

renderStructure();
renderSavedList();
