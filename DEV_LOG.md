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
- **Decision: no PixiJS.** With free driving cut, the map and missions don't need a WebGL renderer. SVG, DOM and GSAP
  keep the game bundle small and remove WebGL failure as a risk.
