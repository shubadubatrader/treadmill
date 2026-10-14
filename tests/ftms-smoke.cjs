const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');

function sourceOf(name) {
  let start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Function ${name} not found`);
  if (html.slice(start - 6, start) === 'async ') start -= 6;
  const open = html.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Function ${name} is incomplete`);
}

eval(sourceOf('parseTreadmillData'));

const packet = new DataView(Uint8Array.from([
  0x0c, 0x00,       // distance + incline; instantaneous speed is present
  0x8a, 0x02,       // 6.50 km/h
  0xd2, 0x04, 0x00, // 1234 m
  0x32, 0x00,       // 5.0%
  0x00, 0x00,       // ramp angle
]).buffer);
assert.deepEqual(parseTreadmillData(packet), { flags: 0x0c, speed: 6.5, incline: 5, distance: 1234 });
assert.throws(() => parseTreadmillData(new DataView(Uint8Array.from([0x08, 0x00, 0x10]).buffer)), /короткий пакет/);

const num = (x, lo, hi, d) => { x = parseFloat(String(x).replace(',', '.')); return isFinite(x) ? Math.min(Math.max(x, lo), hi) : d; };
eval(sourceOf('cleanW'));
eval(sourceOf('cleanHistory'));
const workouts = cleanW([{ title: 'План', stages: [null, ['Этап', '5', '6,5', 3]] }]);
assert.equal(workouts.length, 1);
assert.deepEqual(workouts[0].stages[1], ['Этап', 5, 6.5, 3]);
const cleaned = cleanHistory([
  { t: '2026-10-14T10:00:00Z', w: 'Тест', done: 600, km: 1.25, ok: true, sp: 7.5, inc: 3 },
  { t: 'bad', done: 100 },
]);
assert.equal(cleaned.length, 1);
assert.equal(cleaned[0].km, 1.25);

let cp, queue = Promise.resolve(), pending = null, btGeneration = 0;
const RES = { 1: 'успех', 5: 'нет прав на управление' };
const messages = [];
const blog = message => messages.push(message);
const hex = value => Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).map(b => b.toString(16).padStart(2, '0')).join(' ');
eval(sourceOf('rawCP'));
eval(sourceOf('sendCP'));
eval(sourceOf('onCP'));

const responses = [5, 1, 1], writes = [];
cp = {
  writeValueWithResponse: async bytes => {
    const op = bytes[0], code = responses.shift(); writes.push(op);
    setTimeout(() => onCP({ target: { value: new DataView(Uint8Array.from([0x80, op, code]).buffer) } }), 0);
  },
};

(async () => {
  const result = await sendCP([0x02, 0x8a, 0x02], 'скорость');
  assert.equal(result.code, 1);
  assert.deepEqual(writes, [0x02, 0x00, 0x02]);
  assert(messages.some(x => x.includes('управление потеряно')));
  console.log('FTMS smoke tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
