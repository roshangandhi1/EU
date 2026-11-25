# Module screens

One folder per stream: `schools/`, `forestry/` (bamboo + miombo), `boreholes/`.
Each module exports its screens and a home tile; read and write records only through
`session.client` (create/update/void/get/list) so every change goes through the outbox
and the sync rules in `packages/sync`. Never write to the SQLite tables directly.
