DISC GOLF STATS - OFFLINE ROUND UPDATE

1. Replace:
   app/page.tsx
   app/NewRoundView.tsx

2. Add:
   lib/offline-rounds.ts
   lib/round-sync.ts

3. Copy the contents of APPEND-TO-globals.css to the BOTTOM of your existing app/globals.css.
   Do not replace your current globals.css because it may contain your newer PWA/mobile styles.

What this does:
- Every completed round is saved to IndexedDB on the phone FIRST.
- If online, page.tsx automatically syncs pending rounds to Supabase.
- If offline, the round remains in IndexedDB and shows as pending.
- When the connection returns while the app is open, syncing starts automatically.
- If the app is closed, the pending round remains on the phone. Because your auth uses sessionStorage,
  log in again next time; pending rounds for that auth user will then sync automatically.
- New courses and their holes can also be queued offline.
- Existing players/courses/holes are cached locally after a successful online load so New Round can still
  be reopened offline during the same installed-app setup.
