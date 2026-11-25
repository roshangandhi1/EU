# GoCongo EU programme platform

Monorepo for the GoCongo EU programme app (Haut-Lomami, DRC): web admin, public map and API (Next.js on Vercel), and an offline-first Android app (Expo, coming next).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for packages, conventions and the sync rules.

## Running it

```
npm install
npm test          # all tests, including the sync fuzz harness
npm run dev       # web app on http://localhost:3000 (needs DATABASE_URL)
```

## Deploying on Vercel

- Root Directory: `apps/web`.
- Add a Neon Postgres database from the project's Storage tab; it sets `DATABASE_URL`. Migrations run on each build.
- Set `SETUP_TOKEN` to a long random value, open `/fr/setup` once to create the first administrator, then delete `SETUP_TOKEN`.
