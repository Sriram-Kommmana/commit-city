// Run locally with `npm run snapshot`. Writes content/skyline.json, which is committed.
// The deployed site never calls the GitHub API, at runtime or during the Amplify build.
import { readFileSync, writeFileSync } from 'node:fs';

const USER = 'Sriram-Kommmana';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'commit-city-snapshot' };
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;

async function get(url) {
  const res = await fetch(url, { headers });
  if (res.status === 409) return { res, body: [] }; // empty repository
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return { res, body: await res.json() };
}

async function commitCount(repo) {
  const { res, body } = await get(`https://api.github.com/repos/${USER}/${repo}/commits?per_page=1`);
  const last = (res.headers.get('link') ?? '').match(/[?&]page=(\d+)>; rel="last"/);
  return last ? Number(last[1]) : body.length;
}

const projects = JSON.parse(readFileSync('content/projects.json', 'utf8'));
const slugByRepo = Object.fromEntries(projects.filter((p) => p.repoName).map((p) => [p.repoName, p.slug]));

const { body: repos } = await get(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner`);
const own = repos.filter((r) => !r.fork && !r.private);

const out = [];
for (const r of own) {
  out.push({
    name: r.name,
    url: r.html_url,
    commits: await commitCount(r.name),
    language: r.language,
    createdAt: r.created_at.slice(0, 10),
    slug: slugByRepo[r.name] ?? null,
  });
}
out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

writeFileSync(
  'content/skyline.json',
  JSON.stringify({ user: USER, snapshotDate: new Date().toISOString().slice(0, 10), repos: out }, null, 2) + '\n',
);
console.log(`${out.length} public repos, ${out.reduce((n, r) => n + r.commits, 0)} commits`);
