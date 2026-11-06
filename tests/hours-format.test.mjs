import { test } from 'node:test';
import assert from 'node:assert/strict';
import {parseHours} from '../web/core.mjs';
test('slot hours accept hours:minutes and retain decimal compatibility',()=>{assert.equal(parseHours('01:30'),1.5);assert.equal(parseHours('00:15'),0.25);assert.equal(parseHours('12:00'),12);assert.equal(parseHours('1,5'),1.5);assert.throws(()=>parseHours('01:60'));assert.throws(()=>parseHours('1:2'));});
