import test from 'node:test';import assert from 'node:assert/strict';
import {zonedInputToIso} from '../dashboard-time.js';
test('chosen timezone controls the instant independently of browser timezone',()=>{assert.equal(zonedInputToIso('2027-01-01T12:00','Asia/Riyadh'),'2027-01-01T09:00:00.000Z');assert.equal(zonedInputToIso('2027-01-01T12:00','America/New_York'),'2027-01-01T17:00:00.000Z');});
test('invalid dates and ambiguous or missing DST times are rejected before scheduling',()=>{assert.throws(()=>zonedInputToIso('2027-02-31T12:00','UTC'));assert.throws(()=>zonedInputToIso('2027-03-14T02:30','America/New_York'));assert.throws(()=>zonedInputToIso('2027-11-07T01:30','America/New_York'));});
