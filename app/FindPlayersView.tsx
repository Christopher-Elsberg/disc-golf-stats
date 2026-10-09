"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Scorecard, StatsResponse } from "@/types/stats";
import styles from "./FindPlayersView.module.css";

type PublicPlayer = { id: string; name: string; active: boolean; auth_user_id: string | null };
type Friendship = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: "pending" | "accepted";
  created_at: string;
};

type Props = {
  currentPlayerId: string | null;
  season: string;
  courseId: string;
  onRelationshipsChanged?: () => void;
};

function num(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits).replace(".", ",");
}

function vsPar(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value === 0) return "E";
  return value > 0 ? `+${num(value)}` : num(value);
}

function date(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d
    ? new Intl.DateTimeFormat("da-DK").format(new Date(y, m - 1, d))
    : value;
}

function Box({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={styles.section}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function ProfileScorecard({ scorecard }: { scorecard: Scorecard }) {
  const player = scorecard.players[0];
  if (!player) return null;
  const scores = new Map(player.scores.map((s) => [s.hole_id, s.strokes]));
  return (
    <details className={styles.scorecard}>
      <summary>
        <span><strong>#{scorecard.round_number}</strong> {scorecard.course_name}</span>
        <span>{date(scorecard.date)} | {player.total_strokes} ({vsPar(player.score_to_par)})</span>
      </summary>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead><tr><th>Hul</th><th>Par</th><th>Slag</th><th>Vs. par</th></tr></thead>
          <tbody>
            {scorecard.holes.map((hole) => {
              const strokes = scores.get(hole.hole_id);
              return (
                <tr key={hole.hole_id}>
                  <th>{hole.hole_label}</th><td>{hole.par}</td>
                  <td>{strokes ?? "-"}</td>
                  <td>{strokes == null ? "-" : vsPar(strokes - hole.par)}</td>
                </tr>
              );
            })}
            <tr className={styles.total}><th>I alt</th><td>{scorecard.course_par}</td>
              <td>{player.total_strokes}</td><td>{vsPar(player.score_to_par)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}

function RatingPlot({ values }: { values: Array<{ round_number: number; rating: number | null }> }) {
  const rated = values.filter((r): r is {round_number: number; rating: number} => r.rating !== null);
  if (rated.length === 0) return <p className={styles.muted}>Ingen ratede runder endnu.</p>;
  const w = 620, h = 190, pad = 28;
  const lo = Math.min(...rated.map((r) => r.rating)) - 15;
  const hi = Math.max(...rated.map((r) => r.rating)) + 15;
  const x = (i: number) => rated.length === 1 ? w / 2 : pad + (i / (rated.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - lo) / Math.max(1, hi - lo)) * (h - 2 * pad);
  const path = rated.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r.rating).toFixed(1)}`).join(" ");
  return (
    <div className={styles.plotScroll}>
      <svg className={styles.plot} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Rating over spillede runder">
        {[0, 0.5, 1].map((factor) => {
          const yy = pad + factor * (h - pad * 2);
          return <g key={factor}>
            <line x1={pad} x2={w - pad} y1={yy} y2={yy} stroke="currentColor" strokeOpacity=".12"/>
            <text x="0" y={yy + 4} fill="currentColor" fontSize="12">{num(hi - (hi - lo) * factor, 0)}</text>
          </g>;
        })}
        <path d={path} fill="none" stroke="#13a37b" strokeWidth="3" strokeLinejoin="round" />
        {rated.map((r, i) => <circle key={r.round_number} cx={x(i)} cy={y(r.rating)} r="4" fill="#13a37b">
          <title>{`Runde ${r.round_number}: ${num(r.rating, 0)}`}</title>
        </circle>)}
        <text x={pad} y={h - 2} fontSize="12" fill="currentColor">R{rated[0].round_number}</text>
        <text x={w - pad} y={h - 2} textAnchor="end" fontSize="12" fill="currentColor">R{rated[rated.length - 1].round_number}</text>
      </svg>
    </div>
  );
}

export default function FindPlayersView({ currentPlayerId, season, courseId, onRelationshipsChanged }: Props) {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [relationships, setRelationships] = useState<Friendship[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileStats, setProfileStats] = useState<StatsResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const profileRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refreshRelationships() {
    const { data, error: friendshipError } = await supabase
      .from("friendships")
      .select("id,requester_id,recipient_id,status,created_at");
    if (friendshipError) throw friendshipError;
    setRelationships((data ?? []) as Friendship[]);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadPlayers() {
      setLoading(true);
      const [playersResult, roleResult, friendsResult] = await Promise.all([
        supabase.from("players").select("id,name,active,auth_user_id").order("name", { ascending: true }),
        currentPlayerId
          ? supabase.from("players").select("role").eq("id", currentPlayerId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("friendships").select("id,requester_id,recipient_id,status,created_at"),
      ]);
      if (cancelled) return;
      const loadError = playersResult.error || roleResult.error || friendsResult.error;
      if (loadError) setError(loadError.message);
      else {
        const admin = roleResult.data?.role === "admin";
        setPlayers(((playersResult.data ?? []) as PublicPlayer[]).filter((p) => admin || p.active));
        setRelationships((friendsResult.data ?? []) as Friendship[]);
        setIsAdmin(admin);
      }
      setLoading(false);
    }
    void loadPlayers();
    return () => { cancelled = true; };
  }, [currentPlayerId]);

  function relationFor(playerId: string): Friendship | undefined {
    return relationships.find((f) =>
      (f.requester_id === currentPlayerId && f.recipient_id === playerId) ||
      (f.recipient_id === currentPlayerId && f.requester_id === playerId));
  }

  function canView(playerId: string): boolean {
    return isAdmin || playerId === currentPlayerId || relationFor(playerId)?.status === "accepted";
  }

  async function action(playerId: string, op: "send" | "accept" | "reject" | "remove") {
    const relation = relationFor(playerId);
    setBusyActionId(playerId);
    setError("");
    try {
      let result;
      if (op === "send") {
        result = await supabase.rpc("send_disc_golf_friend_request", { p_recipient_id: playerId });
      } else if (op === "remove") {
        result = await supabase.rpc("remove_disc_golf_friendship", { p_friendship_id: relation?.id });
      } else {
        result = await supabase.rpc("respond_disc_golf_friend_request", {
          p_request_id: relation?.id,
          p_accept: op === "accept",
        });
      }
      if (result.error) throw result.error;
      await refreshRelationships();
      onRelationshipsChanged?.();
      if (op === "remove" && selectedId === playerId && !isAdmin) setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyActionId(null);
    }
  }

  useEffect(() => {
    if (!selectedId || !canView(selectedId)) {
      setProfileStats(null);
      return;
    }
    let cancelled = false;
    async function loadProfile() {
      setProfileLoading(true);
      setProfileError("");
      setProfileStats(null);
      const body: Record<string, string | number> = { player_id: selectedId! };
      if (season !== "all") body.season = Number(season);
      if (courseId !== "all") body.course_id = courseId;
      try {
        const { data, error: requestError } = await supabase.functions.invoke(
          "disc-golf-stats", { body },
        );
        if (requestError) throw requestError;
        if (data?.error) throw new Error(String(data.error));
        if (!cancelled) setProfileStats(data as StatsResponse);
      } catch (err) {
        if (!cancelled) setProfileError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, [selectedId, season, courseId, currentPlayerId, isAdmin, relationships]);

  useEffect(() => {
    if (selectedId) profileRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  const matches = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("da-DK");
    return players.filter((player) =>
      player.name.toLocaleLowerCase("da-DK").includes(search));
  }, [players, query]);

  const incoming = relationships.filter((f) =>
    f.recipient_id === currentPlayerId && f.status === "pending");
  const accepted = relationships.filter((f) => f.status === "accepted");
  const selected = players.find((player) => player.id === selectedId) ?? null;
  const p = selected ? profileStats?.stats.player_stats.find((row) => row.player_id === selected.id) : null;
  const shot = selected ? profileStats?.stats.shot_counts.find((row) => row.player_id === selected.id) : null;
  const best = selected ? profileStats?.stats.best_rounds.find((row) => row.player_id === selected.id)?.best_round : null;
  const history = selected ? profileStats?.stats.rating_history.find((row) => row.player_id === selected.id)?.history ?? [] : [];
  const recent = [...history].sort((a, b) => b.round_number - a.round_number).slice(0, 5);
  const cards = selected && profileStats
    ? (profileStats.stats.player_last_five_scorecards?.[selected.id] ??
      profileStats.stats.last_five_scorecards.filter((round) =>
        round.players.some((v) => v.player_id === selected.id)))
        .map((round) => ({ ...round, players: round.players.filter((v) => v.player_id === selected.id) }))
    : [];
  const headToHead = selected ? profileStats?.stats.head_to_head.filter((row) =>
    row.player_1_id === selected.id || row.player_2_id === selected.id) ?? [] : [];
  const frontBack = selected ? profileStats?.stats.front_back.flatMap((course) => {
    const row = course.players.find((player) => player.player_id === selected.id);
    return row && row.rounds > 0 ? [{ ...row, course_name: course.course_name, front_label: course.front_label, back_label: course.back_label }] : [];
  }) ?? [] : [];
  const bestWorst = selected ? profileStats?.stats.best_worst_holes.filter((row) =>
    row.player_id === selected.id && (row.best_hole !== null || row.worst_hole !== null)) ?? [] : [];
  const holeStats = selected ? profileStats?.stats.hole_stats.map((course) => ({
    ...course,
    holes: course.holes.flatMap((hole) => {
      const row = hole.players.find((player) => player.player_id === selected.id);
      return row && row.all_time_samples > 0 ? [{ ...hole, player: row }] : [];
    }),
  })).filter((course) => course.holes.length > 0) ?? [] : [];

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <div className={styles.headerRow}>
          <h2>Find spillere og venner</h2>
          <button type="button" className={styles.refreshButton}
            onClick={() => void refreshRelationships().catch((err) => setError(String(err)))}>
            Opdater anmodninger
          </button>
        </div>
        <p className={styles.muted}>
          S&#xF8;g efter spillere, send en venneanmodning, og se alle stats n&#xE5;r I er venner.
          {isAdmin ? " Som admin kan du se alle profiler." : ""}
        </p>
        {incoming.length > 0 ? (
          <div className={styles.requests}>
            <h3>Venneanmodninger ({incoming.length})</h3>
            {incoming.map((relation) => {
              const player = players.find((p) => p.id === relation.requester_id);
              return (
                <div className={styles.requestRow} key={relation.id}>
                  <strong>{player?.name ?? "Spiller"}</strong>
                  <div className={styles.actions}>
                    <button type="button" disabled={!!busyActionId}
                      onClick={() => void action(relation.requester_id, "accept")}>Accepter</button>
                    <button type="button" disabled={!!busyActionId}
                      onClick={() => void action(relation.requester_id, "reject")}>Afvis</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <p className={styles.muted}>Du har {accepted.length} {accepted.length === 1 ? "ven" : "venner"}.</p>
        <label className={styles.searchLabel} htmlFor="player-search">S&#xF8;g efter spiller</label>
        <input id="player-search" type="search" value={query}
          onChange={(e) => setQuery(e.target.value)} placeholder="Skriv et spillernavn..."
          className={styles.search} autoComplete="off" />
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.muted}>Henter spillere...</p> : (
          <div className={styles.results}>
            {matches.length === 0 ? <p className={styles.muted}>Ingen spillere matcher din s&#xF8;gning.</p> : null}
            {matches.map((player) => {
              const relation = relationFor(player.id);
              const viewAllowed = canView(player.id);
              const pendingOut = relation?.status === "pending" && relation.requester_id === currentPlayerId;
              const pendingIn = relation?.status === "pending" && relation.recipient_id === currentPlayerId;
              return (
                <div key={player.id} className={`${styles.result} ${selectedId === player.id ? styles.selected : ""}`}>
                  <span className={styles.avatar}>{player.name.slice(0, 1).toLocaleUpperCase("da-DK")}</span>
                  <span className={styles.playerName}>
                    <strong>{player.name}{player.id === currentPlayerId ? " (dig)" : ""}</strong>
                    <small>{relation?.status === "accepted" ? "Ven" : pendingIn ? "Afventer dit svar" : pendingOut ? "Anmodning sendt" : viewAllowed ? "Profil tilg\u00e6ngelig" : !player.auth_user_id ? "Ingen login-konto" : !player.active ? "Inaktiv profil" : "Ikke venner endnu"}</small>
                  </span>
                  <div className={styles.actions}>
                    {viewAllowed ? (
                      <button type="button" onClick={() => setSelectedId(player.id)}
                        aria-pressed={selectedId === player.id}>Se stats</button>
                    ) : !relation && player.auth_user_id && player.active ? (
                      <button type="button" disabled={!!busyActionId}
                        onClick={() => void action(player.id, "send")}>Tilf&#xF8;j ven</button>
                    ) : pendingIn ? (
                      <button type="button" disabled={!!busyActionId}
                        onClick={() => void action(player.id, "accept")}>Accepter</button>
                    ) : null}
                    {relation?.status === "accepted" && player.id !== currentPlayerId ? (
                      <button type="button" className={styles.quietButton} disabled={!!busyActionId}
                        onClick={() => void action(player.id, "remove")}>Fjern ven</button>
                    ) : pendingOut ? (
                      <button type="button" className={styles.quietButton} disabled={!!busyActionId}
                        onClick={() => void action(player.id, "remove")}>Annuller</button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selected && canView(selected.id) ? (
        <div ref={profileRef} className={styles.profile}>
          <header className={styles.profileHeader}>
            <div className={styles.avatarLarge}>{selected.name.slice(0, 1).toLocaleUpperCase("da-DK")}</div>
            <div><p className={styles.muted}>Spillerprofil</p><h2>{selected.name}</h2></div>
            <button className={styles.close} type="button" onClick={() => setSelectedId(null)}>Luk profil</button>
          </header>

          {profileLoading ? <p className={styles.muted}>Henter profilstatistik...</p> : null}
          {profileError ? <p role="alert" className={styles.error}>{profileError}</p> : null}
          {!profileLoading && !profileStats && !profileError ? <p>Ingen stats at vise.</p> : null}
          {profileStats ? <>
          <nav className={styles.profileNav} aria-label="Statistik p\u00e5 spillerprofilen">
            {[
              ["#profile-overview", "Overblik"],
              ["#profile-recent", "Seneste runder"],
              ["#profile-allrounds", "Alle runder"],
              ["#profile-scorecards", "Scorecards"],
              ["#profile-headtohead", "Head-to-head"],
              ["#profile-shots", "Slagtyper"],
              ["#profile-frontback", "Front / Back"],
              ["#profile-best", "Bedste runde"],
              ["#profile-hole-averages", "Hulstatistik"],
              ["#profile-bestworst", "Bedst / V\u00e6rst"],
              ["#profile-rating", "Rating"],
            ].map(([href, label]) => <a href={href} key={href}>{label}</a>)}
          </nav>

          {!p ? <section className={styles.section}><p>Ingen komplette runder i det valgte filter.</p></section> : <>
            <div id="profile-overview" className={styles.kpis}>
              {[
                ["Rating", num(p.rating, 0)], ["Handicap", num(p.handicap)],
                ["Runder", String(p.rounds_played)], ["Sejre", String(p.round_wins)],
                ["Gns. slag", num(p.average_strokes)], ["Gns. vs. par", vsPar(p.average_score_to_par)],
                ["Stabilitet", num(p.consistency_sd_to_par)],
              ].map(([label, value]) => <div key={label} className={styles.kpi}><span>{label}</span><strong>{value}</strong></div>)}
            </div>

            <Box id="profile-recent" title="Seneste runder">
              {recent.length ? <div className={styles.tableScroll}><table className={styles.table}>
                <thead><tr><th>Runde</th><th>Dato</th><th>Bane</th><th>Slag</th><th>Vs. par</th><th>Rating</th></tr></thead>
                <tbody>{recent.map((r) => <tr key={r.round_id}>
                  <th>#{r.round_number}</th><td>{date(r.date)}</td><td>{r.course_name}</td>
                  <td>{r.total_strokes}</td><td>{vsPar(r.score_to_par)}</td><td>{num(r.rating, 0)}</td>
                </tr>)}</tbody>
              </table></div> : <p className={styles.muted}>Ingen runder.</p>}
            </Box>

            <Box id="profile-allrounds" title="Alle runder">
              {history.length ? <div className={styles.tableScroll}><table className={styles.table}>
                <thead><tr><th>Runde</th><th>Dato</th><th>Bane</th><th>Slag</th><th>Par</th><th>Vs. par</th><th>Rating</th></tr></thead>
                <tbody>{[...history].sort((a, b) => b.round_number - a.round_number).map((r) => <tr key={r.round_id}>
                  <th>#{r.round_number}</th><td>{date(r.date)}</td><td>{r.course_name}</td>
                  <td>{r.total_strokes}</td><td>{r.course_par}</td><td>{vsPar(r.score_to_par)}</td><td>{num(r.rating, 0)}</td>
                </tr>)}</tbody>
              </table></div> : <p className={styles.muted}>Ingen runder i dette filter.</p>}
            </Box>

            <Box id="profile-rating" title="Ratingudvikling"><RatingPlot values={history} /></Box>

            <Box id="profile-best" title="Bedste runde">
              <p>{best ? `${best.course_name} | #${best.round_number} | ${best.total_strokes} slag (${vsPar(best.score_to_par)}) | rating ${num(best.rating, 0)}` : "Ingen runder"}</p>
            </Box>

            <Box id="profile-shots" title="Slagtyper">
              {shot ? <div className={styles.tableScroll}><table className={styles.table}>
                <thead><tr><th>Huller</th><th>Streger</th><th>Birdies</th><th>Bogeys</th><th>Double+</th></tr></thead>
                <tbody><tr><td>{shot.holes_played}</td>
                  {[shot.strokes_over_10, shot.birdie, shot.bogey, shot.double_plus].map((item, index) =>
                    <td key={index}>{item.count} ({num(item.rate, 0)}%)</td>
                  )}</tr></tbody>
              </table></div> : <p className={styles.muted}>Ingen slagdata.</p>}
            </Box>

            <Box id="profile-headtohead" title="Head-to-head">
              {headToHead.length ? <div className={styles.tableScroll}><table className={styles.table}>
                <thead><tr><th>Modstander</th><th>Kampe</th><th>Sejre</th><th>Nederlag</th><th>Uafgjort</th><th>Winrate</th></tr></thead>
                <tbody>{headToHead.map((r) => {
                  const first = r.player_1_id === selected.id;
                  return <tr key={`${r.player_1_id}:${r.player_2_id}`}>
                    <th>{first ? r.player_2_name : r.player_1_name}</th><td>{r.games}</td>
                    <td>{first ? r.player_1_wins : r.player_2_wins}</td>
                    <td>{first ? r.player_2_wins : r.player_1_wins}</td>
                    <td>{r.ties}</td><td>{num(first ? r.player_1_win_rate : r.player_2_win_rate, 0)}%</td>
                  </tr>;
                })}</tbody>
              </table></div> : <p className={styles.muted}>Ingen direkte opg&#xF8;r i det valgte filter.</p>}
            </Box>

            <Box id="profile-frontback" title="Front / Back">
              {frontBack.length ? <div className={styles.tableScroll}><table className={styles.table}>
                <thead><tr><th>Bane</th><th>Runder</th><th>Front</th><th>Back</th></tr></thead>
                <tbody>{frontBack.map((r) => <tr key={r.course_name}>
                  <th>{r.course_name}</th><td>{r.rounds}</td>
                  <td>{vsPar(r.front_to_par)}</td><td>{vsPar(r.back_to_par)}</td>
                </tr>)}</tbody>
              </table></div> : <p className={styles.muted}>Ingen Front / Back-data.</p>}
            </Box>

            <Box id="profile-bestworst" title="Bedste og v&#xE6;rste huller">
              {bestWorst.length ? <div className={styles.tableScroll}><table className={styles.table}>
                <thead><tr><th>Bane</th><th>Bedste hul</th><th>Gns. vs. par</th><th>V&#xE6;rste hul</th><th>Gns. vs. par</th></tr></thead>
                <tbody>{bestWorst.map((r) => <tr key={r.course_id}>
                  <th>{r.course_name}</th><td>{r.best_hole?.hole_label ?? "-"}</td>
                  <td>{vsPar(r.best_hole?.average_to_par)}</td><td>{r.worst_hole?.hole_label ?? "-"}</td>
                  <td>{vsPar(r.worst_hole?.average_to_par)}</td>
                </tr>)}</tbody>
              </table></div> : <p className={styles.muted}>Ingen huldata.</p>}
            </Box>

            <div id="profile-hole-averages" className={styles.holeSections}>
              {holeStats.length === 0 ? <Box title="Hulstatistik"><p className={styles.muted}>Ingen hulstatistik.</p></Box> : null}
              {holeStats.map((course) => <Box key={course.course_id} title={`Hulstatistik | ${course.course_name}`}>
              <div className={styles.tableScroll}><table className={styles.table}>
                <thead><tr><th>Hul</th><th>Par</th><th>Gns. slag</th><th>Gns. vs. par</th><th>Bedste score</th></tr></thead>
                <tbody>{course.holes.map((hole) => <tr key={hole.hole_id}>
                  <th>{hole.hole_label}</th><td>{hole.par}</td>
                  <td>{num(hole.player.average_strokes_last_five)}</td>
                  <td>{vsPar(hole.player.average_to_par_last_five)}</td>
                  <td>{hole.player.best_strokes_all_time ?? "-"}</td>
                </tr>)}</tbody>
              </table></div>
            </Box>)}
            </div>

            <Box id="profile-scorecards" title="De fem seneste scorecards">
              {cards.length ? cards.map((card) => <ProfileScorecard key={card.round_id} scorecard={card} />) :
                <p className={styles.muted}>Ingen scorecards i filteret.</p>}
            </Box>
          </>}
          </> : null}
        </div>
      ) : <p className={styles.hint}>V&#xE6;lg en spiller ovenfor for at &#xE5;bne profilen.</p>}
    </div>
  );
}
