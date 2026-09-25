/* Optional browser acceptance tests. Requires Playwright + Chromium, not needed by the app. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'))); }
const base = process.env.BASE_URL || 'http://127.0.0.1:8765/timecode-calculator/';
const out = path.join(__dirname,'../docs/screenshots'); fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser = await chromium.launch({headless:true});
 let count = 0; const report = [];
 const check = async(name,fn) => { await fn(); count++; report.push('PASS '+name); console.log('PASS '+name); };
 const context = await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
 const page = await context.newPage(); const errors = [], failures=[];
 page.on('pageerror',e=>errors.push(e.message)); page.on('response',r=>{if(r.status()>=400)failures.push(r.url());});
 const tab = name => page.locator('#tab-'+name).click();
 const value = async want => assert.equal(await page.locator('#result').innerText(),want);
 const shot = name => page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
 await page.goto(base);
 await check('U08/U09: subpath resources, defaults, tab order',async()=>{
  assert.equal(await page.title(),'24+1 · Broadcast Timecode Calculator');
  assert.deepEqual(await page.locator('[role=tab]').allTextContents(),['Reformat','Round','Duration','Calculate']);
  assert.equal(await page.locator('#tab-reformat').getAttribute('aria-selected'),'true');
  await value('—'); assert(await page.locator('#copy').isDisabled());
  assert.equal(await page.locator('#fps').inputValue(),'25'); assert.equal(await page.locator('#format').inputValue(),'hh:mm:ss:ff');
  assert.equal(await page.locator('#reformat-input').inputValue(),'');
  for(const img of await page.locator('img').all())assert(await img.evaluate(i=>i.complete&&i.naturalWidth>0));
  await shot('01-reformat-empty-desktop');
 });
 await check('F15/U14: dot/colon interpretation and frame-preserving format',async()=>{
  await page.locator('#reformat-input').fill('04.31.00'); await value('00:04:31:00'); await shot('02-reformat-dots');
  await page.locator('#reformat-input').fill('04:31:00'); await value('04:31:00:00'); await shot('03-reformat-colons');
  await page.locator('#reformat-input').fill('00.39.10');await page.locator('#format').selectOption('mm:ss');await value('00:39');
  assert.match(await page.locator('#reformat-preview').innerText(),/00:00:39:10/);assert.match(await page.locator('#precision').innerText(),/Frames omitted/);
  await page.locator('#format').selectOption('hh:mm:ss:ff');await value('00:00:39:10');
 });
 await check('Reformat batch extraction, invalid-line blocking and Copy all',async()=>{
  await page.locator('#reformat-input').fill('0:04 delete （假哭）\n 0:26 用英文原名\n 1:13 text\n\n真正軟弱\n 1:49 delete');
  await value('00:00:04:00\n00:00:26:00\n00:01:13:00\n00:01:49:00');assert.equal(await page.locator('#copy').innerText(),'Copy all');
  await page.locator('#reformat-input').fill('| 00.39.10 |\n| --- |\n| 02.02.00 |\n| 04.14.00 and later |');
  await value('00:00:39:10\n00:02:02:00\n00:04:14:00');
  await page.locator('#reformat-input').fill('0:04 good\n01:75 invalid\n0:26 good');await value('—');assert(await page.locator('#copy').isDisabled());assert.match(await page.locator('#reformat-error').innerText(),/Line 2:/);
  await page.locator('#reformat-input').fill('1:20');
 });
 // Record clipboard writes while retaining the real browser clipboard method.
 await page.evaluate(()=>{window.copyCalls=[];const real=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async s=>{window.copyCalls.push(s);return real(s);};});
 await check('U01/U02/U03: Reformat has no submit or auto-copy; Copy uses selected format',async()=>{
  assert(await page.locator('#submit').isHidden());assert.equal(await page.locator('#auto-copy').count(),0);
  await page.locator('#reformat-input').fill('1:20');await page.locator('#reformat-input').press('Enter');
  assert.equal(await page.evaluate(()=>copyCalls.length),0);
  await page.locator('#copy').click();await page.waitForFunction(()=>document.querySelector('#copy').textContent==='Copied');
  assert.deepEqual(await page.evaluate(()=>copyCalls),['00:01:20:00']);assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'00:01:20:00');
  await page.locator('#format').selectOption('mm:ss');assert.equal(await page.evaluate(()=>copyCalls.length),1);
  await page.locator('#copy').click();await page.waitForFunction(()=>copyCalls.length===2);assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'01:20');
  await shot('04-copy-success');await page.locator('#format').selectOption('hh:mm:ss:ff');
 });
 await check('U04: clipboard rejection supports manual selection',async()=>{
  await page.evaluate(()=>{window.workingWrite=navigator.clipboard.writeText;navigator.clipboard.writeText=async()=>{throw new Error('denied');};});
  await page.locator('#copy').click();await page.waitForFunction(()=>document.querySelector('#copy-status').textContent.includes('Copy failed'));
  assert.equal(await page.locator('#result').evaluate(e=>getComputedStyle(e).userSelect),'text');await shot('05-copy-failure');
  await page.evaluate(()=>{navigator.clipboard.writeText=window.workingWrite;});
 });
 await check('U05/F09: invalid edits and changed fps clear old result',async()=>{
  await page.locator('#reformat-input').fill('1:60');await value('—');assert(await page.locator('#copy').isDisabled());
  await page.locator('#fps').selectOption('30');await page.locator('#reformat-input').fill('00.39.25');await value('00:00:39:25');
  await page.locator('#fps').selectOption('25');await value('—');assert(await page.locator('#copy').isDisabled());assert.match(await page.locator('#reformat-error').innerText(),/00 and 24/);
 });
 await check('Round defaults, none ignores interval, errors focus field',async()=>{
  await tab('round');assert(await page.locator('#submit').isHidden());assert.equal(await page.locator('#offset').inputValue(),'+10');assert.equal(await page.locator('#interval').inputValue(),'5');
  await page.locator('#round-input').fill('00:00:44:00');await value('00:00:55:00');assert.match(await page.locator('#result-feedback').innerText(),/11 seconds added/);await shot('06-round-desktop');
  await page.locator('#interval').fill('0');await page.locator('#interval').press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'interval');await value('—');
  await page.locator('[name=direction][value=none]').check();assert(await page.locator('#interval').isDisabled());await value('00:00:54:00');
  await page.locator('#offset').fill('-50');await page.locator('#offset').press('Enter');await value('—');assert.equal(await page.evaluate(()=>document.activeElement.id),'offset');
  await page.locator('#offset').fill('+10');await page.locator('[name=direction][value=up]').check();await page.locator('#interval').fill('5');
 });
 await check('Round direction guidance appears on hover and keyboard focus',async()=>{
  for(const value of ['up','down','nearest']){const option=page.locator(`[name=direction][value=${value}]`);await option.focus();assert(await page.locator(`#direction-${value}-help`).isVisible());}
 });
 await check('Duration is streamlined and supports inclusive end',async()=>{
  await tab('duration');await page.locator('#start').fill('0:44');await page.locator('#end').fill('1:20');await value('00:00:36:00');await shot('07-duration-desktop');
  assert.equal(await page.locator('#midnight, #midnight-help, #include-help, #fps-help, [aria-label="About Frame rate"], #start-help, #end-help').count(),0);
  await page.locator('#include-end').check();await value('00:00:36:01');assert.match(await page.locator('#result-feedback').innerText(),/End frame included/);
  await page.locator('#start').fill('23:59:58');await page.locator('#end').fill('3');await value('—');assert.match(await page.locator('#end-error').innerText(),/End is before Start/);
 });
 await check('Calculate full expression and isolation from other settings',async()=>{
  await tab('calculate');await page.locator('#expression').fill('00:12:09:12 + 00:00:12:15 + 11:22:04:00');await value('11:34:26:02');
  assert.equal(await page.locator('#item-count').innerText(),'3 items');await shot('08-expression-desktop');
  await page.locator('#expression').fill('00:10 − 00:20');await value('-00:00:10:00');await shot('09-negative-result');
  await page.locator('#copy').click();await page.waitForFunction(()=>document.querySelector('#copy').textContent==='Copied');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'-00:00:10:00');
  await page.locator('#expression').fill('0-00:00:00:01');await page.locator('#format').selectOption('mm:ss');await value('00:00');assert.match(await page.locator('#precision').innerText(),/Frames omitted/);
  await page.locator('#format').selectOption('hh:mm:ss:ff');await value('-00:00:00:01');
 });
 await check('Expression rejects multiline paste before input flattening, sticky until edit/mode',async()=>{
  await page.locator('#expression').fill('1+2');
  await page.locator('#expression').evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','04:12\n00:12');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  assert.equal(await page.locator('#expression').inputValue(),'1+2');await value('—');assert.match(await page.locator('#calc-errors').innerText(),/Use Sum list/);
  await page.locator('#format').selectOption('mm:ss');await value('—');await page.locator('#expression').press('Enter');await value('—');
  await page.locator('#expression').fill('1+3');await value('00:04');await page.locator('#format').selectOption('hh:mm:ss:ff');
 });
 await check('C12/U10/U11: Sum list, Enter, Ctrl/Cmd+Enter, session input separation',async()=>{
  await page.locator('[name=mode][value=list]').check();await page.locator('#list').fill('04:12\n00:12:00:12\n01:02:03');await value('01:18:15:12');assert.equal(await page.locator('#item-count').innerText(),'3 items');await shot('10-list-desktop');
  const n=await page.evaluate(()=>copyCalls.length);
  await page.locator('#list').press('End');await page.locator('#list').press('Enter');assert.equal(await page.evaluate(()=>copyCalls.length),n);
  await page.locator('#list').press('Control+Enter');assert.equal(await page.evaluate(()=>copyCalls.length),n);
  await page.locator('#list').press('Meta+Enter');assert.equal(await page.evaluate(()=>copyCalls.length),n);
  await page.locator('[name=mode][value=expression]').check();assert.equal(await page.locator('#expression').inputValue(),'1+3');await value('00:00:04:00');
  await tab('reformat');await tab('calculate');assert.equal(await page.locator('#expression').inputValue(),'1+3');
  await page.locator('[name=mode][value=list]').check();assert.match(await page.locator('#list').inputValue(),/^04:12/);assert.equal(await page.evaluate(()=>copyCalls.length),n);
 });
 await check('IME composition blocks submission',async()=>{
  const n=await page.evaluate(()=>copyCalls.length);
  await page.locator('#list').evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true,bubbles:true,cancelable:true}));});
  assert.equal(await page.evaluate(()=>copyCalls.length),n);
  await page.locator('#list').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
 });
 await check('C14 errors use physical lines and keyboard selection; beyond fold errors visible',async()=>{
  await page.locator('#list').fill('1\n\n2\n3\n4\n5\nbad\n1\t');await page.locator('#submit').click();await value('—');assert(await page.locator('#copy').isDisabled());
  assert.equal(await page.locator('#item-count').innerText(),'Fix the errors to calculate.');assert.match(await page.locator('#calc-errors').innerText(),/Line 7:/);assert.match(await page.locator('#calc-errors').innerText(),/Line 8:/);
  const e=page.locator('.error-link').first();await e.focus();await e.press('Enter');
  assert.equal(await page.locator('#list').evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd)),'bad');await shot('11-list-errors');
  await page.locator('#list').fill('1\n2\n3\n4\n5\n6');assert.equal(await page.locator('#item-rows tr').count(),5);await page.locator('#show-items').click();assert.equal(await page.locator('#item-rows tr').count(),6);await page.locator('#show-items').click();assert.equal(await page.locator('#item-rows tr').count(),5);
 });
 await check('Tab keyboard Left/Right/Home/End + Tab into current panel',async()=>{
  await page.locator('#tab-calculate').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.id),'tab-reformat');
  await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.activeElement.id),'tab-calculate');await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.id),'tab-reformat');
  await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.id),'tab-calculate');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.name),'mode');
 });
 await check('360/768/1280/1440 responsive states and long results: no page overflow',async()=>{
  for(const width of [360,768,1280,1440]){
   await page.setViewportSize({width,height:900});
   for(const name of ['reformat','round','duration','calculate']){
    await tab(name);
    if(name==='reformat')await page.locator('#reformat-input').fill('00.39.10');
    if(name==='calculate'){await page.locator('[name=mode][value=list]').check();await page.locator('#list').fill('04:12\n00:12:00:12\n01:02:03');}
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${name} page overflow`);
    const boxes=await page.locator('[role=tab]').evaluateAll(es=>es.map(e=>({x:e.offsetLeft,y:e.offsetTop,h:e.offsetHeight,w:e.offsetWidth})));
    assert(boxes.every(b=>b.h>=44&&b.w>=44));assert(width<700?boxes[0].y===boxes[1].y&&boxes[2].y>boxes[0].y:boxes.every(b=>b.y===boxes[0].y));
    if(width===360&&(name==='reformat'||name==='calculate'))await shot(`12-${name}-mobile`);
   }
   await page.locator('[name=mode][value=expression]').check();await page.locator('#expression').fill('-1000000000:00:00:01');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('#expression').fill('1+bad');await page.locator('#submit').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
 });
 await check('200% layout zoom equivalent 1440px screen / 720 CSS px',async()=>{
  await page.setViewportSize({width:720,height:450});await tab('round');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#round-input').press('Enter');await value('00:00:55:00');await shot('13-zoom-200-equivalent');
 });
 await check('U06/U09: preference reload, transient state cleared',async()=>{
  await page.locator('#fps').selectOption('30');await page.locator('#format').selectOption('mm:ss');await tab('calculate');await page.locator('[name=mode][value=list]').check();await page.reload();
  assert.equal(await page.locator('#tab-reformat').getAttribute('aria-selected'),'true');await value('—');assert.equal(await page.locator('#fps').inputValue(),'30');assert.equal(await page.locator('#format').inputValue(),'mm:ss');assert.equal(await page.locator('#auto-copy').count(),0);
  await tab('duration');assert(await page.locator('#include-end').isChecked());assert.equal(await page.locator('#midnight').count(),0);assert.equal(await page.locator('#start').inputValue(),'');
  await tab('calculate');assert(await page.locator('[name=mode][value=expression]').isChecked());assert.equal(await page.locator('#expression').inputValue(),'');assert.equal(await page.locator('#list').inputValue(),'');
 });
 await check('U07: corrupt and unavailable localStorage',async()=>{
  await page.evaluate(()=>localStorage.setItem('timecode-v2','{bad'));await page.reload();assert.equal(await page.locator('#fps').inputValue(),'25');await page.locator('#reformat-input').fill('80');await value('00:01:20:00');
  await page.evaluate(()=>localStorage.setItem('timecode-v2',JSON.stringify({fps:29.97,format:'oops',offset:'1.5',interval:0,direction:'oops',autoCopy:'true'})));await page.reload();assert.equal(await page.locator('#fps').inputValue(),'25');assert.equal(await page.locator('#auto-copy').count(),0);
  const c=await browser.newContext();await c.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('Blocked');}}));const q=await c.newPage();await q.goto(base);await q.locator('#reformat-input').fill('80');assert.equal(await q.locator('#result').innerText(),'00:01:20:00');await c.close();
 });
 await check('No browser exceptions or missing resources',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);});
 await browser.close();fs.writeFileSync(path.join(__dirname,'../docs/browser-test-results.txt'),`${count} browser acceptance groups passed.\n\n${report.join('\n')}\n`);console.log(`${count} groups passed`);
})().catch(e=>{console.error(e);process.exit(1);});
