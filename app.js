import {
  TimecodeError,
  calculateDuration,
  formatSignedFrames,
  formatTimecode,
  parseTimecode,
  roundTimecode,
} from "./timecode.js";

const DEFAULTS = Object.freeze({ fps: 25, outputFormat: "hh:mm:ss:ff", offset: "+10", interval: "5", direction: "up", autoCopy: false, includeEnd: false });
const STORAGE_KEY = "what-is-24-plus-1.preferences.v1";
const panels = [...document.querySelectorAll(".panel")];
const tabs = [...document.querySelectorAll('[role="tab"]')];
const resultValue = document.querySelector("#result-value");
const resultFeedback = document.querySelector("#result-feedback");
const copyButton = document.querySelector("#copy-button");
const outputFormat = document.querySelector("#output-format");
let activeMode = "round";
let currentResult = null;
let copyResetTimer = null;

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return { ...DEFAULTS };
    return {
      fps: [24, 25, 30, 50, 60].includes(saved.fps) ? saved.fps : DEFAULTS.fps,
      outputFormat: ["hh:mm:ss:ff", "hh:mm:ss", "mm:ss"].includes(saved.outputFormat) ? saved.outputFormat : DEFAULTS.outputFormat,
      offset: /^[+-]?\d+$/.test(saved.offset) ? saved.offset : DEFAULTS.offset,
      interval: /^\d+$/.test(saved.interval) && Number(saved.interval) > 0 ? saved.interval : DEFAULTS.interval,
      direction: ["up", "down", "nearest", "none"].includes(saved.direction) ? saved.direction : DEFAULTS.direction,
      autoCopy: typeof saved.autoCopy === "boolean" ? saved.autoCopy : DEFAULTS.autoCopy,
      includeEnd: typeof saved.includeEnd === "boolean" ? saved.includeEnd : DEFAULTS.includeEnd,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function savePreferences() {
  const round = document.querySelector("#panel-round");
  const data = {
    fps: getFps(),
    outputFormat: outputFormat.value,
    offset: round.elements.offset.value,
    interval: round.elements.interval.value,
    direction: round.elements.direction.value,
    autoCopy: document.querySelector(".auto-copy").checked,
    includeEnd: document.querySelector("#include-end").checked,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* Calculation remains available. */ }
}

function buildSharedControls() {
  const rateTemplate = document.querySelector("#frame-rate-template");
  const submitTemplate = document.querySelector("#submit-template");
  document.querySelectorAll(".frame-rate-field").forEach((target) => {
    target.append(rateTemplate.content.cloneNode(true));
    const mode = target.closest(".panel").id.replace("panel-", "");
    const select = target.querySelector(".frame-rate-select");
    const help = target.querySelector(".frame-rate-help");
    select.id = `${mode}-frame-rate`;
    help.id = `${mode}-frame-rate-help`;
    target.querySelector("label").htmlFor = select.id;
    const button = target.querySelector(".help-button");
    button.setAttribute("aria-controls", help.id);
  });
  document.querySelectorAll(".submit-row").forEach((target) => target.append(submitTemplate.content.cloneNode(true)));
}

function applyPreferences(preferences) {
  document.querySelectorAll(".frame-rate-select").forEach((select) => { select.value = String(preferences.fps); });
  document.querySelectorAll(".auto-copy").forEach((checkbox) => { checkbox.checked = preferences.autoCopy; });
  outputFormat.value = preferences.outputFormat;
  const round = document.querySelector("#panel-round");
  round.elements.offset.value = preferences.offset;
  round.elements.interval.value = preferences.interval;
  round.elements.direction.value = preferences.direction;
  document.querySelector("#include-end").checked = preferences.includeEnd;
  document.querySelector("#cross-midnight").checked = false;
  updateIntervalState();
}

function getFps() { return Number(document.querySelector(".frame-rate-select").value); }
function activePanel() { return document.querySelector(`#panel-${activeMode}`); }

function syncShared(selector, property, value, source) {
  document.querySelectorAll(selector).forEach((element) => {
    if (element !== source) element[property] = value;
  });
}

function clearErrors(panel = activePanel()) {
  panel.querySelectorAll(".error").forEach((node) => { node.textContent = ""; });
  panel.querySelectorAll("[aria-invalid]").forEach((node) => node.removeAttribute("aria-invalid"));
}

function invalidateResult() {
  currentResult = null;
  resultValue.value = "—";
  resultValue.textContent = "—";
  resultFeedback.textContent = "";
  copyButton.disabled = true;
  copyButton.textContent = "Copy";
  clearTimeout(copyResetTimer);
}

function showError(field, error) {
  field.setAttribute("aria-invalid", "true");
  const described = (field.getAttribute("aria-describedby") || "").split(" ");
  const errorNode = described.map((id) => document.getElementById(id)).find((node) => node?.classList.contains("error"));
  if (errorNode) errorNode.textContent = error.message;
}

function parseIntegerField(field, kind) {
  const value = field.value.trim();
  const pattern = kind === "offset" ? /^[+-]?\d+$/ : /^\d+$/;
  const number = Number(value);
  if (!pattern.test(value) || !Number.isSafeInteger(number) || (kind === "interval" && number <= 0)) {
    throw new TimecodeError(kind, kind === "offset" ? "Enter a whole number of seconds." : "Enter a positive whole number of seconds.");
  }
  return number;
}

function compute() {
  const panel = activePanel();
  const fps = getFps();
  if (activeMode === "format") {
    const field = panel.elements.timecode;
    try { return { frames: parseTimecode(field.value, fps), notes: [] }; }
    catch (error) { error.field = field; throw error; }
  }
  if (activeMode === "round") {
    const timecodeField = panel.elements.timecode;
    let frames;
    try { frames = parseTimecode(timecodeField.value, fps); }
    catch (error) { error.field = timecodeField; throw error; }
    let offset;
    try { offset = parseIntegerField(panel.elements.offset, "offset"); }
    catch (error) { error.field = panel.elements.offset; throw error; }
    const direction = panel.elements.direction.value;
    let interval = 1;
    if (direction !== "none") {
      try { interval = parseIntegerField(panel.elements.interval, "interval"); }
      catch (error) { error.field = panel.elements.interval; throw error; }
    }
    let rounded;
    try { rounded = roundTimecode(frames, fps, { offsetSeconds: offset, intervalSeconds: interval, direction }); }
    catch (error) { error.field = error.code === "negative" ? timecodeField : panel.elements.offset; throw error; }
    const delta = rounded - frames;
    let note = "No change";
    if (delta !== 0 && delta % fps === 0) note = `${Math.abs(delta / fps)} ${Math.abs(delta / fps) === 1 ? "second" : "seconds"} ${delta > 0 ? "added" : "removed"}`;
    else if (delta !== 0) note = `${delta > 0 ? "Added" : "Removed"} ${formatTimecode(Math.abs(delta), fps)}`;
    return { frames: rounded, notes: [note], delta: formatSignedFrames(delta, fps) };
  }

  const startField = panel.elements.start;
  const endField = panel.elements.end;
  let start;
  let end;
  try { start = parseTimecode(startField.value, fps); }
  catch (error) { error.field = startField; throw error; }
  try { end = parseTimecode(endField.value, fps); }
  catch (error) { error.field = endField; throw error; }
  const includeEndFrame = document.querySelector("#include-end").checked;
  const crossMidnight = document.querySelector("#cross-midnight").checked;
  let frames;
  try { frames = calculateDuration(start, end, fps, { includeEndFrame, crossMidnight }); }
  catch (error) { error.field = error.code === "midnight-range" && start >= 24 * 3600 * fps ? startField : endField; throw error; }
  const notes = [];
  if (crossMidnight && end < start) notes.push("Crosses midnight");
  if (includeEndFrame) notes.push("End frame included");
  return { frames, notes };
}

function renderResult(result) {
  currentResult = { ...result, fps: getFps() };
  resultValue.value = formatTimecode(result.frames, currentResult.fps, outputFormat.value);
  resultValue.textContent = resultValue.value;
  const notes = [...result.notes];
  if (outputFormat.value !== "hh:mm:ss:ff" && result.frames % currentResult.fps !== 0) notes.push("Frames omitted in this format.");
  resultFeedback.textContent = notes.join(" · ");
  copyButton.disabled = false;
}

function calculate({ submitted = false } = {}) {
  clearErrors();
  try {
    renderResult(compute());
    return true;
  } catch (error) {
    invalidateResult();
    if (submitted && error instanceof TimecodeError && error.field) {
      showError(error.field, error);
      error.field.focus();
    }
    return false;
  }
}

async function copyResult() {
  if (!currentResult) return;
  try {
    await navigator.clipboard.writeText(resultValue.value);
    copyButton.textContent = "Copied";
    resultFeedback.setAttribute("aria-live", "polite");
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => { copyButton.textContent = "Copy"; }, 2000);
  } catch {
    resultFeedback.textContent = "Copy failed. Select the result to copy manually.";
  }
}

function updateIntervalState() {
  const panel = document.querySelector("#panel-round");
  panel.elements.interval.disabled = panel.elements.direction.value === "none";
}

function selectTab(index, focus = false) {
  tabs.forEach((tab, tabIndex) => {
    const selected = tabIndex === index;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panels[tabIndex].hidden = !selected;
  });
  activeMode = tabs[index].id.replace("tab-", "");
  clearErrors();
  calculate();
  if (focus) tabs[index].focus();
}

function initEvents() {
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(index));
    tab.addEventListener("keydown", (event) => {
      let next = index;
      if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (index + 1) % tabs.length;
      else if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(next, true);
    });
  });

  panels.forEach((panel) => {
    panel.addEventListener("submit", async (event) => {
      event.preventDefault();
      const valid = calculate({ submitted: true });
      savePreferences();
      if (valid && panel.querySelector(".auto-copy").checked) await copyResult();
    });
    panel.addEventListener("input", (event) => {
      if (event.target.matches('[name="direction"]')) updateIntervalState();
      if (event.target.matches(".auto-copy")) syncShared(".auto-copy", "checked", event.target.checked, event.target);
      clearErrors(panel);
      calculate();
      savePreferences();
    });
  });

  document.querySelectorAll(".frame-rate-select").forEach((select) => {
    select.addEventListener("change", () => {
      syncShared(".frame-rate-select", "value", select.value, select);
      calculate();
      savePreferences();
    });
  });
  outputFormat.addEventListener("change", () => {
    if (currentResult) renderResult(currentResult);
    savePreferences();
  });
  copyButton.addEventListener("click", copyResult);
  document.querySelectorAll(".help-button").forEach((button) => {
    button.addEventListener("click", () => {
      const explicitTarget = button.getAttribute("aria-controls");
      const content = explicitTarget ? document.getElementById(explicitTarget) : button.closest(".field").querySelector(".help-popover");
      const willOpen = content.hidden;
      content.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
    });
  });
}

buildSharedControls();
applyPreferences(loadPreferences());
initEvents();
invalidateResult();
