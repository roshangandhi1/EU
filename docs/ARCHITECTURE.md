# Architecture and conventions

The platform is one TypeScript monorepo (npm workspaces). Module threads build on it; keep to these rules so work merges cleanly.

## Packages

| Package | Owns |
| --- | --- |
| `@eu/core` | Roles, the permission registry (`can`), conflict policies, clock checks, English/French strings (`@eu/core/i18n`), design tokens (`@eu/core/tokens`) |
| `@eu/db` | Drizzle platform schema, `syncColumns()`, database clients, the single migrations folder |
| `@eu/sync` | `defineEntity`, the wire protocol, the server engine (`@eu/sync/server`) and phone client (`@eu/sync/client`) |
| `apps/web` | Next.js on Vercel: web admin, public pages, API (`/api/auth`, `/api/devices`, `/api/sync`) |
| `packages/<module>` | A module's tables, zod schemas, actions, entities, rules and strings |

## Adding a module's record types

1. Tables in `packages/<module>/src/db/schema.ts`; every synced table spreads `...syncColumns()`. Places (schools, boreholes, plots) are rows in platform `sites`; module attributes live in a table keyed by `site_id`.
2. Named actions as an `ActionMap` (e.g. `"payment.void": { stream: "schools", roles: [...] }`).
3. Entities via `defineEntity({ name, stream, table, schema, policy, actions, label })`. The zod `schema` describes the module's own fields in wire format (dates as ISO strings), never the sync columns.
4. Register both in `apps/web/lib/registry.ts`.
5. Strings in `packages/<module>/src/i18n/{en,fr}.ts`, registered with `registerNamespace`.

## Conflict policies

| Policy | Use for | Behaviour |
| --- | --- | --- |
| `append_only` | Visits, readings, payments, receipts | Created once; only a void (with reason) is allowed afterwards |
| `field_merge` | People, site attributes | Different fields merge; same-field clashes keep the server value and open a `sync_conflicts` row for review |
| `lww_history` | Attendance, marks | Later phone time wins; superseded edits stay in `audit_log` |
| `server_authoritative` | Settings, schedules, grading schemes | Only holders of the entity's `configure` action may change it |

## Evidence rules

- `device_time` is when the phone captured a record (self-reported); `server_time` is when the server first received it (trusted).
- Assessor evidence exports count only records with `server_time` on or before the cut-off. Records captured before but received after are listed separately and join the count only after a logged admin review.
- Phones whose clock is more than 10 minutes off are flagged (`clock_suspect`).
- Nothing is deleted. Every applied, superseded, conflicting or rejected change is in `audit_log`.

## Migrations

One history in `packages/db/migrations`. Generate with `npm run db:generate` only after rebasing onto the latest `main`; whoever merges second regenerates. CI fails if the schema and migrations disagree. Migrations run automatically during the Vercel build when `DATABASE_URL` is set.

## Tests

`vitest`. Database tests run on PGlite (in-process Postgres), so CI needs no database. The sync fuzz harness (`packages/sync/test/fuzz.test.ts`) must stay green; set `SYNC_FUZZ_SEEDS` / `SYNC_FUZZ_STEPS` to run it harder.

## Branches

`claude/<area>-*`, pull requests into `main`, CI green, squash-merge.

## Android app (apps/mobile)

- Expo SDK 58. It sits **outside** the root npm workspaces, so Vercel installs stay lean: run `npm ci` inside `apps/mobile`.
- Metro resolves `@eu/core` and `@eu/sync` straight from `packages/` TypeScript source (`metro.config.js`). The app may import only browser-safe entry points: `@eu/core`, `@eu/core/i18n`, `@eu/core/tokens`, `@eu/sync/client`, `@eu/sync/sql-store`, and each module's `@eu/<module>/mobile` (phone-safe rules and strings, no database code; e.g. `@eu/schools/mobile`). Never import `@eu/sync/server` or `@eu/db`.
- Storage: `SqlStore` (the same code the sync harness tests) over expo-sqlite with SQLCipher. The 256-bit key is generated on first launch and kept in secure storage.
- Sign-in: email and password once online, which registers the phone and gets a 180-day device token. After that, a 4–6 digit PIN. Five wrong PINs force an online sign-in, and unsynced work is kept. A different user cannot sign in while the previous user's work is unsynced. A revoked device is wiped.
- Sync runs on unlock, when the app returns to the foreground, every 5 minutes, and when the network comes back. The home screen shows pending, rejected and clock warnings.
- Module screens go in `apps/mobile/src/modules/<stream>/`. They read and write only through `session.client`. A module's Home tile appears only when the phone holds a record for that stream, so multi-stream users see only what they need.
- Build: `eas build -p android --profile preview` produces a signed APK for private distribution. This needs an Expo account, which is not set up yet.

## Evidence photos

- **Phone:** `session.files.capture({ entity, scopeId })` opens the camera. It compresses the photo to a 1600 px JPEG, adds GPS (a 10 s fix, otherwise the last known position) and device time, stores it in app-private storage (protected by Android device encryption; not SQLCipher), and returns `{ fileId }` straight away, offline. Store `fileId` in the record, e.g. `photoIds: z.array(z.string().uuid())`.
- **Upload:** photos upload after each successful record sync (`POST /api/files`, multipart `meta` plus `file`), 10 per pass, and they are retried until accepted. A record never waits for its photo. `session.files.status(id)` returns `local`, `uploaded`, `rejected` or `missing`.
- **Server:** `acceptUpload` checks the sha256, the entity's **write** permission at the scope, and the same scope rules as records. It stores the file privately in Vercel Blob (`evidence/<stream>/<id>.jpg`) and writes a `files` row. A retry with the same id and bytes is answered `duplicate`.
- **Reading:** `GET /api/files/<id>` streams the photo to users who hold the entity's **read** permission.
- **Indicators and exports:** use `uploadedFileIds(db, ids, cutoff?)`. A photo counts only once `uploaded_at` is on or before the cut-off.
- **Storage:** needs `BLOB_READ_WRITE_TOKEN`, set for Production only. Without it, uploads answer 503 and phones keep the photos.

## Evidence cut-offs and phones (web admin)

- **`/<locale>/admin/evidence`** (`evidence.manage`: system admin, programme manager): create a cut-off, entered in Haut-Lomami time (UTC+2).
  - Each cut-off page shows, per record type: counted (received by the server by the cut-off), late (captured before, received after), the decisions taken on late records, and wrong-clock counts.
  - Late records are admitted or excluded with a required reason. Decisions can be changed, and every one is audited.
  - The CSV download (also audited) lists every record captured by the cut-off with its status, device time, server time, device and author.
- **Modules:** pass `admittedIds(db, cutoffId, entity)` into their as-at split, so only admitted late records count.
- **Phones:** after each sync, phones POST `/api/device/status` with their unsynced change and photo counts. The answer gives the next cut-off, and the phone shows "Sync before …" when one is within 7 days.
- **`/<locale>/admin/phones`** (`devices.manage`): last sync, last reported unsynced work and clock skew (flagged beyond 10 minutes) for each phone. Removing a phone shows its last-reported unsynced counts and requires a confirmation tick.
