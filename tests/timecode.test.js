import test from "node:test";
import assert from "node:assert/strict";
import { calculateDuration, formatTimecode, parseTimecode, roundTimecode } from "../timecode.js";

const fps = 25;
const frames = (value, rate = fps) => parseTimecode(value, rate);

test("F01–F05: accepted input shapes normalize correctly", () => {
  assert.equal(formatTimecode(frames("0:44"), fps), "00:00:44:00");
  assert.equal(formatTimecode(frames("1:20"), fps), "00:01:20:00");
  assert.equal(formatTimecode(frames("80"), fps), "00:01:20:00");
  assert.equal(formatTimecode(frames("1:02:03"), fps), "01:02:03:00");
  assert.equal(formatTimecode(frames("00:00:44:12"), fps), "00:00:44:12");
});

test("F06 and F11: output formats preserve internal frames and accumulated hours", () => {
  const value = frames("01:02:03:12");
  assert.equal(formatTimecode(value, fps, "mm:ss"), "62:03");
  assert.equal(formatTimecode(value, fps), "01:02:03:12");
  assert.equal(formatTimecode(frames("25:00:00"), fps), "25:00:00:00");
});

test("F07–F10: invalid syntax and ranges are rejected", () => {
  for (const value of ["1:60", "00:60:00", "00:00:00:25", "", "1::20", "-1", "1;20", "1.5"]) {
    assert.throws(() => frames(value));
  }
  assert.equal(formatTimecode(frames("00:00:00:25", 30), 30), "00:00:00:25");
  assert.throws(() => frames("00:00:00:25", 25));
});

test("R01–R10: round behavior matches acceptance cases", () => {
  const round = (value, options, rate = fps) => formatTimecode(roundTimecode(frames(value, rate), rate, options), rate);
  assert.equal(round("00:00:44:00", { offsetSeconds: 10, intervalSeconds: 5, direction: "up" }), "00:00:55:00");
  assert.equal(round("00:00:05:12", { offsetSeconds: 10, intervalSeconds: 5, direction: "up" }), "00:00:20:00");
  assert.equal(round("00:00:45:00", { offsetSeconds: 10, intervalSeconds: 5, direction: "up" }), "00:00:55:00");
  assert.equal(round("00:00:44:12", { offsetSeconds: 0, intervalSeconds: 5, direction: "down" }), "00:00:40:00");
  assert.equal(round("00:00:42:12", { offsetSeconds: 0, intervalSeconds: 5, direction: "nearest" }), "00:00:40:00");
  assert.equal(round("00:00:42:13", { offsetSeconds: 0, intervalSeconds: 5, direction: "nearest" }), "00:00:45:00");
  assert.equal(round("00:00:42:15", { offsetSeconds: 0, intervalSeconds: 5, direction: "nearest" }, 30), "00:00:45:00");
  assert.equal(round("00:00:44:12", { offsetSeconds: -3, direction: "none" }), "00:00:41:12");
  assert.equal(round("00:00:58:00", { offsetSeconds: 3, intervalSeconds: 5, direction: "up" }), "00:01:05:00");
  assert.equal(round("00:01:00:00", { offsetSeconds: 0, intervalSeconds: 7, direction: "up" }), "00:01:03:00");
});

test("R08 and R11: invalid round parameters are rejected", () => {
  assert.throws(() => roundTimecode(frames("00:00:02:00"), fps, { offsetSeconds: -3, intervalSeconds: 5, direction: "up" }));
  for (const intervalSeconds of [0, -1, 1.5]) {
    assert.throws(() => roundTimecode(frames("10"), fps, { intervalSeconds, direction: "up" }));
  }
  assert.doesNotThrow(() => roundTimecode(frames("10"), fps, { intervalSeconds: 0, direction: "none" }));
});

test("D01–D07: durations, inclusion, and midnight rules", () => {
  const duration = (start, end, options = {}) => formatTimecode(calculateDuration(frames(start), frames(end), fps, options), fps);
  assert.equal(duration("0:44", "1:20"), "00:00:36:00");
  assert.equal(duration("00:00:10:12", "00:00:11:02"), "00:00:00:15");
  assert.equal(duration("10", "10"), "00:00:00:00");
  assert.equal(duration("10", "10", { includeEndFrame: true }), "00:00:00:01");
  assert.throws(() => duration("23:59:58:00", "00:00:03:00"));
  assert.equal(duration("23:59:58:00", "00:00:03:00", { crossMidnight: true }), "00:00:05:00");
  assert.equal(duration("23:59:58:00", "00:00:03:00", { crossMidnight: true, includeEndFrame: true }), "00:00:05:01");
  assert.throws(() => duration("24:00:00:00", "00:00:03:00", { crossMidnight: true }));
  assert.equal(duration("00:00:00:00", "25:00:00:00"), "25:00:00:00");
});

test("all supported frame rates accept F-1 and reject F", () => {
  for (const rate of [24, 25, 30, 50, 60]) {
    assert.doesNotThrow(() => parseTimecode(`00:00:00:${rate - 1}`, rate));
    assert.throws(() => parseTimecode(`00:00:00:${rate}`, rate));
  }
});

test("parse(format(N)) round-trips representative safe frame values", () => {
  for (const rate of [24, 25, 30, 50, 60]) {
    for (const value of [0, 1, rate - 1, rate, rate * 3600 + 7, 25 * rate * 3600 + rate - 1]) {
      assert.equal(parseTimecode(formatTimecode(value, rate), rate), value);
    }
  }
});

test("safe integer overflow is rejected", () => {
  assert.throws(() => parseTimecode(String(Number.MAX_SAFE_INTEGER), 60));
  assert.throws(() => roundTimecode(Number.MAX_SAFE_INTEGER, 60, { offsetSeconds: 1, direction: "none" }));
});
