// Fails while any personal fact is still a placeholder. Run before the final deploy.
import { readdirSync, readFileSync } from 'node:fs';

const found = [];
const files = [...readdirSync('content').filter((f) => f.endsWith('.json')).map((f) => `content/${f}`), 'README.md'];
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (line.includes('TODO_USER')) found.push(`${file}:${i + 1}  ${line.trim()}`);
    });
}

if (found.length) {
  console.error(`${found.length} placeholder(s) left:\n${found.join('\n')}`);
  process.exit(1);
}
console.log('No placeholders left.');
