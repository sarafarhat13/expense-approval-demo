# Traqspera — Expense Approval Demo

Approve / decline workflow on the Traqspera **Expense Summary** page, built
with [Modus Web Components](https://modus.trimble.com/) and a small PHP +
SQLite backend.

> **Live demo:** _enable GitHub Pages on this repo to populate this URL._

## Behavior

| Row state | Buttons shown        | What happens                                                               |
| --------- | -------------------- | -------------------------------------------------------------------------- |
| Pending   | Approve · Decline    | Approve = instant + 5s **Undo** toast. Decline opens the reason modal.    |
| Approved  | Decline only         | Lets an admin reverse the decision; opens the decline reason modal.        |
| Declined  | Approve only         | Lets an admin reverse a previous decline; instant approve with **Undo**.   |

A few extra niceties:

- **Required reason on decline** (≥10 chars) — captured via a Modus modal
  with a `modus-wc-textarea`. The submitter sees the reason on the audit
  popover.
- **Undo toast** appears at the bottom-end for 5s after every status change.
- **Status chips are clickable** — they open an audit popover showing who
  changed the status, when, and (for declines) the reason.
- **Search + category + status filters** work together; status pill counts
  update live.
- **Reset demo data** in the table footer reloads the seed JSON.

## How it's wired

```
┌──────────── front-end (GitHub Pages) ────────────┐
│  index.html  +  Modus Web Components from CDN     │
│  assets/js/app.js                                 │
│         │                                         │
│         ▼  detects which backend to use           │
│  ┌──────────────────┐    ┌─────────────────────┐  │
│  │  PHP API (real)  │ or │ localStorage demo   │  │
│  │  api/expenses.php│    │ seeded from JSON    │  │
│  └──────────────────┘    └─────────────────────┘  │
└──────────────────────────────────────────────────┘
```

The JS adapter pings `./api/expenses.php?ping=1` on load. If that returns
JSON it uses the real PHP backend; otherwise it falls back to a
`localStorage` simulator pre-seeded from
[`assets/data/expenses.json`](./assets/data/expenses.json).

That means the same code works as a static site on **GitHub Pages** _and_ on
any PHP-capable host without changing a line.

## Run it locally

### Static demo only (no backend)

```bash
# Any static server works:
python3 -m http.server 8000
# then open http://localhost:8000
```

### Full stack (PHP backend reachable)

```bash
# requires PHP 8.0+ with pdo_sqlite enabled
php -S 127.0.0.1:8000
# then open http://127.0.0.1:8000
```

The first request creates `api/data/expenses.sqlite` and seeds it from the
JSON file.

## Project layout

```
.
├── index.html
├── assets/
│   ├── css/styles.css           # Modus Blueprint design tokens applied as CSS variables
│   ├── js/app.js                # State, rendering, approve/decline, modal, toast, audit
│   └── data/expenses.json       # Seed data used by both the static demo and PHP backend
└── api/                         # PHP + SQLite backend (auto-seeds on first request)
    ├── expenses.php
    ├── README.md
    └── .htaccess
```

## Tech notes

- Modus Web Components 1.8 are loaded directly from a CDN — no build step.
- The **decline modal** uses the native `<dialog>` exposed by
  `modus-wc-modal` via `modal-id`, so we drive it with `showModal()` and
  `close()`.
- The **toast** wraps `modus-wc-toast` (positioning) and adds a custom
  card with an `Undo` `modus-wc-button` — Modus 2.x toasts no longer ship
  built-in dismiss logic, so the timer + undo are managed in `app.js`.
- The audit popover is a tiny custom popover (not `modus-wc-tooltip`)
  because we need it to be interactive and stay open while the user reads
  it; it auto-positions and closes on outside-click / `Escape` / scroll.

## License

MIT
