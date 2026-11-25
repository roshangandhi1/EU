# GoCongo EU programme platform

Monorepo for the GoCongo EU programme app (Haut-Lomami, DRC): web admin, public map and API (Next.js on Vercel), and later an offline-first Android app (Expo).

Scope: see the project scope documents.

## Layout

- `apps/web` — Next.js web app (deployed to Vercel; set the Vercel project's Root Directory to `apps/web`)
- `packages/` — shared code (types, validation, indicator logic, EN/FR strings), added as building starts

## Local development

```
npm install
npm run dev
```
