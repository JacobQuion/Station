# Station

**Import → See everything → Do the next thing.**

A productivity app for students. Connect the calendar feeds your school already
publishes, get one dashboard for everything, and let Station tell you what to
work on next — rebuilding the plan automatically when you fall behind.

```bash
npm install
npm run dev          # http://localhost:5173
```

No account, no server-side storage. Everything lives in your browser.

---

## The three steps

### 1 · Import

| Source | What you need | What you get |
|---|---|---|
| **Calendar feed** | any `.ics` subscription URL | classes, assignments, exams, deadlines |
| **Canvas account** | your Canvas host + an access token | the above, plus points and submission status |
| **File upload** | a downloaded `.ics` | same as a feed, offline |
| **Sample semester** | nothing | a realistic mid-term week to explore |

Where the links live: Canvas → *Calendar → Calendar Feed*; Google Calendar →
*Settings → Secret address in iCal format*; Blackboard → *Get External Calendar
Link*; Moodle → *Export calendar*.

Schools don't serve CORS headers, so remote imports go through a tiny proxy
([`server/proxy.js`](server/proxy.js)) that runs inside the Vite dev server and
the production server alike. It refuses non-HTTP schemes and private/loopback
addresses. Canvas tokens are kept in your browser and sent only to your own
Canvas host.

Re-syncing merges rather than duplicates: imported fields refresh, but your
estimates, priorities and progress are preserved, and anything you finished or
created by hand is never deleted.

### 2 · See

One column, in the order you'd ask the questions. **Today** is a rail of your
classes and work blocks against a live now-marker. **This week** lists what's
due, grouped by day — anything further out stays behind a single click.
**Load** shows the next seven days against your daily capacity. Nothing that
won't fit appears at all unless something actually won't fit.

### 3 · Do

One card: the block to work on now, why it was chosen, and a timer. Mark it
done, or skip it — skipping doesn't drop the work, it moves it.

---

## How the planner works

[`src/lib/planner.ts`](src/lib/planner.ts) rebuilds the whole forward schedule
from *now* on every change.

1. **Commitments block out time.** Classes, labs and exams are fixed, padded by
   a buffer for getting there and back. All-day markers (holidays, term
   boundaries) show on the calendar but never count as busy.
2. **Free time becomes slots** inside your working window, minus commitments,
   capped by a daily ceiling so it can't cram a fortnight into tonight.
3. **Work is sorted by effective deadline** — earliest-deadline-first, which is
   optimal for feasibility, with high-priority items and exams pulled earlier.
4. **Pass one** fits every item's remaining effort before its deadline, in
   focus-sized chunks with breaks between.
5. **Pass two** parks whatever didn't fit into the earliest free time it can
   find, flagged as past-deadline — so "what's next" is never empty and a
   shortfall is visible instead of silently dropped.

**Falling behind is the normal case.** Any block whose time has passed without
being completed is marked *missed*. The work itself was never marked done, so
the next rebuild pulls it forward automatically. That's the entire replan
mechanism — no special-casing, no separate "catch-up mode". It runs on load, on
tab focus, and after every edit.

Imported assignments never carry effort estimates, so
[`src/lib/estimate.ts`](src/lib/estimate.ts) guesses from the title (an essay is
not a discussion post) and you correct it. A wrong-but-close number beats
prompting for input on forty items.

---

## Testing

```bash
npm run test        # planner + ICS import, headless, no browser
npm run test:e2e    # drives the real app in Chrome (needs `npm run dev` running)
```

The unit suite asserts the properties that matter: blocks never overlap, never
land on a class, never break working hours or the daily cap, urgent work
precedes distant work, progress shrinks future blocks, missed work is never
lost, and a holiday feed doesn't get turned into homework. The e2e suite walks
import → see → do, completes and skips blocks, rewinds the clock to simulate
falling behind, and checks the plan rebuilds.

`CHROME=/path/to/binary` overrides the browser; `BASE=` overrides the URL.

---

## Deploying

```bash
npm run build && npm run serve     # static build + import proxy on :4173
```

`server/index.js` is dependency-free Node. The proxy routes must stay available
in production — without them, remote imports fail on CORS.

---

## Toward iOS

The app is deliberately split so the move to native is additive, not a rewrite:

- **`src/lib/`** is pure TypeScript with no DOM or React — the planner,
  estimator, ICS parser and Canvas client all port as-is.
- **`src/store/`** is Zustand with a single persistence adapter; swapping
  `localStorage` for SQLite or `AsyncStorage` is one change.
- **`src/views/`** is the only browser-specific layer.

Fastest path: wrap the build with Capacitor for a native shell, background
sync, and local notifications when a block starts. A React Native client would
reuse `lib/` and `store/` unchanged and reimplement only the views. The proxy
becomes unnecessary on iOS — native HTTP isn't subject to CORS — so imports can
talk to Canvas directly.

---

## Layout

```
src/lib/        planner, ICS parser, Canvas client, estimator, time helpers
src/store/      Zustand store — import, merge, replan
src/views/      Import · Dashboard · Focus · Settings
src/components/ shared UI
server/         import proxy (shared by dev and prod) + static server
scripts/        test suites
```
