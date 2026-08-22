# Disc Golf Stats

Next.js frontend til Supabase Disc Golf Stats.

## Funktioner

- Login med Supabase Auth
- Opret bruger med navn, email og adgangskode
- Navnet sendes som `user_metadata.name`, så jeres database-trigger kan oprette spilleren i `public.players`
- Sæsonfilter
- Banefilter
- Oversigt over rating, handicap, sejre og consistency
- De fem seneste scorecards
- Head-to-head winrate
- Birdie/Bogey/Double+/Streger
- Front/Back statistik
- Bedste runde
- Hulgennemsnit og bedste score pr. hul
- Bedste/værste hul
- Rating progression

## 1. Environment variables

Lav `.env.local` lokalt eller sæt variablerne direkte i Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
```

Hvis projektet stadig bruger legacy anon key:

```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Brug aldrig Secret/Service Role key i denne frontend.

## 2. Edge Function

Frontend forventer en deployed Supabase Edge Function med navnet:

```text
disc-golf-stats
```

Den kaldes gennem `supabase.functions.invoke()` med den loggede brugers session.

## 3. Lokal test

```bash
npm install
npm run dev
```

Åbn http://localhost:3000

## 4. GitHub og Vercel

1. Upload hele denne mappe til et GitHub repository.
2. Opret et nyt projekt i Vercel og vælg repository'et.
3. Framework skal registreres som Next.js automatisk.
4. Tilføj de to `NEXT_PUBLIC_...` environment variables i Vercel.
5. Deploy.

## Supabase Auth

Hvis "Confirm email" er aktiveret i Supabase, får en ny bruger først en session efter at have bekræftet sin email.

Sørg også for at Vercel-domænet er tilladt under Supabase Auth URL/Redirect settings, hvis du bruger redirects/email-bekræftelse.

## Ny runde

Den indbyggede **Ny runde**-menu læser aktive spillere fra `players`, baner fra `courses` og huller fra `course_holes`. Ved gemning oprettes først en række i `rounds`, derefter deltagere i `round_players` og til sidst alle scores i `hole_scores`. Statistikken genindlæses automatisk bagefter.

Det kræver SELECT på `players`, `courses` og `course_holes` samt SELECT/INSERT/DELETE på `rounds` og INSERT på `round_players` og `hole_scores` for rollen `authenticated`, med tilsvarende RLS policies.

## Opret nye baner fra Ny runde

Frontendens "Ny runde" har nu valget "Ny bane". Brugeren kan skrive banens navn og lokation, tilføje huller løbende, vælge par og indtaste scores samtidig. Før det virker, skal `supabase-new-course-policies.sql` køres én gang i Supabase SQL Editor, så authenticated-brugere må INSERT'e i `courses` og `course_holes`.
