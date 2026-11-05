import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalField, intervalValue } from '../web/interval-control.mjs';
import { parseWindows } from '../web/forecast.mjs';

test('interval field renders an overnight end on the following day', () => {
  const html = intervalField('work', parseWindows('22:00–02:00'), 240);

  assert.match(html, /data-start value="22:00"/);
  assert.match(html, /data-end value="02:00"/);
  assert.match(html, /До · след\. день/);
});

test('interval field keeps a full-day interval distinct from zero duration', () => {
  const html = intervalField('work', [{ start: 0, end: 1440 }], 1440);

  assert.match(html, /data-full-day="true"/);
  assert.match(html, /data-start value="00:00"/);
  assert.match(html, /data-end value="00:00"/);
  assert.match(html, /До · след\. день/);
  assert.match(html, /24 ч/);
});

test('interval ending exactly at midnight is shown as the following day', () => {
  const html = intervalField('work', parseWindows('12:00–00:00'), 720);

  assert.match(html, /data-start value="12:00"/);
  assert.match(html, /data-end value="00:00"/);
  assert.match(html, /До · след\. день/);
});

test('disabled interval fields disable all editing controls', () => {
  const html = intervalField('work', parseWindows('09:00–12:00'), 180, true);

  assert.equal((html.match(/\bdisabled\b/g) ?? []).length, 7);
});

function intervalRoot(id, value, intervals = [], error) {
  const field = { value, dataset: error ? { error } : {} };
  const control = { _intervals: intervals };
  field.closest = selector => {
    assert.equal(selector, '[data-interval]');
    return control;
  };
  return { querySelector: selector => {
    assert.equal(selector, `#${id}`);
    return field;
  } };
}

test('interval value preserves known duration and its precision', () => {
  const value = intervalValue(intervalRoot('work', '4.25', [{ start: 540, end: 795 }]), 'work');

  assert.deepEqual(value, {
    workingMin: 255,
    intervals: [{ start: 540, end: 795 }],
    precision: 'intervals'
  });
});

test('interval value distinguishes unknown duration from an explicit total', () => {
  assert.deepEqual(intervalValue(intervalRoot('work', '', []), 'work'), {
    workingMin: null, intervals: [], precision: 'unknown'
  });
  assert.deepEqual(intervalValue(intervalRoot('work', '0', []), 'work'), {
    workingMin: 0, intervals: [], precision: 'total'
  });
});

test('interval value rejects a field with incomplete or invalid rows', () => {
  assert.throws(
    () => intervalValue(intervalRoot('work', '3', [], 'Укажите начало и конец.'), 'work'),
    /Укажите начало и конец/
  );
});
