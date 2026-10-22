import test from 'node:test';import assert from 'node:assert/strict';
import {zonedInputToIso,formatScheduleTime} from '../dashboard-time.js';
import {scheduleCalendar} from '../lib/dashboard-tools.js';

test('customer recurrence preview matches the sender across short months and DST',()=>{
 for(const repeat of ['once','daily','weekly','monthly'])for(const run_at of ['2027-01-31T10:00:00.000Z','2027-03-13T10:00:00.000Z']){
  assert.deepEqual(formatScheduleTime.upcoming(run_at,repeat),scheduleCalendar({run_at,repeat},3));
 }
});

test('schedule edits round-trip in the stored timezone instead of silently using UTC',()=>{
 const iso='2026-10-22T10:30:00.000Z';
 assert.equal(formatScheduleTime.inputValue(iso,'Asia/Riyadh'),'2026-10-22T13:30');
 assert.equal(formatScheduleTime.toIso(formatScheduleTime.inputValue(iso,'Asia/Riyadh'),'Asia/Riyadh'),iso);
 assert.equal(formatScheduleTime.inputValue('invalid','UTC'),'');assert.equal(formatScheduleTime(null),'—');
 assert.match(formatScheduleTime(iso,'Asia/Riyadh','en'),/2026/);
});
test('chosen timezone controls the instant independently of browser timezone',()=>{assert.equal(zonedInputToIso('2027-01-01T12:00','Asia/Riyadh'),'2027-01-01T09:00:00.000Z');assert.equal(zonedInputToIso('2027-01-01T12:00','America/New_York'),'2027-01-01T17:00:00.000Z');});
test('invalid dates and ambiguous or missing DST times are rejected before scheduling',()=>{assert.throws(()=>zonedInputToIso('2027-02-31T12:00','UTC'));assert.throws(()=>zonedInputToIso('2027-03-14T02:30','America/New_York'));assert.throws(()=>zonedInputToIso('2027-11-07T01:30','America/New_York'));});
