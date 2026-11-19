// Default blind structure. The page always opens with this.
// `minutes` is the level length. Use `break: true` (no blinds) for a break.
const DEFAULT_LEVELS = [
  { minutes: 13, sb: 100,   bb: 200 },
  { minutes: 13, sb: 200,   bb: 300 },
  { minutes: 13, sb: 200,   bb: 400 },
  { minutes: 13, sb: 300,   bb: 600 },
  { minutes: 13, sb: 400,   bb: 800 },
  { minutes: 13, sb: 500,   bb: 1000 },
  { minutes: 13, sb: 1000,  bb: 1500 },
  { minutes: 5,  break: true },
  { minutes: 12, sb: 1000,  bb: 2000 },
  { minutes: 12, sb: 1500,  bb: 3000 },
  { minutes: 12, sb: 2000,  bb: 4000 },
  { minutes: 11, sb: 3000,  bb: 6000 },
  { minutes: 11, sb: 4000,  bb: 8000 },
  { minutes: 11, sb: 5000,  bb: 10000 },
  { minutes: 11, sb: 10000, bb: 20000 },
  { minutes: 9,  sb: 15000, bb: 30000 },
  { minutes: 9,  sb: 20000, bb: 40000 },
  { minutes: 9,  sb: 30000, bb: 60000 },
];

const WARNING_SECONDS = 60;
// Older versions remembered the last applied structure here; it is now cleared on start-up
// so the page always opens with the default structure.
const LEGACY_STRUCTURE_KEY = "tournament-board.structure";
const SAVED_KEY = "tournament-board.saved-structures";

const $ = (id) => document.getElementById(id);
const el = {
  level: $("level"),
  timer: $("timer"),
  breakInfo: $("breakInfo"),
  breakTime: $("breakTime"),
  progress: $("progress"),
  seek: $("seek"),
  sb: $("sb"),
  bb: $("bb"),
  next: $("next"),
  toggle: $("toggle"),
  prev: $("prev"),
  nextBtn: $("nextBtn"),
  panel: $("panel"),
  panelToggle: $("panelToggle"),
  panelClose: $("panelClose"),
  structureList: $("structureList"),
  addLevel: $("addLevel"),
  addBreak: $("addBreak"),
  applyStructure: $("applyStructure"),
  defaultStructure: $("defaultStructure"),
  panelError: $("panelError"),
  newStructure: $("newStructure"),
  structureEmpty: $("structureEmpty"),
  copyLink: $("copyLink"),
  toast: $("toast"),
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

let levels = clone(DEFAULT_LEVELS); // a shared link can override this in init()
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

function fmtHms(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

// Time until the next break starts: what's left of the current level plus every
// level before the next break. During a break it counts to the break after it.
// Returns null when there are no more breaks.
function msUntilNextBreak() {
  const nextBreak = levels.findIndex((l, i) => i > levelIndex && l.break);
  if (nextBreak === -1) return null;
  let ms = Math.max(0, remainingMs);
  for (let i = levelIndex + 1; i < nextBreak; i++) ms += levels[i].minutes * 60_000;
  return ms;
}

function renderNextBreak() {
  const ms = msUntilNextBreak();
  el.breakInfo.classList.toggle("hidden", ms === null);
  if (ms !== null) {
    el.breakTime.textContent = fmtHms(ms);
    el.breakInfo.setAttribute("aria-label", `Next break in ${fmtHms(ms)}`);
  }
}

function render() {
  const lvl = levels[levelIndex];
  const totalMs = lvl.minutes * 60_000;

  el.level.textContent = lvl.break ? "Break" : `Level ${blindNumber(levels, levelIndex)}`;
  el.level.classList.toggle("break", !!lvl.break);

  el.sb.textContent = lvl.break ? "—" : fmtChips(lvl.sb);
  el.bb.textContent = lvl.break ? "—" : fmtChips(lvl.bb);

  el.timer.textContent = fmtTime(remainingMs);
  renderNextBreak();
  el.timer.classList.toggle("warning", remainingMs <= WARNING_SECONDS * 1000);
  el.timer.classList.toggle("paused", !running);
  const elapsedSec = Math.round((totalMs - Math.max(0, remainingMs)) / 1000);
  el.seek.style.setProperty("--p", `${Math.min(100, Math.max(0, (1 - remainingMs / totalMs) * 100))}%`);
  el.seek.setAttribute("aria-valuemax", String(totalMs / 1000));
  el.seek.setAttribute("aria-valuenow", String(elapsedSec));
  el.seek.setAttribute("aria-valuetext", `${fmtTime(remainingMs)} remaining`);

  const upcoming = levels.slice(levelIndex + 1).find((l) => !l.break);
  const nextIsBreak = levels[levelIndex + 1]?.break;
  if (!upcoming) {
    el.next.textContent = "Final level";
  } else {
    el.next.textContent =
      (nextIsBreak ? "Break next · then " : "Next: ") +
      `${fmtChips(upcoming.sb)} / ${fmtChips(upcoming.bb)}`;
  }

  el.toggle.classList.toggle("running", running);
  el.toggle.setAttribute("aria-label", running ? "Pause" : "Start");
  el.toggle.title = running ? "Pause (Space)" : "Start (Space)";
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

// Within this much of the start of a level, "previous" goes back a level
// instead of restarting the current one (like a music player's back button).
const RESTART_GRACE_MS = 1000;

function elapsedMs() {
  const totalMs = levels[levelIndex].minutes * 60_000;
  const left = running ? endTime - Date.now() : remainingMs;
  return totalMs - left;
}

// Manual level changes stop the clock; press Start to resume.
// (Automatic advance at the end of a level keeps running — see tick().)
function previous() {
  const goBack = elapsedMs() < RESTART_GRACE_MS;
  pause();
  setLevel(goBack ? levelIndex - 1 : levelIndex);
}

function next() {
  pause();
  setLevel(levelIndex + 1);
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
  // Text input (not type="number") so there are no spinner buttons and the
  // mouse wheel / arrow keys can't change values by accident.
  // inputmode="numeric" still brings up the number keypad on phones.
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.value = value ?? "";
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => {
    // Allow digits only (drops letters, commas, signs, decimals).
    const digits = input.value.replace(/\D/g, "");
    if (digits !== input.value) {
      const caret = input.selectionStart - (input.value.length - digits.length);
      input.value = digits;
      input.setSelectionRange(Math.max(0, caret), Math.max(0, caret));
    }
    const n = digits === "" ? NaN : Number(digits);
    input.classList.toggle("invalid", !(n > 0));
    onChange(n);
  });

  // Clear the field on focus so a new number can be typed straight away.
  // The old value stays visible as a placeholder, and comes back if the
  // field is left empty (blur, Enter, or Esc).
  let previous = "";
  const restoreIfEmpty = () => {
    if (input.value !== "") return;
    input.value = previous;
    const n = previous === "" ? NaN : Number(previous);
    input.classList.toggle("invalid", !(n > 0));
    onChange(n);
  };
  input.addEventListener("focus", () => {
    previous = input.value;
    input.placeholder = previous;
    input.value = "";
  });
  input.addEventListener("blur", () => {
    restoreIfEmpty();
    input.placeholder = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") restoreIfEmpty(); // then the document handler applies
    else if (e.key === "Escape") {
      input.value = "";
      restoreIfEmpty();
      input.blur();
    }
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

    row.append(
      numberInput(lvl.minutes, (n) => { lvl.minutes = n; updateTotals(); }, `Level ${i + 1} minutes`)
    );

    const total = document.createElement("span");
    total.className = "total";
    row.append(total);

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

  updateTotals();
  el.structureEmpty.classList.toggle("show", draft.length === 0);
  showMessage("");
  render();
}

// Running total in each row: elapsed tournament time at the end of that level, as hh:mm.
// Shows --:-- from the first row with an invalid time onwards.
function fmtHoursMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function updateTotals() {
  const cells = el.structureList.querySelectorAll(".structure-row .total");
  let sum = 0;
  draft.forEach((lvl, i) => {
    if (!cells[i]) return;
    sum = lvl.minutes > 0 && Number.isFinite(sum) ? sum + lvl.minutes : NaN;
    cells[i].textContent = Number.isFinite(sum) ? fmtHoursMinutes(sum) : "--:--";
  });
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

// Returns an error message for a structure, or "" if it is valid.
function structureError(list) {
  if (!list.length) return "Add at least one level.";
  if (!isValidStructure(list)) return "All blinds and minutes must be positive numbers.";
  const bad = list.findIndex((l) => !l.break && l.bb < l.sb);
  if (bad !== -1) return `Level ${blindNumber(list, bad)}: big blind must be ≥ small blind.`;
  return "";
}

const draftError = () => structureError(draft);

function applyStructure() {
  const error = draftError();
  if (error) {
    showMessage(error);
    return;
  }

  const prevDuration = levels[levelIndex].minutes;
  levels = clone(draft);

  levelIndex = Math.min(levelIndex, levels.length - 1);
  if (levels[levelIndex].minutes !== prevDuration) {
    // Current level's length changed: restart it with the new length.
    setLevel(levelIndex);
  }
  renderStructure();
  showMessage("Structure applied.", true);
}

// Empty editor for building a structure from scratch. Nothing changes on the
// board until Apply; the name field is cleared so Save doesn't overwrite the
// previously loaded structure.
function newStructure() {
  draft = [];
  el.saveName.value = "";
  renderStructure();
  showMessage("New structure. Add levels, then Apply.", true);
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

// ---------- Seekable timer bar ----------

// Sets the time remaining in the current level, keeping the clock running if it was.
// Clamped to at least 1 second so seeking to the very end doesn't skip the level.
function seekTo(newRemainingMs) {
  const totalMs = levels[levelIndex].minutes * 60_000;
  const snapped = Math.round(newRemainingMs / 1000) * 1000;
  remainingMs = Math.min(totalMs, Math.max(1000, snapped));
  if (running) endTime = Date.now() + remainingMs;
  render();
}

function seekToPointer(e) {
  const rect = el.seek.getBoundingClientRect();
  const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  seekTo(levels[levelIndex].minutes * 60_000 * (1 - fraction));
}

let dragPointer = null;

// Stop mouse clicks from focusing the bar, so no focus box appears.
// Keyboard users can still Tab to it.
el.seek.addEventListener("mousedown", (e) => e.preventDefault());

el.seek.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  dragPointer = e.pointerId;
  try { el.seek.setPointerCapture(e.pointerId); } catch { /* keep working without capture */ }
  el.seek.classList.add("dragging");
  seekToPointer(e);
});
el.seek.addEventListener("pointermove", (e) => {
  if (e.pointerId === dragPointer) seekToPointer(e);
});
function endDrag(e) {
  if (e.pointerId !== dragPointer) return;
  dragPointer = null;
  el.seek.classList.remove("dragging");
  // Release focus after a mouse/touch drag so ←/→ go back to changing levels.
  // (Keyboard seeking is for when the bar is reached with Tab.)
  el.seek.blur();
}
el.seek.addEventListener("pointerup", endDrag);
el.seek.addEventListener("pointercancel", endDrag);

// Keyboard on the focused bar: ←/→ ±10 s, Shift ±1 min, Home/End.
el.seek.addEventListener("keydown", (e) => {
  const step = e.shiftKey ? 60_000 : 10_000;
  const left = running ? endTime - Date.now() : remainingMs;
  const actions = {
    ArrowRight: () => seekTo(left - step),
    ArrowUp: () => seekTo(left - step),
    ArrowLeft: () => seekTo(left + step),
    ArrowDown: () => seekTo(left + step),
    Home: () => seekTo(Infinity),
    End: () => seekTo(0),
  };
  if (actions[e.key]) {
    e.preventDefault();
    e.stopPropagation(); // don't also change level via the global shortcuts
    actions[e.key]();
  }
});

// ---------- Shareable link (query parameters) ----------
//
//   ?s=100-200-20_200-400-20_b10_300-600-20&l=2&t=754
//
//   s  structure: levels joined by "_"; a level is "sb-bb-minutes", a break is "b<minutes>"
//   l  current level, 1-based position in the structure (breaks count)
//   t  seconds remaining in the current level
//
// A link always opens paused, so whoever opens it can start the clock.

function encodeStructure(list) {
  return list.map((l) => (l.break ? `b${l.minutes}` : `${l.sb}-${l.bb}-${l.minutes}`)).join("_");
}

function decodeStructure(str) {
  const list = [];
  for (const part of str.split("_")) {
    let m;
    if ((m = /^b(\d{1,4})$/.exec(part))) list.push({ break: true, minutes: Number(m[1]) });
    else if ((m = /^(\d{1,12})-(\d{1,12})-(\d{1,4})$/.exec(part))) {
      list.push({ sb: Number(m[1]), bb: Number(m[2]), minutes: Number(m[3]) });
    } else return null;
  }
  return structureError(list) ? null : list;
}

function currentRemainingMs() {
  return Math.max(0, running ? endTime - Date.now() : remainingMs);
}

function stateUrl() {
  const url = new URL(location.href);
  url.hash = "";
  url.search = new URLSearchParams({
    s: encodeStructure(levels),
    l: String(levelIndex + 1),
    t: String(Math.ceil(currentRemainingMs() / 1000)),
  }).toString();
  return url.toString();
}

// Reads ?s, ?l, ?t on page load. Invalid parts are ignored (with a notice).
function applyUrlState() {
  const params = new URLSearchParams(location.search);
  if (!["s", "l", "t"].some((k) => params.has(k))) return;
  const problems = [];

  if (params.has("s")) {
    const list = decodeStructure(params.get("s"));
    if (list) {
      levels = list;
      draft = clone(levels);
    } else problems.push("structure");
  }

  levelIndex = 0;
  if (params.has("l")) {
    const l = Number(params.get("l"));
    if (Number.isInteger(l) && l >= 1 && l <= levels.length) levelIndex = l - 1;
    else problems.push("level");
  }

  const totalMs = levels[levelIndex].minutes * 60_000;
  remainingMs = totalMs;
  if (params.has("t")) {
    const t = Number(params.get("t"));
    if (Number.isInteger(t) && t >= 0 && t * 1000 <= totalMs) remainingMs = t * 1000;
    else problems.push("timer");
  }

  // Drop the parameters so a reload doesn't jump back to this snapshot.
  history.replaceState(null, "", location.pathname);

  showToast(problems.length
    ? `Opened shared link, but ignored invalid ${problems.join(", ")}.`
    : "Opened shared link. Press play to start.");
}

let toastTimer = null;
function showToast(text) {
  el.toast.textContent = text;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 3000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (e.g. insecure context); fall back to a hidden textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

async function copyLink() {
  const url = stateUrl();
  if (await copyText(url)) showToast("Link copied: level, timer and structure.");
  else prompt("Copy this link:", url);
}

// ---------- Events ----------

el.toggle.addEventListener("click", () => (running ? pause() : start()));
el.prev.addEventListener("click", previous);
el.nextBtn.addEventListener("click", next);

el.panelToggle.addEventListener("click", () => setPanelOpen(!el.panel.classList.contains("open")));
el.panelClose.addEventListener("click", () => setPanelOpen(false));
el.addLevel.addEventListener("click", addLevel);
el.addBreak.addEventListener("click", addBreak);
el.applyStructure.addEventListener("click", applyStructure);
el.defaultStructure.addEventListener("click", loadDefault);
el.newStructure.addEventListener("click", newStructure);
el.saveStructure.addEventListener("click", saveNamed);
el.loadSaved.addEventListener("click", loadNamed);
el.deleteSaved.addEventListener("click", deleteNamed);
el.copyLink.addEventListener("click", copyLink);

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
  // Leave browser shortcuts (Ctrl/Cmd+L, +S, +F, ...) alone.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "Space") { e.preventDefault(); running ? pause() : start(); }
  else if (e.key === "ArrowRight") next();
  else if (e.key === "ArrowLeft") previous();
  else if (e.key === "l" || e.key === "L") copyLink();
  else if (e.key === "s" || e.key === "S") setPanelOpen(!el.panel.classList.contains("open"));
  else if (e.key === "Escape") setPanelOpen(false);
  else if (e.key === "f" || e.key === "F") {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  }
});

// ---------- Start-up ----------

function init() {
  try { localStorage.removeItem(LEGACY_STRUCTURE_KEY); } catch { /* storage unavailable */ }
  applyUrlState(); // a shared link replaces the default structure/level/time
  renderStructure();
  renderSavedList();
}

init();
