export const PAGE_SIZE = 1000;
const ROUND_ID_CHUNK = 50;

/** Stable ordering is essential when PostgREST returns more than one page. */
export async function fetchAll(client: any, table: string, columns: string): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from(table).select(columns)
      .order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(table + ": " + error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Read only the requested player's rounds (and participants in those rounds). */
export async function fetchByRoundIds(
  client: any, table: string, columns: string, roundIds: string[], column = "round_id",
): Promise<any[]> {
  if (roundIds.length === 0) return [];
  const rows: any[] = [];
  for (let i = 0; i < roundIds.length; i += ROUND_ID_CHUNK) {
    const ids = roundIds.slice(i, i + ROUND_ID_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      const query = client.from(table).select(columns).in(column, ids);
      const ordered = table === "round_players"
        ? query.order("round_id", { ascending: true }).order("player_id", { ascending: true })
        : query.order("id", { ascending: true });
      const { data, error } = await ordered.range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(table + ": " + error.message);
      const page = data ?? [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}
