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
- **Character redraw from photos.** The first character was invented: spiky hair, yellow hoodie, no glasses. I sent 40
  photos of myself as reference and it was redrawn: wavy swept hair, dark rectangular glasses, thin mustache, grey
  blazer, blue neckband earphones and backpack. New poses come from the photos: sitting on the ledge with a knee up,
  laughing over the shoulder, hands in pockets, peace signs and holding the lapels. The photos stay out of the repo.
- **Bug: the first redraw looked nothing like me.** Proportions set by eye gave a giant tower of hair and glasses that
  covered the face. Fix: laid a grid over a three-quarter photo and traced the hairline, jaw, ear and glasses as numbers.
- **Bug: holes at the elbows and knees.** The parts of each limb were filled as one path with opposite windings, which
  cancelled out where they overlapped. Fix: each part is now filled on its own.
- **Bug: print dots looked like marks on the face.** The comic pass treats every mid-tone the same. Fix: the character is
  drawn with half alpha, which tells the pass to use a much lighter screen on those pixels.
- **Bug: the character was off screen on phones.** The wide rooftop shot left the ledge outside a narrow screen. Fix: on
  phones the camera turns toward the ledge until the jump.
- **Face change.** The hand-coded face still read as a cartoon, so the character now uses the face from a comic
  illustration of me, cut out into `src/art/face.webp`. The body is still drawn in code, and shocked and worried
  expressions are drawn on top of the picture. If the picture fails to load, a drawn head takes over.
- **Bug: the cut-out ate part of the glasses and hair.** Keying out the sky from the outside also removed the far lens,
  which shows sky through it. Fix: a protected area the key can't enter.
- **Bug: stripes across the cut-out.** The image library returned three channels where the code expected one. Fix: pull
  out a single channel explicitly.
- **Sharper big shots.** At normal sheet size the face was too soft when the character filled the screen. The poses that
  fill the screen now have their own higher-resolution sheet.
- **Body redraw to match the face.** The illustrated head looked pasted onto a flat cartoon, so the body was redrawn in
  the same comic-book style: limbs shaped like cloth with folds at the bends, black shadow spots, print dots where shadow
  meets light, thick-and-thin outlines, real hands with fingers, oxfords, and a fuller blazer and backpack. The light stays
  in one place in the scene, so the shadows move correctly as the character tumbles.
- **Bug: earphones on the forehead.** In falling poses the wires streamed up and were drawn over the face. Fix: the wires
  are drawn behind the head, and only the neckband in front of it.
- **Story mode's map became the real city.** The flat drawn map was the weakest screen left. Now the auto is driven through
  the same 3D city as the portfolio, with arrow keys, WASD or touch buttons, to five landmark buildings. Picking a stop
  makes it drive itself, using a route search over the road grid. The drawn map stays as the fallback when there's no WebGL
  or the visitor asks for reduced motion.
- **Bug: the painted roads were in the wrong place.** The ground shader drew roads half a block away from the real ones,
  under the buildings. It never showed from the air. It was obvious the moment a camera got down to street level.
- **Bug: skipped stops trapped the auto.** A stop that was skipped wasn't marked done, so it fired again as soon as the auto
  tried to leave it. Stops now have to be left once before they can trigger, and the auto ignores other stops while it's
  driving itself to one.
- **Bug: stuck in a wall.** A car could push the auto into a building, and every move after that counted as a collision, so
  it could never move again. Pushes now check for walls first, the auto steps out if it ever ends up inside one, and it
  swings round to slide along walls.

- **Removed the earphones.** The blue neckband earphones from my college photos read as a strange blue line across the
  collar at the size the character is drawn, so they're gone from every pose.
- **The fall made no sense, so now I swing.** Just dropping off the tallest tower and landing on an auto by luck
  was illogical. Now the character fires a commit line (a yellow cable with commit dots, from a gadget on the wrist)
  three times on the way down, hooks onto the city and swings across before letting go above the auto. I kept it my
  own gadget rather than a superhero web, so it stays original. The camera no longer barrel-rolls during the fall,
  because that fought the idea of a controlled swing and made "up" impossible to read.
- **The stops became driving challenges.** Driving the auto was the fun part, and every stop then stopped the game for a
  quiz panel. Now each stop is played at the wheel, in the city: three Two Sum test cases to drive through before the time
  limit at the hostel (a wall is a wrong answer), bid paddles to grab before the hammer falls at the cricket ground, an
  architecture-drift bug to chase down on tech street, a fork in the road with one Clipper moment down each way at the
  film market, and furniture on the street outside the mansion, where the piece that blinks is me. The quiz panels stay
  as the fallback without WebGL.
- **Balancing the chase.** The drift bug turned corners at full speed while the auto had to brake, so it always got away.
  It now glitches in place for a moment at every junction and slows down when it's far ahead.
- **"Play my story" became "Hop in".** The button now says what you actually do.
- **The driving challenges weren't fun either, so every stop became its own game.** Driving through gates said nothing
  about the projects. Now each stop is a different arcade game with a surprise, a joke and a payoff, built from the real
  project: the hostel goes dark and SolveFX's verdicts hunt you (each hit shows SolveFX's real overlay), you're the
  auctioneer while bots with my IPL game's real personalities bid money they don't have, the ShopWise codebase is a
  building that bugs keep drilling shortcuts through (RepoMind's drift), you direct a trailer from Clipper's real scored
  moments while the audio, captions and GPU fail like they really did, and the mansion's furniture moves when you're
  not looking. The teams and players in the auction are made up, so nothing belongs to a real league.
- **No more background music.** The synthesised hip-hop loop never fit, so it's gone. The sound effects stay: wind
  during the fall, a quiet siren in the chase, the commit line's zip, and hits for cuts and crashes.
- **A notes wall, on AWS.** Visitors can leave a note, feedback or a hello, and it goes up on the wall at once. It runs on
  a Lambda function behind an HTTP API, with notes in DynamoDB, all created from one CloudFormation template. Because
  notes go live instantly, the function refuses links, masks swearing, allows one note per visitor every 30 seconds,
  and catches bots with a hidden field. The Email button now also copies my address, for people with no mail app.
- **Sound on by default, and no wind.** Sound starts with the visitor's first click, tap or key press, since browsers
  block it before that; until then the button says "Click for sound". The wind during the fall was irritating, so it's
  gone. What's left: the siren in the chase, the commit line's zip, and hits.
