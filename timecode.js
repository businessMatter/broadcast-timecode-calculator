/* Integer-frame business logic. No DOM, storage or clipboard dependencies. */
(function (root) {
  'use strict';
  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  const RANGE = 'This value is too large. Enter a smaller timecode.';
  const CALC_RANGE = 'The calculation exceeds the supported range. Use smaller values.';
  const FORMAT = 'Use seconds, mm:ss, hh:mm:ss, hh:mm:ss:ff or mm.ss.ff.';
  function fail(message) { throw new Error(message); }
  function safe(n, message = RANGE) { const b = BigInt(n); if (b > MAX || b < -MAX) fail(message); return Number(b); }
  function fpsCheck(fps) { if (![24,25,30,50,60].includes(fps)) fail('Choose a supported integer frame rate.'); }
  function frameCheck(n) { if (!Number.isSafeInteger(n)) fail(RANGE); }
  function parseTimecode(text, fps = 25) {
    fpsCheck(fps); const s = String(text).trim();
    if (!s) fail('Enter a timecode.');
    if (s.includes('.') && s.includes(':')) fail('Do not mix dots and colons in one time value.');
    const dots = s.includes('.');
    if (dots && !/^\d+\.\d+\.\d+$/.test(s)) fail('Use three dot-separated fields: mm.ss.ff.');
    if (!dots && !/^\d+(?::\d+){0,3}$/.test(s)) fail(FORMAT);
    const p = s.split(dots ? '.' : ':').map(v => BigInt(v));
    let h = 0n, m = 0n, sec = 0n, f = 0n;
    if (dots) [m,sec,f] = p;
    else if (p.length === 1) [sec] = p;
    else if (p.length === 2) [m,sec] = p;
    else if (p.length === 3) [h,m,sec] = p;
    else [h,m,sec,f] = p;
    if (!dots && p.length >= 3 && m > 59n) fail('Minutes must be between 00 and 59.');
    if ((dots || p.length > 1) && sec > 59n) fail('Seconds must be between 00 and 59.');
    if (f >= BigInt(fps)) fail(`Frames must be between 00 and ${fps - 1} at ${fps} fps.`);
    return safe(((h * 3600n + m * 60n + sec) * BigInt(fps)) + f);
  }
  function formatTimecode(n, fps = 25, format = 'hh:mm:ss:ff') {
    fpsCheck(fps); frameCheck(n);
    if (!['hh:mm:ss:ff','hh:mm:ss','mm:ss'].includes(format)) fail('Choose a supported output format.');
    const a = BigInt(n < 0 ? -n : n), F = BigInt(fps), secs = a / F;
    const pad = v => String(v).padStart(2, '0');
    let result = format === 'mm:ss' ? `${pad(secs / 60n)}:${pad(secs % 60n)}` : `${pad(secs / 3600n)}:${pad(secs / 60n % 60n)}:${pad(secs % 60n)}`;
    if (format === 'hh:mm:ss:ff') result += ':' + pad(a % F);
    return (n < 0 && (format === 'hh:mm:ss:ff' ? a !== 0n : secs !== 0n) ? '-' : '') + result;
  }
  function integerSeconds(value, positive = false) {
    const s = String(value).trim();
    const message = positive ? 'Enter a positive whole number of seconds.' : 'Enter a whole number of seconds.';
    if (!(positive ? /^\+?\d+$/ : /^[+-]?\d+$/).test(s)) fail(message);
    const n = BigInt(s); if ((positive && n <= 0n) || n > MAX || n < -MAX) fail(message);
    return Number(n);
  }
  function roundTimecode(n, offset, interval, direction, fps = 25) {
    fpsCheck(fps); frameCheck(n); if (n < 0) fail('Enter an unsigned timecode.');
    const o = integerSeconds(offset); const shift = safe(BigInt(o) * BigInt(fps));
    const a = safe(BigInt(n) + BigInt(shift));
    if (a < 0) fail('The offset would move the timecode below zero.');
    if (direction === 'none') return a;
    if (!['up','down','nearest'].includes(direction)) fail('Choose a rounding direction.');
    const k = BigInt(safe(BigInt(integerSeconds(interval, true)) * BigInt(fps)));
    const A = BigInt(a), rem = A % k, lo = A - rem;
    return safe(direction === 'down' || rem === 0n ? lo : direction === 'up' || rem * 2n >= k ? lo + k : lo);
  }
  function calculateDuration(start, end, includeEnd = false, midnight = false, fps = 25) {
    fpsCheck(fps); frameCheck(start); frameCheck(end);
    if (start < 0 || end < 0) fail('Enter an unsigned timecode.');
    const day = 86400 * fps;
    if (midnight && (start >= day || end >= day)) fail('Cross midnight requires times below 24:00:00:00.');
    if (end < start) { if (!midnight) fail('End is before Start. Check the values or enable Cross midnight.'); end += day; }
    return safe(BigInt(end) - BigInt(start) + (includeEnd ? 1n : 0n));
  }
  function item(raw, op, index, start, end, fps, extraError) {
    const it = {raw, op, index, start, end};
    try { if (extraError) fail(extraError); it.frames = parseTimecode(raw, fps); }
    catch (e) { it.error = e.message; }
    return it;
  }
  function result(items, emptyError) { return {items, errors: items.filter(i => i.error).map(i => ({...i, message:i.error})), error: items.length ? null : emptyError}; }
  function parseExpression(text, fps = 25) {
    const s = String(text), items = [];
    if (/[\r\n]/.test(s)) return {items, errors:[], error:'Use Sum list for one time value per line.'};
    if (!s.trim()) return result(items, 'Enter an expression.');
    let pos = 0, op = '+', index = 1;
    while (/\s/.test(s[pos] || '') && pos < s.length) pos++;
    if (/[+\-−]/.test(s[pos])) { op = s[pos] === '+' ? '+' : '-'; pos++; }
    while (true) {
      const begin = pos; while (pos < s.length && !/[+\-−]/.test(s[pos])) pos++;
      const fragment = s.slice(begin, pos), raw = fragment.trim(), start = begin + fragment.indexOf(raw);
      const err = !raw ? (pos === s.length ? 'Enter a time value after the operator.' : 'Use time values separated by a single + or - operator.') : null;
      items.push(item(raw,op,index++,start,pos,fps,err));
      if (pos >= s.length) break;
      op = s[pos] === '+' ? '+' : '-'; pos++;
    }
    return result(items);
  }
  function parseSumList(text, fps = 25) {
    const items = []; let offset = 0;
    String(text).split(/\r\n|\r|\n/).forEach((line, i) => {
      const raw = line.trim();
      if (raw || line.includes('\t')) {
        let err;
        if (line.includes('\t') || /[,;A-Za-z()•]/.test(line)) err = 'Use one unsigned time value per line, without headings, extra columns or notes.';
        else if (/[+\-−]/.test(line)) err = 'Use Expression for subtraction or expressions.';
        items.push(item(raw,'+',i+1,offset,offset+line.length,fps,err));
      }
      offset += line.length + (String(text).slice(offset + line.length,offset + line.length + 2) === '\r\n' ? 2 : 1);
    });
    return result(items, 'Enter at least one time value.');
  }
  function parseReformatList(text, fps = 25) {
    fpsCheck(fps);
    const items = []; let offset = 0;
    String(text).split(/\r\n|\r|\n/).forEach((line, i) => {
      let content = line, lead = 0;
      const whitespace = content.match(/^\s*/)[0].length; content = content.slice(whitespace); lead += whitespace;
      if (/^\|/.test(content)) { const m = content.match(/^\|\s*/)[0]; content = content.slice(m.length); lead += m.length; }
      const marker = content.match(/^(?:[-*•]\s+|\d+[.)]\s+)/);
      if (marker) { content = content.slice(marker[0].length); lead += marker[0].length; }
      const token = content.match(/^[\d:.]+/);
      if (token) {
        const raw = token[0], start = offset + lead;
        items.push(item(raw,'+',i+1,start,start+raw.length,fps));
      }
      offset += line.length + (String(text).slice(offset + line.length,offset + line.length + 2) === '\r\n' ? 2 : 1);
    });
    return result(items, null);
  }
  function calculateTimecodes(parsed) {
    if (parsed.error) fail(parsed.error);
    if (parsed.errors.length) fail(parsed.errors[0].message);
    let total = 0;
    for (const i of parsed.items) { frameCheck(i.frames); total = safe(BigInt(total) + (i.op === '-' ? -BigInt(i.frames) : BigInt(i.frames)), CALC_RANGE); }
    return total;
  }
  const api = {parseTimecode,formatTimecode,integerSeconds,roundTimecode,calculateDuration,parseExpression,parseSumList,parseReformatList,calculateTimecodes};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Timecode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
