# Traqspera Expense API (PHP)

A tiny single-file PHP backend for the expense approval demo. Uses SQLite, no
extra dependencies.

## Endpoints

| Method | Path                          | Description                             |
| ------ | ----------------------------- | --------------------------------------- |
| GET    | `expenses.php`                | List all expenses                       |
| GET    | `expenses.php?ping=1`         | Health check (used by the front-end)    |
| POST   | `expenses.php`                | Update one expense (`id`, `status`, `audit`) |
| POST   | `expenses.php?reset=1`        | Re-seed from `assets/data/expenses.json` |

## Run locally

```bash
# from the repo root
php -S 127.0.0.1:8000
```

Then visit <http://127.0.0.1:8000/> — the front-end will detect the API and
hit it instead of `localStorage`.

## Deploy

Any PHP 8.0+ host with the `pdo_sqlite` extension works (Hostinger, IONOS,
Render's PHP runtime, a $5 DigitalOcean droplet, etc.). Upload the whole repo,
make sure the `api/data/` directory is writable by PHP, and you're done.

> **GitHub Pages cannot run PHP.** It serves the front-end only. The bundled
> JS adapter automatically falls back to `localStorage` so the demo still
> works on Pages — every visitor gets their own private copy of the data.

## Storage

State lives in `api/data/expenses.sqlite`, created on the first request and
seeded from `assets/data/expenses.json`. Delete that file (or hit
`?reset=1`) to start fresh.
