# Commit City

A portfolio you can read in 30 seconds or ride through in 3 minutes. It's my entry for the AWS Student Builder Challenge.

- **The portfolio:** About, Skills and Projects are plain HTML on the first page, and every project has its own page.
- **The creative feature:** press **Play my story** for a playable comic. An auto-rickshaw takes you through five of my
  real projects while a mystery caller keeps phoning.
- **The skyline is real:** each building is one of my public repos, and each lit window is one commit.

## How it's built

| Part | Choice | Why |
|---|---|---|
| Site | Astro, static output | Real HTML for every page, with almost no JavaScript on load |
| Story mode | TypeScript, SVG, DOM and GSAP | Downloads only after Play, and needs no WebGL |
| Hosting | AWS Amplify Hosting | Builds from GitHub and serves over HTTPS from a global CDN |
| Data | `npm run snapshot` | GitHub data is captured locally and committed, so the live site calls no APIs |

```
GitHub (main) ──▶ Amplify build (amplify.yml) ──▶ Amplify Hosting CDN ──▶ visitor
```

## Run it

Needs Node 24.

```bash
npm install
npm run dev
```

## Where things live

| Path | What it holds |
|---|---|
| `content/*.json` | All the words and mission data, editable without touching code |
| `src/pages`, `src/components` | The portfolio and project pages |
| `src/game` | Story mode, lazy-loaded after Play |
| `src/art` | Hand-coded character and auto-rickshaw |
| `docs/STATE_MACHINE.md` | How story mode moves between screens |
| `DEV_LOG.md` | What broke and how it was fixed |

Run `npm run check:content` before a final deploy. It fails while any `TODO_USER` placeholder remains.

## How AI was used

I built this with Claude Code as my coding agent. TODO_USER: describe what you decided and directed, in your own words.

The fictional franchises and all art and sound are original. Open-world crime games inspired the structure, but no
assets, logos or audio from them are used.
