// Tests the notes Lambda against an in-memory stand-in for DynamoDB. Run: node scripts/test-notes.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const items = new Map();
globalThis.notesDb = async (name, p) => {
  if (name === 'Query') {
    const list = [...items.values()].filter((i) => i.pk.S === p.ExpressionAttributeValues[':p'].S);
    list.sort((a, b) => (a.sk.S < b.sk.S ? 1 : -1));
    return { Items: list.slice(0, p.Limit) };
  }
  if (name === 'PutItem') {
    const key = `${p.Item.pk.S}|${p.Item.sk.S}`;
    const old = items.get(key);
    if (p.ConditionExpression && old && Number(old.ttl.N) >= Number(p.ExpressionAttributeValues[':now'].N)) {
      throw Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' });
    }
    items.set(key, p.Item);
    return {};
  }
  throw new Error(`unexpected ${name}`);
};
process.env.TABLE = 'test';
// A clock that moves a second per call, so notes have a real order (real posts are never in the same millisecond).
let clock = 1_780_000_000_000;
Date.now = () => (clock += 1000);
const { handler } = createRequire(import.meta.url)('../aws/notes/index.cjs');

const call = async (method, body, ip = '1.2.3.4') => {
  const r = await handler({ requestContext: { http: { method, sourceIp: ip } }, body: body && JSON.stringify(body) });
  return { status: r.statusCode, body: JSON.parse(r.body) };
};

let r = await call('GET');
assert.equal(r.status, 200);
assert.deepEqual(r.body.notes, []);

r = await call('POST', { name: 'Asha', msg: '  Loved the auction game!  ', color: 'pink' });
assert.equal(r.status, 201);
assert.equal(r.body.note.msg, 'Loved the auction game!');
assert.equal(r.body.note.color, 'pink');

r = await call('POST', { msg: 'Second note too soon' });
assert.equal(r.status, 429, 'same visitor within 30 s is refused');

r = await call('POST', { msg: 'Visit www.spam.example', name: 'x' }, '5.5.5.5');
assert.equal(r.status, 400, 'links are refused');

r = await call('POST', { msg: 'this is shit', color: 'purple' }, '6.6.6.6');
assert.equal(r.status, 201);
assert.equal(r.body.note.msg, 'this is s***');
assert.equal(r.body.note.color, 'yellow', 'unknown colours fall back to yellow');
assert.equal(r.body.note.name, 'A visitor');

r = await call('POST', { msg: '<script>alert(1)</script>' }, '7.7.7.7');
assert.equal(r.status, 201);
assert.ok(!/[<>]/.test(r.body.note.msg), 'angle brackets are stripped');

r = await call('POST', { msg: 'buy now', website: 'bot.example' }, '8.8.8.8');
assert.equal(r.status, 201);
assert.equal(r.body.note, undefined, 'the bot trap pretends to work but saves nothing');

r = await call('POST', { msg: 'x' }, '9.9.9.9');
assert.equal(r.status, 400, 'too short');

r = await call('POST', { msg: 'a'.repeat(500) }, '10.0.0.1');
assert.equal(r.body.note.msg.length, 240, 'long notes are cut to 240');

r = await call('GET');
assert.equal(r.body.notes.length, 4);
assert.equal(r.body.notes[0].msg.length, 240, 'newest first');
assert.ok(![...items.values()].some((i) => JSON.stringify(i).includes('1.2.3.4')), 'no IP address is stored');

const pre = await handler({ requestContext: { http: { method: 'OPTIONS', sourceIp: '1.2.3.4' } } });
assert.equal(pre.statusCode, 204, 'CORS preflight is answered');

r = await call('DELETE');
assert.equal(r.status, 405);
console.log('notes Lambda: all checks passed');
