# Disc Golf Stats – Supabase Edge Function

The source deployed to Supabase is version-controlled here, rather than maintained as a single function in the dashboard.

| File | Responsibility |
| --- | --- |
| `index.ts` | Check signed-in identity, friend/admin permission, requested section and filters. Load only the target player's rounds |
| `repository.ts` | Deterministic, paginated, chunked Supabase queries |
| `round-results.ts` | Validate hole scores and calculate complete round results |
| `player-overview.ts` | Wins, averages, handicap, rating and rating-based stability |
| `statistics.ts` | Head-to-head and statistics for the requested tab, assembled into the existing API response |
| `rating.ts` | Parse and evaluate course-specific rating formulas |
| `shared.ts` | Numerical and ordering helpers |
| `models.ts` | Database/round types |

## Loading model

1. The login dashboard sends `{ "section": "overview" }`, returning overview metrics without calculating every other tab.
2. Selecting a stats tab sends its matching `section` name. Profile tabs send the same requests for the explicitly opened player.
3. For each request the backend fetches only that player's rounds and score records for participants **in those rounds**. Co-player scores are needed to correctly calculate wins and head-to-head, but unrelated players' other rounds are never loaded.
4. Only `section: "all"` (legacy compatibility) calculates the entire report. Missing or unknown `section` values default to `all`.

Allowed sections: `overview`, `scorecards`, `headtohead`, `shots`, `frontback`, `best`, `holes`, `bestworst`, `rating`, `recent`, `allrounds`, `all`.

**Security:** All privileged reads happen only after `can_view_disc_golf_player` authorizes the selected player. Do not bypass the friendship check or send another player's complete record to the frontend.

## Deploy and build

The project root's `tsconfig.json` excludes `supabase/functions`, because Deno-specific imports cannot be typechecked as Next.js code. Deploy this Edge Function with **all files in the directory**. Keep `verify_jwt: true`.

Frontend API contract: `stats.player_stats` and filter metadata are always returned; arrays for nonrequested tabs are empty. The frontend should request a new section when navigating.
