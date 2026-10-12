import test from 'node:test';
import assert from 'node:assert/strict';
import {nextScheduleTime} from '../lib/schedule-time.js';
import {ANALYTICS_RETENTION_DAYS,analyticsPeriods} from '../workspace-policies.js';
test('monthly recurrence returns to the original day after a short month',()=>{
  const feb=nextScheduleTime({run_at:'2027-01-31T09:30:00Z',repeat:'monthly',recurrence_day:31},Date.parse('2027-01-31T09:30:00Z'));
  assert.equal(feb.toISOString(),'2027-02-28T09:30:00.000Z');
  assert.equal(nextScheduleTime({run_at:feb,repeat:'monthly',recurrence_day:31},feb.getTime()).toISOString(),'2027-03-31T09:30:00.000Z');
});
test('monthly recurrence handles leap years and skips missed dates without catch-up sends',()=>{
  assert.equal(nextScheduleTime({run_at:'2028-01-31T09:30:00Z',repeat:'monthly',recurrence_day:31},Date.parse('2028-01-31T09:30:00Z')).toISOString(),'2028-02-29T09:30:00.000Z');
  assert.equal(nextScheduleTime({run_at:'2027-01-31T09:30:00Z',repeat:'monthly',recurrence_day:31},Date.parse('2027-04-01T00:00:00Z')).toISOString(),'2027-04-30T09:30:00.000Z');
});
test('daily and weekly intervals and one-shot schedules retain their behavior',()=>{
  const date='2027-01-31T09:30:00Z',now=Date.parse(date);
  assert.equal(nextScheduleTime({run_at:date,repeat:'daily'},now).getTime(),now+86400000);
  assert.equal(nextScheduleTime({run_at:date,repeat:'weekly'},now).getTime(),now+7*86400000);
  assert.equal(nextScheduleTime({run_at:date,repeat:'once'},now).getTime(),now);
});
test('subscription reporting choices are separate from the actual retention cap',()=>{
  assert.equal(ANALYTICS_RETENTION_DAYS,365);
  assert.deepEqual(analyticsPeriods(7),[7]);assert.deepEqual(analyticsPeriods(30),[7,14,30]);assert.deepEqual(analyticsPeriods(90),[7,14,30,90]);assert.deepEqual(analyticsPeriods(365),[7,14,30,90,365]);
});
