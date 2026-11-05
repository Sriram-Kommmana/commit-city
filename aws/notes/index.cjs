// Commit City's notes wall. GET lists the latest notes; POST adds one. Notes go live at once,
// so posts are checked: a length limit, no links, a swear filter, a hidden bot trap,
// and one note per visitor every 30 seconds (by a hash of their IP, never the IP itself).
const { createHash } = require('node:crypto');

const T = process.env.TABLE;
let db;
const send = async (name, params) => {
  if (globalThis.notesDb) return globalThis.notesDb(name, params);
  const sdk = require('@aws-sdk/client-dynamodb');
  db ??= new sdk.DynamoDBClient({});
  return db.send(new sdk[name + 'Command'](params));
};

const out = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const COLORS = ['yellow', 'pink', 'cyan', 'green'];
const LINK = /https?:|www\.|\.(com|net|org|io|xyz|ru|in|ly|gg)\b/i;
const BAD = /\b(fuck|shit|bitch|cunt|asshole|bastard|whore|slut|dick|pussy|nigg|fag|retard)\w*/gi;
const mask = (s) => s.replace(BAD, (w) => w[0] + '*'.repeat(w.length - 1));
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

exports.handler = async (event) => {
  const http = event.requestContext?.http ?? {};
  if (http.method === 'GET') {
    const r = await send('Query', {
      TableName: T,
      KeyConditionExpression: 'pk = :p',
      ExpressionAttributeValues: { ':p': { S: 'note' } },
      ScanIndexForward: false,
      Limit: 60,
    });
    const notes = (r.Items ?? []).map((i) => ({ id: i.sk.S, name: i.name.S, msg: i.msg.S, color: i.color.S, at: Number(i.at.N) }));
    return out(200, { notes });
  }
  if (http.method === 'OPTIONS') return { statusCode: 204 };
  if (http.method !== 'POST') return out(405, { error: 'Use GET or POST.' });

  let b;
  try {
    b = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body || '{}');
  } catch {
    return out(400, { error: 'That note could not be read.' });
  }
  // The bot trap: a field people never see. Bots fill it in, and get told it worked.
  if (b.website) return out(201, { ok: true });
  const msg = clean(b.msg, 240);
  const name = clean(b.name, 32) || 'A visitor';
  if (msg.length < 2) return out(400, { error: 'Write a note first.' });
  if (LINK.test(msg) || LINK.test(name)) return out(400, { error: 'No links on the wall, sorry.' });

  const now = Date.now();
  const sec = Math.floor(now / 1000);
  const who = createHash('sha256').update(`${T}:${http.sourceIp ?? '?'}`).digest('hex').slice(0, 32);
  try {
    await send('PutItem', {
      TableName: T,
      Item: { pk: { S: 'rate' }, sk: { S: who }, ttl: { N: String(sec + 30) } },
      ConditionExpression: 'attribute_not_exists(sk) OR #t < :now',
      ExpressionAttributeNames: { '#t': 'ttl' },
      ExpressionAttributeValues: { ':now': { N: String(sec) } },
    });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return out(429, { error: 'One note every 30 seconds, please.' });
    throw e;
  }

  const note = {
    id: `${now}#${Math.random().toString(36).slice(2, 8)}`,
    name: mask(name),
    msg: mask(msg),
    color: COLORS.includes(b.color) ? b.color : 'yellow',
    at: now,
  };
  await send('PutItem', {
    TableName: T,
    Item: { pk: { S: 'note' }, sk: { S: note.id }, name: { S: note.name }, msg: { S: note.msg }, color: { S: note.color }, at: { N: String(now) } },
  });
  return out(201, { note });
};
