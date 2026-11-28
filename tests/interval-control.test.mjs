import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalField, bindIntervals, intervalValue } from '../web/interval-control.mjs';
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

function boundInterval(rowsToCreate) {
  const rows = {
    _rows: [],
    listeners: {},
    querySelectorAll(selector) {
      assert.equal(selector, '.interval-row');
      return this._rows;
    },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    insertAdjacentHTML(position) {
      assert.equal(position, 'beforeend');
      this._rows.push(createRow('', '', this));
    },
    set innerHTML(value) {
      this.html = value;
      this._rows = [createRow('', '', this)];
    },
    get children() { return this._rows; },
    get lastElementChild() { return this._rows.at(-1); }
  };
  rowsToCreate.forEach(([start, end]) => rows._rows.push(createRow(start, end, rows)));
  const field = {
    _value: '', disabled: false, dataset: {}, emitted: [],
    get value() { return this._value; },
    set value(value) { this._value = String(value); },
    closest() { return control; },
    dispatchEvent(event) { this.emitted.push(event); }
  };
  const output = { textContent: '' };
  const warning = { textContent: '', hidden: true };
  const legacy = { hidden: false };
  const control = {
    dataset: { interval: 'work' }, _intervals: [],
    querySelector(selector) {
      return ({
        '.interval-rows': rows,
        'output': output,
        '[data-interval-error]': warning,
        '.interval-legacy': legacy,
        '[data-add]': add,
        '[data-rest]': rest,
        '[data-unknown]': unknown
      })[selector];
    }
  };
  const add = {};
  const rest = {};
  const unknown = {};
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-interval]');
      return [control];
    },
    querySelector(selector) {
      assert.equal(selector, '#work');
      return field;
    }
  };
  bindIntervals(root);
  return { root, rows, field, output, warning, control, add, rest, unknown };
}

function createRow(start, end, rows) {
  const startInput = { value: start, focusCalled: false, focus() { this.focusCalled = true; } };
  const endInput = { value: end };
  const row = {
    dataset: {},
    querySelector(selector) {
      return ({ '[data-start]': startInput, '[data-end]': endInput, 'input': startInput })[selector];
    },
    remove() { rows._rows = rows._rows.filter(candidate => candidate !== row); }
  };
  row.removeButton = { closest(selector) { return selector === '.interval-row' ? row : null; } };
  row.inputs = [startInput, endInput];
  return row;
}

test('interval input event updates minutes and emits a bubbling input event', () => {
  const fixture = boundInterval([['09:00', '12:00']]);
  fixture.rows._rows[0].inputs[1].value = '13:00';

  fixture.rows.listeners.input();

  assert.equal(fixture.field.value, '4');
  assert.equal(fixture.output.textContent, '4 ч');
  assert.deepEqual(intervalValue(fixture.root, 'work'), {
    workingMin: 240,
    intervals: [{ start: 540, end: 780, state: 'WORK', paymentCounted: 'UNKNOWN' }],
    precision: 'intervals'
  });
  assert.equal(fixture.field.emitted.length, 1);
  assert.equal(fixture.field.emitted[0].type, 'input');
  assert.equal(fixture.field.emitted[0].bubbles, true);
});

test('interval input event exposes incomplete rows as a field error', () => {
  const fixture = boundInterval([['09:00', '']]);

  fixture.rows.listeners.input();

  assert.equal(fixture.field.dataset.error, 'Укажите начало и конец каждого интервала.');
  assert.equal(fixture.warning.textContent, fixture.field.dataset.error);
  assert.equal(fixture.warning.hidden, false);
  assert.throws(() => intervalValue(fixture.root, 'work'), /Укажите начало и конец/);
  assert.equal(fixture.field.emitted[0].type, 'input');
});

test('interval buttons add, remove, rest and clear the interval value', () => {
  const fixture = boundInterval([['09:00', '12:00']]);
  fixture.add.onclick();
  assert.equal(fixture.rows.children.length, 2);
  assert.equal(fixture.rows.lastElementChild.inputs[0].focusCalled, true);
  assert.match(fixture.field.dataset.error, /Укажите начало и конец/);

  fixture.rest.onclick();
  assert.deepEqual(intervalValue(fixture.root, 'work'), {
    workingMin: 0, intervals: [], precision: 'total'
  });
  fixture.unknown.onclick();
  assert.deepEqual(intervalValue(fixture.root, 'work'), {
    workingMin: null, intervals: [], precision: 'unknown'
  });

  fixture.rows.listeners.click({ target: { closest: selector => selector === '[data-remove]' ? fixture.rows._rows[0].removeButton : null } });
  assert.deepEqual(intervalValue(fixture.root, 'work'), {
    workingMin: null, intervals: [], precision: 'unknown'
  });
  assert.equal(fixture.field.emitted.length, 3);
});
