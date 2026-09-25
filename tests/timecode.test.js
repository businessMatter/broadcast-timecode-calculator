'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const T = require('../timecode.js');
const p = (s,f=25) => T.parseTimecode(s,f);
const fmt = (n,f=25,format='hh:mm:ss:ff') => T.formatTimecode(n,f,format);
const expr = (s,f=25) => T.calculateTimecodes(T.parseExpression(s,f));
const list = (s,f=25) => T.calculateTimecodes(T.parseSumList(s,f));
const round = (s,o,k,d,f=25) => fmt(T.roundTimecode(p(s,f),o,k,d,f),f);
const dur = (a,b,inc=false,mid=false) => fmt(T.calculateDuration(p(a),p(b),inc,mid));
const cases = [
 ['F01','0:44','00:00:44:00'],['F02','1:20','00:01:20:00'],['F03','80','00:01:20:00'],
 ['F04','1:02:03','01:02:03:00'],['F05','00:00:44:12','00:00:44:12'],['F11','25:00:00','25:00:00:00'],
 ['F12a','04.31.00','00:04:31:00'],['F12b','19.40.00','00:19:40:00'],['F13a','00.31.00','00:00:31:00'],['F13b','00.39.10','00:00:39:10'],
 ['F14a','04:31','00:04:31:00'],['F14b','00:12','00:00:12:00'],['F15a','04:31:00','04:31:00:00'],['F15b','04.31.00','00:04:31:00'],['F16','64.31.00','01:04:31:00'],['digits','0120','00:02:00:00']
];
for(const [id,s,want] of cases) test(id,()=>assert.equal(fmt(p(s)),want));
test('F06: formats preserve frames and accumulate minutes',()=>{let n=p('01:02:03:12');assert.equal(fmt(n,25,'mm:ss'),'62:03');assert.equal(fmt(n,25,'hh:mm:ss'),'01:02:03');assert.equal(fmt(n),'01:02:03:12');});
for(const s of ['1:60','00:60:00','00:00:00:25','','1::20','-1','+1','1;20','1.5','04.31','00.04.31.00','04:31.00','04.60.00','00.39.25','1 2','1:2:3:4:5','１','1e2']) test('F07/F08/F10/F17 invalid '+JSON.stringify(s),()=>assert.throws(()=>p(s)));
test('F09/F18: reinterpreted frame range',()=>{for(const s of ['00:00:00:25','00.39.25']){assert.doesNotThrow(()=>p(s,30));assert.throws(()=>p(s,25));}});
test('F19 shared dot parser',()=>{assert.equal(round('00.39.10',0,'bad','none'),'00:00:39:10');assert.equal(dur('00.39.10','00.40.00'),'00:00:00:15');});
test('Reformat batch extracts first timecode and ignores descriptions',()=>{const r=T.parseReformatList('0:04 delete （假哭）\n 0:26 name\n\nwords only\n| 00.39.10 |');assert.deepEqual(r.items.map(i=>fmt(i.frames)),['00:00:04:00','00:00:26:00','00:00:39:10']);assert.equal(r.errors.length,0);});
test('Reformat batch supports bullets, numbered rows and physical error lines',()=>{const r=T.parseReformatList('- 0:04 note\n2. 01:75 invalid\n| --- |\n• 02.02.00 note');assert.deepEqual(r.items.map(i=>i.index),[1,2,4]);assert.equal(r.errors[0].index,2);assert.match(r.errors[0].message,/Seconds/);});
test('Reformat batch rejects mixed separators without accepting a partial token',()=>{const r=T.parseReformatList('| 04:31.00 description |');assert.equal(r.errors.length,1);assert.equal(r.items[0].raw,'04:31.00');});
for(const [id,s,o,k,d,want,f] of [
 ['R01','00:00:44:00',10,5,'up','00:00:55:00'],['R02','00:00:05:12',10,5,'up','00:00:20:00'],['R03','00:00:45:00',10,5,'up','00:00:55:00'],['R04','00:00:44:12',0,5,'down','00:00:40:00'],['R05a','00:00:42:12',0,5,'nearest','00:00:40:00'],['R05b','00:00:42:13',0,5,'nearest','00:00:45:00'],['R06','00:00:42:15',0,5,'nearest','00:00:45:00',30],['R07','00:00:44:12',-3,0,'none','00:00:41:12'],['R09','00:00:58:00',3,5,'up','00:01:05:00'],['R10','00:01:00:00',0,7,'up','00:01:03:00']
]) test(id,()=>assert.equal(round(s,o,k,d,f),want));
test('Round actual delta includes frames',()=>assert.equal(fmt(T.roundTimecode(p('00:00:05:12'),10,5,'up')-p('00:00:05:12')),'00:00:14:13'));
test('R08: negative before rounding is rejected',()=>assert.throws(()=>round('2',-3,5,'up'),/below zero/));
for(const v of ['0','-1','1.5','bad','']) test('R11 interval '+v,()=>assert.throws(()=>round('44',0,v,'up')));
test('Offset rejects fractional and unsafe values',()=>{for(const v of ['1.2','1e3','++1','9007199254740992'])assert.throws(()=>round('44',v,5,'up'));});
for(const [id,a,b,inc,mid,want] of [
 ['D01','0:44','1:20',false,false,'00:00:36:00'],['D02','00:00:10:12','00:00:11:02',false,false,'00:00:00:15'],['D03a','1','1',false,false,'00:00:00:00'],['D03b','1','1',true,false,'00:00:00:01'],['D04','23:59:58:00','00:00:03:00',false,true,'00:00:05:00'],['D05','23:59:58:00','00:00:03:00',true,true,'00:00:05:01'],['D07','0','25:00:00',false,false,'25:00:00:00'],['Midnight equal','1','1',false,true,'00:00:00:00']
])test(id,()=>assert.equal(dur(a,b,inc,mid),want));
test('D04 default rejects earlier end',()=>assert.throws(()=>dur('23:59:58','3'),/before Start/));
test('D06 either midnight boundary invalid',()=>{assert.throws(()=>dur('24:00:00','1',false,true));assert.throws(()=>dur('1','24:00:00',false,true));});
for(const [id,s,want] of [
 ['C01','00:12:09:12+00:00:12:15+11:22:04:00','11:34:26:02'],['C02','00:12:00:12 + 04:12','00:16:12:12'],['C03','00:10 − 00:20','-00:00:10:00'],['C04','00:10 - 00:20 + 00:30','00:00:20:00'],['C05','01:00 - 00:10 - 00:05','00:00:45:00'],['C06','00.39.10 + 00:00:00:20','00:00:40:05'],['C07','00:00:11:02 - 00:00:10:12','00:00:00:15'],['C10zero','00:10-00:10','00:00:00:00'],['C10hours','25:00:00+01:00:00','26:00:00:00'],['leading plus',' + 04:12','00:04:12:00']
])test(id,()=>assert.equal(fmt(expr(s)),want));
test('C08/C09 signed truncation preserves exact value',()=>{const n=expr('-00:00:01:12');assert.equal(fmt(n,25,'hh:mm:ss'),'-00:00:01');assert.equal(fmt(n),'-00:00:01:12');const frame=expr('0-00:00:00:01');assert.equal(fmt(frame,25,'mm:ss'),'00:00');assert.equal(fmt(frame),'-00:00:00:01');});
for(const s of ['00:10+','00:10+-00:05','00:10--00:05','(00:10)','00:10*2','1/2','1=2','1＋2','1－2','1\n2','1 2','--1',''])test('C11 expression rejects '+JSON.stringify(s),()=>assert.throws(()=>expr(s)));
test('C12/C13 physical lines and line endings',()=>{for(const sep of ['\n','\r\n','\r']){const s=[' 04:12 ','','00:12:00:12','01:02:03'].join(sep),parsed=T.parseSumList(s);assert.equal(fmt(T.calculateTimecodes(parsed)),'01:18:15:12');assert.equal(parsed.items.length,3);assert.equal(parsed.items[1].index,3);assert.equal(s.slice(parsed.items[1].start,parsed.items[1].end),'00:12:00:12');}});
test('C14 physical error line, no partial result',()=>{const parsed=T.parseSumList('04:12\n\nbad');assert.equal(parsed.errors[0].index,3);assert.throws(()=>T.calculateTimecodes(parsed));});
for(const s of ['Title','1\t2','1\t','\t','1,2','1 notes','-1','+1','1+2','• 1','1) 04:12',''])test('C15/C16 list rejects '+JSON.stringify(s),()=>assert.throws(()=>list(s)));
test('C16 single items valid',()=>{assert.equal(expr('1'),25);assert.equal(list('\n1\n'),25);});
test('C17 second item frame error',()=>{const r=T.parseExpression('00:10 + 00:00:00:25');assert.equal(r.errors[0].index,2);assert.throws(()=>T.calculateTimecodes(r));});
test('C19 every intermediate must be safe',()=>{const max=Number.MAX_SAFE_INTEGER,full=fmt(max);assert.equal(p(full),max);assert.throws(()=>p('9007199254740992'));assert.throws(()=>expr(`${full}+00:00:00:01-${full}`),/calculation exceeds/);assert.throws(()=>expr(`-${full}-00:00:00:01+${full}`));assert.throws(()=>T.calculateDuration(0,max,true));assert.throws(()=>T.roundTimecode(max,0,5,'up'));});
for(const f of [24,25,30,50,60])test(`fps ${f}: boundary and signed/full roundtrips`,()=>{assert.equal(p(`00:00:00:${f-1}`,f),f-1);assert.throws(()=>p(`00:00:00:${f}`,f));for(const n of [0,1,f-1,f,f*86400+17,123456789,Number.MAX_SAFE_INTEGER]){assert.equal(p(fmt(n,f),f),n);assert.equal(expr(fmt(-n,f),f),n===0?0:-n);}});
