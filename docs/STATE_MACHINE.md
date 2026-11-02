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
- Every mission can be skipped. A skip goes straight to the case-study card and adds no fare.
- The ending never depends on finishing missions. After 3 stops the character points to the call.
- Exit (the X button or Esc) works from every state and returns to the normal page.
- If the game bundle fails to load, Play falls back to the portfolio link.
