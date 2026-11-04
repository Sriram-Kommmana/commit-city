# Story mode state machine

```
landing ──Play──▶ intro ──▶ map ──marker──▶ banner ──▶ mission ──▶ stamp ──▶ card ──▶ map
                             │                                                        │
                             └────── phone: "Answer the call" (any time) ─▶ ending ◀──┘
                                                                              │
                                                              Accept mission ─▶ contact
```

Rules:

- Only one screen is mounted at a time, and each screen's cleanup runs before the next starts.
- A mission link from the portfolio skips the intro and goes straight to that mission's banner.
- Stops 1 to 4 are 2D arcade games (src/game/games): a brief card, the game, then the stamp. They need no WebGL,
  so they are the same everywhere. Stop 5, the mansion, is played at the wheel in the 3D city, with the quiz panel as
  its fallback without WebGL or with reduced motion.
- Every mission can be skipped. A skip goes straight to the case-study card and adds no fare.
- The ending never depends on finishing missions. After 3 stops the character points to the call.
- With the 3D city running, "map" is the drive: the player steers the auto, and reaching a stop's column of light is the marker. Without WebGL, or with reduced motion, it is the drawn map.
- Exit (the X button or Esc) works from every state and returns to the normal page.
- If the game bundle fails to load, Play falls back to the portfolio link.
