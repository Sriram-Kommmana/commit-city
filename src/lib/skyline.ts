// Loads the committed GitHub snapshot, and falls back to a static copy if it is missing.
interface Repo {
  name: string;
  url: string;
  commits: number;
  language: string | null;
  createdAt: string;
  slug: string | null;
}

interface Snapshot {
  user: string;
  snapshotDate: string;
  repos: Repo[];
}

const files = import.meta.glob<Snapshot>('../../content/skyline*.json', { eager: true, import: 'default' });
export const skyline: Snapshot =
  files['../../content/skyline.json'] ?? files['../../content/skyline.fallback.json'];

export const COLS = 8;
export const CELL = 7;
export const GAP = 7;
export const BUILDING_W = COLS * CELL + 8;
export const BASE_H = 18;

export const rowsFor = (commits: number) => Math.ceil(commits / COLS);
export const heightFor = (commits: number) => rowsFor(commits) * CELL + BASE_H;

export const totalCommits = skyline.repos.reduce((n, r) => n + r.commits, 0);
export const tallest = skyline.repos.reduce((a, b) => (b.commits > a.commits ? b : a));
