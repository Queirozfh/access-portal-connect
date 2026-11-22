import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

afterEach(() => { document.body.innerHTML = ''; });

it('keeps the calendar open when a year click replaces its original button', () => {
  document.body.innerHTML = '<nav id="nav"></nav><button data-page="admin"></button><button id="menuToggle"></button><div id="monthPicker"><button id="monthTrigger"></button><button id="monthPrev"></button><button id="monthNext"></button><div id="monthPopover"><button data-year-shift="1">Next</button></div></div>';
  const source = readFileSync('public/meu-patrimonio/app.js', 'utf8');
  const handlers = source.split('\n').find(line => line.startsWith("document.querySelector('#nav').addEventListener"));
  if (!handlers) throw new Error('Calendar handlers are missing');
  const popover = document.querySelector<HTMLElement>('#monthPopover');
  if (!popover) throw new Error('Calendar is missing');
  const state = { year: 2026, closed: false };
  const eventDocument = {
    querySelector: document.querySelector.bind(document),
    addEventListener: (name: string, callback: EventListener) => document.body.addEventListener(name, callback),
  };
  runInNewContext(handlers, {
    document: eventDocument, monthInput: {}, monthPickerYear: state.year,
    setPage: () => {}, shiftSelectedMonth: () => {}, setSelectedMonth: () => {},
    updateMonthPicker: () => { state.year++; popover.innerHTML = '<button data-year-shift="-1">Previous</button>'; },
    closeMonthPicker: () => { state.closed = true; popover.hidden = true; },
  });
  const next = popover.querySelector<HTMLButtonElement>('button');
  if (!next) throw new Error('Year button is missing');
  next.click();
  expect(state.year).toBe(2027);
  expect(state.closed).toBe(false);
  expect(popover.hidden).toBe(false);
});