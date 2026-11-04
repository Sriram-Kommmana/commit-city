# Commit City

A portfolio you can read in 30 seconds or ride through in 3 minutes. It's my entry for the AWS Student Builder Challenge.

- **The portfolio:** About, Skills and Projects are plain HTML on the first page, and every project has its own page.
- **The creative feature:** press **Hop in** and drive an auto-rickshaw through the city to five of my real projects.
  Each stop is a short driving challenge built from that project, while a mystery caller keeps phoning.
- **The skyline is real:** each building is one of my public repos, and each lit window is one commit.

## How it's built

| Part | Choice | Why |
|---|---|---|
| Site | Astro, static output | Real HTML for every page, with almost no JavaScript on load |
| 3D city | Three.js and a custom comic shader | Scrolling falls through a living city, with a painted fallback if WebGL is off |
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
| `src/art` | The face illustration (made with Gemini) and the hand-coded auto-rickshaw |
| `docs/STATE_MACHINE.md` | How story mode moves between screens |
| `DEV_LOG.md` | What broke and how it was fixed |

Run `npm run check:content` before a final deploy. It fails while any `TODO_USER` placeholder remains.

## How AI was used

I use AI as a development collaborator, not as a replacement for understanding what I'm building.

I usually start by defining the problem, researching possible approaches, deciding on the architecture and figuring out
how the different parts of the system should work together. I then break the implementation into smaller phases and use
tools like Claude to help with implementation, generating code, exploring alternatives, writing tests and debugging.

I'm involved in reviewing the generated code, checking whether the implementation actually follows the intended
architecture, testing edge cases and making changes when something doesn't behave as expected.

For me, the important part isn't who typed every line of code. It's understanding the system well enough to make the
right decisions, identify problems and take responsibility for what eventually gets built. I want to be transparent about
using AI, because I think knowing how to work effectively with these tools is becoming an important engineering skill.

For this site, Claude Code was my coding agent. The comic illustration of my face was generated with Gemini, and the
character's body is drawn in code to match it.

Apart from that face illustration, the art is drawn in code and the soundtrack is synthesised live, so both are original. The fictional franchises are original too. Open-world crime games inspired the structure, but no
assets, logos or audio from them are used.
