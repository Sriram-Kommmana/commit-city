# Development log

A running record of what broke and how it was fixed. It feeds the "challenges" part of the project write-up.

## 2026-11-02

- **Concept change: dropped the Redis mission.** The plan had a Redis in C++ mission, but `main.cpp` in that repo is
  still the 61-line starter with no commands. A mission would have claimed work that doesn't exist. SolveFX took its
  place, and Redis stays as a one-line terminal joke.
- **Skyline surprise.** The GitHub snapshot showed the tallest repo is DSACCPP with 280 commits, not the auction game
  with 140. The site now reports that.
- **Mimic Hunt has no public repo,** so it isn't in the skyline and its page says the source isn't public yet.
- **Bug: the hero title could stay invisible.** Its entrance animation started at `opacity: 0`, and in a throttled
  browser it stayed there. Fix: entrance animations now only change scale, so the title is visible from the first frame.
- **Bug: story mode could hang on a throttled device.** The test browser ran 0 animation frames per second unless it
  was capturing a screenshot, and game progress was waiting on animation callbacks. Fix: progress now runs on timers,
  and animation is decoration only.
- **Bug: screens stayed offset 24px to the right.** A stalled entrance tween kept its transform. Fix: a timer kills the
  tween and clears the transform after 450 ms.
- **Bug: the map overflowed the screen.** Its height came from a percentage of a parent with no definite height. Fix:
  the size is now calculated from the viewport.
- **Bug: "repository" labels were invisible.** A CSS rule overrode the SVG `fill` attribute with the same dark colour
  as the box. Fix: the label sets its colour in an inline style.
- **Bug: the road covered the Play button on short laptop screens.** It only showed up in the 1200 × 630 share image.
  Fix: a smaller title on short screens, and reserved space above the road. Checked at 1366 × 620.
- **Decision: no PixiJS.** With free driving cut, the map and missions don't need a WebGL renderer. SVG, DOM and GSAP
  keep the game bundle small and remove WebGL failure as a risk.
- **Redesign: the first version looked like a static poster.** It had a strong title but no depth and no motion, so
  the landing page was rebuilt as a real-time 3D city with a comic shader (ink lines, print dots, off-register colour).
  Scrolling now jumps off the tallest tower and falls through the city into a street chase. Story mode plays over the
  moving city. The 3D city is decoration: with WebGL off, the page and story mode still work over a painted sky.
- **Speed.** Measured on an Intel UHD integrated GPU while scrolling the whole journey: 69 fps at 1080p and 117 fps at
  720p. Lighthouse's mobile test dropped to 66 for performance, because it renders WebGL on a throttled CPU.
- **Bug: bash heredocs mangled a long patch.** Patches went into script files instead.
- **Second redesign pass.** Reviewing the journey frame by frame showed four weak spots: the character held one pose,
  nothing happened on load, there was only one camera, and the street was empty. Added: a 15-pose hand-inked character
  with a look back at the camera before the jump, an opening shot sequence on load, live split-screen comic panels from
  several cameras, traffic, a DEADLINE van chase with sirens, a stunt jump, rooftop tanks, wires, kites and a soundtrack
  synthesised live with no audio files.
- **Bug: the comic panels vanished in testing.** The slow software renderer used for screenshots tripped the automatic
  quality drop, which turns the extra cameras off. Fix: a test flag holds the quality fixed. The drop stays on for real
  visitors on slow devices.
- **Bug: close-ups showed nothing.** Every panel aimed its subject at the centre of the screen, which was outside the
  panel. Fix: each panel's camera now shifts its view so the subject sits inside that panel.
- **Bug: stars pinched into a spiral overhead.** Their grid used an angle that bunches up at the zenith. Fix: a
  projection with no pole.
