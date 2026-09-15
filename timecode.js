export const SUPPORTED_FRAME_RATES = Object.freeze([24, 25, 30, 50, 60]);
export const OUTPUT_FORMATS = Object.freeze(["hh:mm:ss:ff", "hh:mm:ss", "mm:ss"]);

export class TimecodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TimecodeError";
    this.code = code;
  }
}

function assertFrameRate(fps) {
  if (!SUPPORTED_FRAME_RATES.includes(fps)) {
    throw new TimecodeError("frame-rate", "Choose a supported frame rate.");
  }
}

function safeInteger(value, code = "range") {
  if (!Number.isSafeInteger(value)) {
    throw new TimecodeError(code, "This value is too large. Enter a smaller timecode.");
  }
  return value;
}

function parseField(value) {
  const parsed = Number(value);
  return safeInteger(parsed);
}

export function parseTimecode(input, fps) {
  assertFrameRate(fps);
  const value = String(input ?? "").trim();

  if (!value) {
    throw new TimecodeError("required", "Enter a timecode.");
  }
  if (!/^\d+(?::\d+){0,3}$/.test(value)) {
    throw new TimecodeError("format", "Use seconds, mm:ss, hh:mm:ss or hh:mm:ss:ff.");
  }

  const parts = value.split(":").map(parseField);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let frames = 0;

  if (parts.length === 1) {
    seconds = parts[0];
  } else if (parts.length === 2) {
    [minutes, seconds] = parts;
  } else if (parts.length === 3) {
    [hours, minutes, seconds] = parts;
  } else {
    [hours, minutes, seconds, frames] = parts;
  }

  if (parts.length >= 3 && minutes > 59) {
    throw new TimecodeError("minutes", "Minutes must be between 00 and 59.");
  }
  if (parts.length >= 2 && seconds > 59) {
    throw new TimecodeError("seconds", "Seconds must be between 00 and 59.");
  }
  if (frames >= fps) {
    throw new TimecodeError("frames", `Frames must be between 00 and ${fps - 1} at ${fps} fps.`);
  }

  const totalSeconds = safeInteger(
    safeInteger(hours * 3600) + safeInteger(minutes * 60) + seconds,
  );
  return safeInteger(safeInteger(totalSeconds * fps) + frames);
}

export function formatTimecode(totalFrames, fps, format = "hh:mm:ss:ff") {
  assertFrameRate(fps);
  if (!OUTPUT_FORMATS.includes(format)) {
    throw new TimecodeError("output-format", "Choose a supported output format.");
  }
  if (!Number.isSafeInteger(totalFrames) || totalFrames < 0) {
    throw new TimecodeError("range", "This value is too large. Enter a smaller timecode.");
  }

  const wholeSeconds = Math.floor(totalFrames / fps);
  const frames = totalFrames % fps;
  const seconds = wholeSeconds % 60;
  const totalMinutes = Math.floor(wholeSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad = (value, size = 2) => String(value).padStart(size, "0");

  if (format === "mm:ss") return `${pad(totalMinutes)}:${pad(seconds)}`;
  if (format === "hh:mm:ss") return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export function roundTimecode(totalFrames, fps, options = {}) {
  assertFrameRate(fps);
  const { offsetSeconds = 0, intervalSeconds = 5, direction = "up" } = options;

  if (!Number.isSafeInteger(totalFrames) || totalFrames < 0) {
    throw new TimecodeError("range", "This value is too large. Enter a smaller timecode.");
  }
  if (!Number.isSafeInteger(offsetSeconds)) {
    throw new TimecodeError("offset", "Enter a whole number of seconds.");
  }
  if (!["up", "down", "nearest", "none"].includes(direction)) {
    throw new TimecodeError("direction", "Choose a rounding direction.");
  }

  const offsetFrames = safeInteger(offsetSeconds * fps);
  const adjusted = safeInteger(totalFrames + offsetFrames);
  if (adjusted < 0) {
    throw new TimecodeError("negative", "The offset would move the timecode below zero.");
  }
  if (direction === "none") return adjusted;
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds <= 0) {
    throw new TimecodeError("interval", "Enter a positive whole number of seconds.");
  }

  const intervalFrames = safeInteger(intervalSeconds * fps);
  const remainder = adjusted % intervalFrames;
  if (remainder === 0) return adjusted;
  if (direction === "down") return adjusted - remainder;

  const upwardDistance = intervalFrames - remainder;
  if (direction === "nearest" && remainder < upwardDistance) {
    return adjusted - remainder;
  }
  return safeInteger(adjusted + upwardDistance);
}

export function calculateDuration(startFrames, endFrames, fps, options = {}) {
  assertFrameRate(fps);
  const { includeEndFrame = false, crossMidnight = false } = options;
  if (![startFrames, endFrames].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new TimecodeError("range", "This value is too large. Enter a smaller timecode.");
  }

  const dayFrames = 24 * 3600 * fps;
  if (crossMidnight && (startFrames >= dayFrames || endFrames >= dayFrames)) {
    throw new TimecodeError("midnight-range", "Cross midnight requires times below 24:00:00:00.");
  }

  let adjustedEnd = endFrames;
  if (endFrames < startFrames) {
    if (!crossMidnight) {
      throw new TimecodeError(
        "end-before-start",
        "End is before Start. Check the values or enable Cross midnight.",
      );
    }
    adjustedEnd = safeInteger(endFrames + dayFrames);
  }

  return safeInteger(adjustedEnd - startFrames + (includeEndFrame ? 1 : 0));
}

export function formatSignedFrames(frameDelta, fps) {
  if (!Number.isSafeInteger(frameDelta)) {
    throw new TimecodeError("range", "This value is too large. Enter a smaller timecode.");
  }
  const sign = frameDelta < 0 ? "−" : "+";
  return `${sign}${formatTimecode(Math.abs(frameDelta), fps)}`;
}
