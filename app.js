/* UI state and browser effects. The arithmetic lives in timecode.js. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id), T = window.Timecode;
 const tabs = ['reformat','round','duration','calculate'];
 const defaults = {fps:25, format:'hh:mm:ss:ff', offset:'+10', interval:'5', direction:'up', includeEnd:false};
 let prefs = {...defaults};
 try {
  const saved = JSON.parse(localStorage.getItem('timecode-v2') || '{}');
  if ([24,25,30,50,60].includes(saved.fps)) prefs.fps = saved.fps;
  if (['hh:mm:ss:ff','hh:mm:ss','mm:ss'].includes(saved.format)) prefs.format = saved.format;
  for (const k of ['offset','interval']) { try { T.integerSeconds(saved[k], k === 'interval'); prefs[k] = String(saved[k]); } catch {} }
  if (['up','down','nearest','none'].includes(saved.direction)) prefs.direction = saved.direction;
  if (typeof saved.includeEnd === 'boolean') prefs.includeEnd = saved.includeEnd;
 } catch {}
 $('fps').value = prefs.fps; $('format').value = prefs.format;
 $('offset').value = prefs.offset; $('interval').value = prefs.interval;
 document.querySelector(`[name=direction][value=${prefs.direction}]`).checked = true;
 $('include-end').checked = prefs.includeEnd;
 let active = 'reformat', mode = 'expression', frames = null, submitted = false, expanded = false, pasteError = false, composing = false;
 let errors = [], touched = new Set(), copyTimer, revision = 0;
 // Neutral editing hints are separate from submitted validation errors.
 document.querySelectorAll('input[type=text],textarea').forEach(input => {
  const hint = document.createElement('p'); hint.id = input.id + '-editing'; hint.className = 'hint editing-hint';
  input.closest('.field').append(hint);
  input.setAttribute('aria-describedby', (input.getAttribute('aria-describedby') || '') + ' ' + hint.id);
 });
 const fps = () => Number($('fps').value);
 const direction = () => document.querySelector('[name=direction]:checked').value;
 const calcInput = () => $(mode === 'expression' ? 'expression' : 'list');
 function save() {
  // Persist only validated preferences. Invalid temporary edits cannot poison a reload.
  prefs.fps = fps(); prefs.format = $('format').value; prefs.direction = direction();
  prefs.includeEnd = $('include-end').checked;
  for (const k of ['offset','interval']) { try { T.integerSeconds($(k).value,k==='interval'); prefs[k] = $(k).value; } catch {} }
  try { localStorage.setItem('timecode-v2', JSON.stringify(prefs)); } catch {}
 }
 const errorId = id => ({'reformat-input':'reformat-error','round-input':'round-error',expression:'calc-errors',list:'calc-errors'}[id] || id+'-error');
 const previewId = id => ({'reformat-input':'reformat-preview','round-input':'round-preview'}[id] || id+'-preview');
 function addError(id, message, item) { errors.push({id,message,item}); }
 function readTime(id) {
  try { const n = T.parseTimecode($(id).value,fps()); $(previewId(id)).textContent = 'Interpreted as ' + T.formatTimecode(n,fps()); return n; }
  catch (e) { addError(id,e.message); return null; }
 }
 function renderItems(parsed) {
  const box = $('items-preview'), rows = $('item-rows'); rows.replaceChildren();
  box.hidden = !parsed.items.length;
  $('item-column').textContent = mode === 'list' ? 'Line' : 'Item';
  const visible = expanded ? parsed.items : parsed.items.slice(0,5);
  for (const it of visible) {
   const tr = document.createElement('tr');
   const values = [String(it.index),it.op,it.raw,it.error || T.formatTimecode(it.frames,fps())];
   const labels = [mode === 'list' ? 'Line' : 'Item','Operation','Input','Interpreted as'];
   values.forEach((v,i) => { const td = document.createElement('td'); td.dataset.label = labels[i]; const span = document.createElement('span'); span.textContent = v; if (i >= 2) span.className = 'cell-scroll'; td.append(span); tr.append(td); });
   rows.append(tr);
  }
  $('show-items').hidden = parsed.items.length <= 5;
  $('show-items').textContent = expanded ? 'Show fewer' : `Show all ${parsed.items.length} items`;
  $('show-items').setAttribute('aria-expanded',String(expanded));
  const invalid = parsed.error || parsed.errors.length;
  $('item-count').textContent = invalid ? (calcInput().value || submitted || pasteError ? 'Fix the errors to calculate.' : '') : `${parsed.items.length} ${parsed.items.length === 1 ? 'item' : 'items'}`;
 }
 function showErrors(force = false) {
  for (const err of errors) {
   const target = $(err.id), lineError = err.id === 'reformat-input' && err.item;
   const visible = force || submitted || touched.has(err.id) || lineError || (pasteError && err.id === 'expression');
   if (!visible && err.id !== 'expression' && err.id !== 'list') {
    if (target.value.trim()) $(target.id+'-editing').textContent = 'Complete the input to preview a result.';
    continue;
   }
   if (visible) target.setAttribute('aria-invalid','true');
   const region = $(errorId(err.id));
   if (err.id === 'expression' || err.id === 'list' || err.id === 'reformat-input') {
    if (err.item) {
     const b = document.createElement('button'); b.type = 'button'; b.className = visible ? 'error-link' : 'error-link neutral-error';
     const lineLabel = err.id === 'reformat-input' || mode === 'list' ? 'Line' : 'Item';
     b.textContent = `${lineLabel} ${err.item.index}: ${err.message}`;
     b.addEventListener('click', () => { target.focus(); target.setSelectionRange(err.item.start,err.item.end); }); region.append(b);
    } else { if (target.value.trim() || visible || pasteError) {
     const p = document.createElement('p'); if (!visible) p.className = 'neutral-error'; p.textContent = err.message; region.append(p);
    } }
   } else region.textContent = err.message;
  }
 }
 function refresh(force = false) {
  revision++; clearTimeout(copyTimer); $('copy').textContent = 'Copy'; $('copy-status').textContent = '';
  frames = null; errors = [];
  document.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
  document.querySelectorAll('.error,.interpreted,.editing-hint').forEach(e => e.replaceChildren());
  $('result-feedback').textContent = ''; $('precision').textContent = '';
  $('interval').disabled = direction() === 'none';
  if (active === 'reformat') {
   const parsed = T.parseReformatList($('reformat-input').value,fps());
   for (const e of parsed.errors) addError('reformat-input',e.message,e);
   if (!errors.length && parsed.items.length) frames = parsed.items.map(i => i.frames);
   $('reformat-preview').textContent = parsed.items.length ? (parsed.errors.length ? `${parsed.items.length} timecode ${parsed.items.length === 1 ? 'line' : 'lines'} found · ${parsed.errors.length} ${parsed.errors.length === 1 ? 'error' : 'errors'}.` : `${parsed.items.length} ${parsed.items.length === 1 ? 'timecode' : 'timecodes'} found.`) : ($('reformat-input').value.trim() ? 'No timecodes found.' : '');
  }
  if (active === 'round') {
   const n = readTime('round-input');
   for (const id of ['offset', ...(direction() === 'none' ? [] : ['interval'])]) {
    try { T.integerSeconds($(id).value,id === 'interval'); } catch (e) { addError(id,e.message); }
   }
   if (!errors.length) {
    try {
     frames = T.roundTimecode(n,$('offset').value,$('interval').value,direction(),fps());
     const delta = frames - n, magnitude = Math.abs(delta);
     $('result-feedback').textContent = delta === 0 ? 'No change' : magnitude % fps() === 0 ? `${magnitude / fps()} ${magnitude / fps() === 1 ? 'second' : 'seconds'} ${delta > 0 ? 'added' : 'removed'}` : `${delta > 0 ? 'Added' : 'Removed'} ${T.formatTimecode(magnitude,fps())}`;
     // Keep the signed, frame-accurate delta visible next to the short feedback.
     const exactChange = (delta > 0 ? '+' : '') + T.formatTimecode(delta,fps());
     if (delta !== 0) {
      if (magnitude % fps() === 0) $('result-feedback').textContent += ' · ' + exactChange;
      else $('result-feedback').textContent = (delta > 0 ? 'Added ' : 'Removed ') + exactChange;
     }
    } catch (e) { addError(e.message.includes('offset') ? 'offset' : direction() === 'none' ? 'offset' : 'interval',e.message); }
   }
  }
  if (active === 'duration') {
   const a = readTime('start'), b = readTime('end');
   if (!errors.length) {
    try {
     frames = T.calculateDuration(a,b,$('include-end').checked,false,fps());
     $('result-feedback').textContent = $('include-end').checked ? 'End frame included' : '';
    } catch (e) { addError('end',e.message); }
   }
  }
  if (active === 'calculate') {
   const parsed = mode === 'expression' ? T.parseExpression($('expression').value,fps()) : T.parseSumList($('list').value,fps());
   if (pasteError && mode === 'expression') parsed.error = 'Use Sum list for one time value per line.';
   renderItems(parsed);
   if (parsed.error) addError(calcInput().id,parsed.error);
   for (const e of parsed.errors) addError(calcInput().id,e.message,e);
   if (!errors.length) {
    try { frames = T.calculateTimecodes(parsed); }
    catch (e) { addError(calcInput().id,e.message); $('item-count').textContent = 'Fix the errors to calculate.'; }
   }
  }
  if (errors.length) frames = null;
  const values = Array.isArray(frames) ? frames : frames === null ? [] : [frames];
  $('result').textContent = values.length ? values.map(n => T.formatTimecode(n,fps(),$('format').value)).join('\n') : '—';
  $('copy').disabled = frames === null;
  $('copy').textContent = values.length > 1 ? 'Copy all' : 'Copy';
  if (values.length && $('format').value !== 'hh:mm:ss:ff' && values.some(n => Math.abs(n) % fps())) $('precision').textContent = 'Frames omitted in this format.';
  // Extra-long hours and negative full results get a full-width first row.
  document.querySelector('.result').classList.toggle('long-result',values.length > 1 || $('result').textContent.length > 11);
  document.querySelector('.result').classList.toggle('batch-result',values.length > 1);
  showErrors(force);
 }
 function activate(tab, focus = false) {
  active = tab; submitted = false; pasteError = false;
  for (const t of tabs) { const button = $('tab-'+t); button.setAttribute('aria-selected',String(t === tab)); button.tabIndex = t === tab ? 0 : -1; $('panel-'+t).hidden = t !== tab; }
  $('submit').hidden = tab === 'reformat' || tab === 'round';
  $('panel-'+tab).querySelector('.fps-slot').append($('fps-field'));
  if (focus) $('tab-'+tab).focus(); refresh();
 }
 async function copy() {
  if (frames === null) return;
  const stamp = revision, value = $('result').textContent, idleLabel = Array.isArray(frames) && frames.length > 1 ? 'Copy all' : 'Copy';
  try {
   if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
   await navigator.clipboard.writeText(value);
   if (stamp !== revision) return;
   $('copy').textContent = 'Copied'; $('copy-status').textContent = 'Copied';
   copyTimer = setTimeout(() => { $('copy').textContent = idleLabel; $('copy-status').textContent = ''; },2000);
  } catch { if (stamp === revision) $('copy-status').textContent = 'Copy failed. Select the result to copy manually.'; }
 }
 function submit() {
  if (composing) return;
  submitted = true; refresh(true);
  if (frames === null) { if (errors[0]) $(errors[0].id).focus(); }
 }
 $('calculator').addEventListener('submit', e => { e.preventDefault(); submit(); });
 $('calculator').addEventListener('compositionstart', () => { composing = true; });
 $('calculator').addEventListener('compositionend', () => { composing = false; });
 $('calculator').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.isComposing || composing || e.keyCode === 229) { e.preventDefault(); return; }
  if (e.target === $('list')) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); submit(); } }
  else if (e.target.matches('input[type=text]')) { e.preventDefault(); submit(); }
 });
 document.querySelectorAll('[data-tab]').forEach(b => {
  b.addEventListener('click', () => activate(b.dataset.tab));
  b.addEventListener('keydown', e => {
   let i = tabs.indexOf(active);
   if (e.key === 'ArrowLeft') i = (i+3)%4;
   else if (e.key === 'ArrowRight') i = (i+1)%4;
   else if (e.key === 'Home') i = 0;
   else if (e.key === 'End') i = 3;
   else return;
   e.preventDefault(); activate(tabs[i],true);
  });
 });
 document.querySelectorAll('.help-button').forEach(b => b.addEventListener('click', () => { const shown = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded',String(shown)); $(b.getAttribute('aria-controls')).hidden = !shown; }));
 $('calculator').addEventListener('input', e => {
  if (!e.target.matches('input[type=text],textarea')) return;
  if (e.target === $('expression')) pasteError = false;
  expanded = false; save(); refresh();
 });
 $('calculator').addEventListener('change', e => {
  if (e.target.name === 'mode') {
   mode = e.target.value; pasteError = false; submitted = false; expanded = false;
   $('expression-field').hidden = mode !== 'expression'; $('list-field').hidden = mode !== 'list';
  }
  save(); refresh(e.target === $('fps'));
 });
 $('calculator').addEventListener('focusout', e => {
  if (e.target.matches('input[type=text],textarea')) {
   touched.add(e.target.id);
   // Do not replace a focused error link between pointerdown / click or during Tab.
   if (!e.relatedTarget?.matches('.error-link')) refresh();
  }
 });
 $('expression').addEventListener('paste', e => {
  if (/[\r\n]/.test(e.clipboardData?.getData('text/plain') || '')) { e.preventDefault(); pasteError = true; refresh(true); }
 });
 $('show-items').addEventListener('click', () => { expanded = !expanded; refresh(); });
 $('copy').addEventListener('click',copy);
 if (/Mac|iPhone|iPad/.test(navigator.platform)) $('list-shortcut').textContent = '⌘+Enter to calculate';
 activate('reformat');
})();
