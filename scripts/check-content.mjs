// Fails while any personal fact is still a placeholder. Run before the final deploy.
import { readdirSync, readFileSync } from 'node:fs';

const found = [];
const files = [...readdirSync('content').filter((f) => f.endsWith('.json')).map((f) => `content/${f}`), 'README.md'];
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (line.includes('TODO_USER:')) found.push(`${file}:${i + 1}  ${line.trim()}`);
    });
}

if (found.length) {
  console.error(`${found.length} placeholder(s) left:\n${found.join('\n')}`);
  process.exit(1);
}
console.log('No placeholders left.');

// Not a failure, because the site works without it, but the notes wall stays closed until it's set.
const site = JSON.parse(readFileSync('content/site.json', 'utf8'));
if (!site.notes?.api) console.warn('Reminder: content/site.json notes.api is empty, so the notes wall is closed. See docs/NOTES_SETUP.md.');
