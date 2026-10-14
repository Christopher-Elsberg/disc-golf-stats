# Disc Golf Stats Edge Function

This function is version-controlled and organized by responsibility:

- `index.ts`: authorization, selected-player loading and validation.
- `repository.ts`: paginated Supabase queries with deterministic ordering.
- `statistics.ts`: per-round, head-to-head and aggregate statistics.
- `rating.ts`: rating-formula parser and evaluator.
- `shared.ts`: common math, sorting and date helpers.
- `models.ts`: typed database models.

**Important:** The API only fetches round scores for the authorized requested player and the other participants in their shared rounds. The default request targets the signed-in player; friends' profiles must be explicitly opened. Never perform privileged reads before the authorization check.
