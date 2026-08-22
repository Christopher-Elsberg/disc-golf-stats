"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type {
  BestRound,
  HeadToHead,
  RatingHistory,
  Scorecard,
  StatsResponse,
} from "@/types/stats";

type View =
  | "overview"
  | "scorecards"
  | "headtohead"
  | "shots"
  | "frontback"
  | "best"
  | "holes"
  | "bestworst"
  | "rating";

type AuthMode = "login" | "signup";

const MENU: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Oversigt", icon: "◈" },
  { id: "scorecards", label: "Sidste 5", icon: "▦" },
  { id: "headtohead", label: "Head-to-head", icon: "⚔" },
  { id: "shots", label: "Slagtyper", icon: "◎" },
  { id: "frontback", label: "Front / Back", icon: "↔" },
  { id: "best", label: "Bedste runder", icon: "★" },
  { id: "holes", label: "Hulstatistik", icon: "⛳" },
  { id: "bestworst", label: "Bedst / Værst", icon: "⇅" },
  { id: "rating", label: "Rating", icon: "↗" },
];

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return value.toFixed(digits).replace(".", ",");
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "–";
  return `${formatNumber(value, 0)} %`;
}

function formatToPar(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  if (value === 0) return "E";
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function formatDate(value: string) {
  if (!value) return "–";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

function LoadingScreen() {
  return (
    <main className="boot-screen">
      <div className="spinner" />
      <p>Henter Disc Golf Stats…</p>
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signup") {
        if (!name.trim()) throw new Error("Indtast dit navn.");

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim() },
          },
        });

        if (signUpError) throw signUpError;

        if (!data.session) {
          setMessage(
            "Bruger oprettet. Tjek din mail og bekræft kontoen, hvis email-bekræftelse er slået til i Supabase.",
          );
        } else {
          setMessage("Bruger oprettet. Du er nu logget ind.");
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (loginError) throw loginError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Der opstod en ukendt fejl.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />

      <section className="auth-card">
        <div className="brand-mark large" aria-hidden="true">
          <span className="disc-ring" />
          <span className="disc-dot" />
        </div>

        <div className="auth-copy">
          <span className="eyebrow">Bundgaardsparken & flere baner</span>
          <h1>Disc Golf Stats</h1>
          <p>
            Scorecards, rating, handicap, head-to-head og hulstatistik samlet ét sted.
          </p>
        </div>

        <div className="auth-toggle" role="tablist" aria-label="Login eller opret bruger">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
              setMessage("");
            }}
          >
            Log ind
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setError("");
              setMessage("");
            }}
          >
            Opret bruger
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "signup" ? (
            <label>
              Navn
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Christopher"
                autoComplete="name"
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="navn@email.dk"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Adgangskode
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 tegn"
              minLength={0}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>

          {error ? <div className="form-message error">{error}</div> : null}
          {message ? <div className="form-message success">{message}</div> : null}

          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            {busy ? "Arbejder…" : mode === "login" ? "Log ind" : "Opret bruger"}
          </button>
        </form>
      </section>
    </main>
  );
}

function RatingChart({ item }: { item: RatingHistory }) {
  const points = item.history.filter((row) => row.rating !== null);
  if (points.length === 0) return <EmptyState>Ingen ratingdata endnu.</EmptyState>;

  const width = 760;
  const height = 260;
  const padX = 42;
  const padY = 28;
  const ratings = points.map((point) => Number(point.rating));
  const minRating = Math.floor((Math.min(...ratings) - 20) / 25) * 25;
  const maxRating = Math.ceil((Math.max(...ratings) + 20) / 25) * 25;
  const span = Math.max(1, maxRating - minRating);

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? width / 2
        : padX + (index / (points.length - 1)) * (width - padX * 2);
    const y =
      height -
      padY -
      ((Number(point.rating) - minRating) / span) * (height - padY * 2);
    return { x, y, point };
  });

  const path = coords.map((c, index) => `${index === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");

  return (
    <article className="chart-card">
      <div className="chart-title-row">
        <div>
          <h3>{item.player_name}</h3>
          <span>{points.length} registrerede runder</span>
        </div>
        <strong>{formatNumber(points.at(-1)?.rating ?? null, 0)}</strong>
      </div>

      <div className="chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} className="rating-chart" role="img">
          {[0, 0.25, 0.5, 0.75, 1].map((factor) => {
            const y = padY + factor * (height - padY * 2);
            const label = Math.round(maxRating - factor * span);
            return (
              <g key={factor}>
                <line x1={padX} y1={y} x2={width - padX} y2={y} className="grid-line" />
                <text x={8} y={y + 4} className="chart-axis-label">
                  {label}
                </text>
              </g>
            );
          })}
          <path d={path} className="rating-line" />
          {coords.map(({ x, y, point }) => (
            <g key={point.round_id}>
              <circle cx={x} cy={y} r="4.5" className="rating-point" />
              <title>{`Runde ${point.round_number}: ${point.rating}`}</title>
            </g>
          ))}
          {coords.length > 0 ? (
            <>
              <text x={padX} y={height - 5} className="chart-axis-label">
                R{coords[0].point.round_number}
              </text>
              <text x={width - padX} y={height - 5} textAnchor="end" className="chart-axis-label">
                R{coords.at(-1)?.point.round_number}
              </text>
            </>
          ) : null}
        </svg>
      </div>
    </article>
  );
}

function ScorecardTable({ scorecard }: { scorecard: Scorecard }) {
  const scoreLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const player of scorecard.players) {
      for (const score of player.scores) {
        map.set(`${player.player_id}:${score.hole_id}`, score.strokes);
      }
    }
    return map;
  }, [scorecard]);

  return (
    <article className="scorecard-card">
      <div className="scorecard-header">
        <div>
          <span className="round-pill">Runde {scorecard.round_number}</span>
          <h3>{scorecard.course_name}</h3>
        </div>
        <div className="scorecard-meta">
          <span>{formatDate(scorecard.date)}</span>
          <span>Par {scorecard.course_par}</span>
        </div>
      </div>

      <div className="table-scroll">
        <table className="stats-table compact-table scorecard-table">
          <thead>
            <tr>
              <th>Hul</th>
              <th>Par</th>
              {scorecard.players.map((player) => (
                <th key={player.player_id}>{player.player_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scorecard.holes.map((hole) => (
              <tr key={hole.hole_id}>
                <th>{hole.hole_label}</th>
                <td>{hole.par}</td>
                {scorecard.players.map((player) => (
                  <td key={player.player_id}>
                    {scoreLookup.get(`${player.player_id}:${hole.hole_id}`) ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="total-row">
              <th>Sum</th>
              <td>{scorecard.course_par}</td>
              {scorecard.players.map((player) => (
                <td key={player.player_id}>
                  <strong>{player.total_strokes}</strong>
                  <span className="to-par-inline">{formatToPar(player.score_to_par)}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

function headToHeadCell(
  rowPlayerId: string,
  columnPlayerId: string,
  rows: HeadToHead[],
): { rate: number | null; wins: number; games: number } | null {
  const match = rows.find(
    (item) =>
      (item.player_1_id === rowPlayerId && item.player_2_id === columnPlayerId) ||
      (item.player_2_id === rowPlayerId && item.player_1_id === columnPlayerId),
  );
  if (!match) return null;

  if (match.player_1_id === rowPlayerId) {
    return {
      rate: match.player_1_win_rate,
      wins: match.player_1_wins,
      games: match.games,
    };
  }

  return {
    rate: match.player_2_win_rate,
    wins: match.player_2_wins,
    games: match.games,
  };
}

function bestRoundLabel(item: BestRound) {
  if (!item.best_round) return "–";
  return `${item.best_round.total_strokes} (${formatToPar(item.best_round.score_to_par)})`;
}

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [season, setSeason] = useState<string>("all");
  const [courseId, setCourseId] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (!nextSession) setStats(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      setError("");

      const body: Record<string, string | number> = {};
      if (season !== "all") body.season = Number(season);
      if (courseId !== "all") body.course_id = courseId;

      const { data, error: functionError } = await supabase.functions.invoke(
        "disc-golf-stats",
        { body },
      );

      if (cancelled) return;

      if (functionError) {
        setError(functionError.message || "Kunne ikke hente statistik fra Edge Function.");
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(String(data.error));
        setLoading(false);
        return;
      }

      setStats(data as StatsResponse);
      setLoading(false);
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [session, season, courseId]);

  const activeCourseName = useMemo(() => {
    if (courseId === "all") return "Alle baner";
    return stats?.available_courses.find((course) => course.id === courseId)?.name ?? "Valgt bane";
  }, [courseId, stats]);

  if (!authReady) return <LoadingScreen />;
  if (!session) return <AuthScreen />;

  async function handleLogout() {
    await supabase.auth.signOut({ scope: "local" });
  }

  const playerStats = stats?.stats.player_stats ?? [];
  const activeMenu = MENU.find((item) => item.id === view)?.label ?? "Oversigt";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            <span className="disc-ring" />
            <span className="disc-dot" />
          </div>
          <div>
            <strong>Disc Golf Stats</strong>
            <span>Performance report</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Statistikmenu">
          {MENU.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "active" : ""}
              onClick={() => {
                setView(item.id);
                setMobileMenuOpen(false);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">
            {(session.user.user_metadata?.name || session.user.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{session.user.user_metadata?.name || "Spiller"}</strong>
            <span>{session.user.email}</span>
          </div>
          <button type="button" className="logout-button" onClick={handleLogout} title="Log ud">
            ↪
          </button>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          className="sidebar-backdrop"
          aria-label="Luk menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Åbn menu"
            >
              ☰
            </button>
            <div>
              <span className="eyebrow">{activeCourseName}</span>
              <h1>{activeMenu}</h1>
            </div>
          </div>

          <div className="filters">
            <label>
              <span>Sæson</span>
              <select value={season} onChange={(event) => setSeason(event.target.value)}>
                <option value="all">Alle sæsoner</option>
                {(stats?.available_seasons ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Bane</span>
              <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                <option value="all">Alle baner</option>
                {(stats?.available_courses ?? []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {loading && !stats ? <LoadingScreen /> : null}

        {error ? (
          <div className="error-banner">
            <strong>Kunne ikke hente statistik</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {stats ? (
          <div className={`content-stack ${loading ? "is-refreshing" : ""}`}>
            {stats.stats.incomplete_entries.length > 0 ? (
              <div className="warning-banner">
                <strong>{stats.stats.incomplete_entries.length} ufuldstændige spiller-runder</strong>
                <span>De er ikke medregnet i den færdige statistik.</span>
              </div>
            ) : null}

            {view === "overview" ? (
              <>
                <div className="kpi-grid">
                  <article className="kpi-card">
                    <span>Runder</span>
                    <strong>{stats.stats.rounds}</strong>
                    <small>{stats.stats.completed_rounds} med komplette scores</small>
                  </article>
                  <article className="kpi-card">
                    <span>Spillere</span>
                    <strong>{playerStats.length}</strong>
                    <small>i det valgte filter</small>
                  </article>
                  <article className="kpi-card">
                    <span>Spiller-runder</span>
                    <strong>{stats.stats.player_round_results}</strong>
                    <small>komplette individuelle runder</small>
                  </article>
                  <article className="kpi-card accent-kpi">
                    <span>Seneste runde</span>
                    <strong>
                      {stats.stats.last_five_scorecards[0]
                        ? `#${stats.stats.last_five_scorecards[0].round_number}`
                        : "–"}
                    </strong>
                    <small>
                      {stats.stats.last_five_scorecards[0]
                        ? stats.stats.last_five_scorecards[0].course_name
                        : "Ingen data"}
                    </small>
                  </article>
                </div>

                <Panel
                  title="Spilleroverblik"
                  subtitle="Rating og handicap bruger spillerens fem seneste komplette runder."
                >
                  {playerStats.length === 0 ? (
                    <EmptyState>Ingen spillerstatistik i det valgte filter.</EmptyState>
                  ) : (
                    <div className="table-scroll">
                      <table className="stats-table">
                        <thead>
                          <tr>
                            <th>Spiller</th>
                            <th>Runder</th>
                            <th>Sejre</th>
                            <th>Gns. slag</th>
                            <th>Gns. vs. par</th>
                            <th>Handicap</th>
                            <th>Rating</th>
                            <th>Stabilitet σ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerStats.map((player) => (
                            <tr key={player.player_id}>
                              <th>{player.player_name}</th>
                              <td>{player.rounds_played}</td>
                              <td>
                                <strong>{player.round_wins}</strong>
                                <span className="muted-cell">
                                  {player.outright_round_wins} direkte / {player.tied_round_wins} delt
                                </span>
                              </td>
                              <td>{formatNumber(player.average_strokes)}</td>
                              <td>{formatToPar(player.average_score_to_par)}</td>
                              <td>{formatNumber(player.handicap)}</td>
                              <td className="rating-cell">{formatNumber(player.rating, 0)}</td>
                              <td>{formatNumber(player.consistency_sd_to_par)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>

                <Panel title="Formler" subtitle="De regler Edge Functionen bruger til beregningerne.">
                  <div className="formula-grid">
                    <div>
                      <span>Rating</span>
                      <strong>1000 + 8,4 × (-7 - score vs. par)</strong>
                    </div>
                    <div>
                      <span>Handicap</span>
                      <strong>Gns. af banepar - score, sidste 5 runder</strong>
                    </div>
                    <div>
                      <span>Head-to-head</span>
                      <strong>Laveste totalscore vinder</strong>
                    </div>
                    <div>
                      <span>Consistency</span>
                      <strong>Populations-SD af score vs. par</strong>
                    </div>
                  </div>
                </Panel>
              </>
            ) : null}

            {view === "scorecards" ? (
              <Panel
                title="De fem seneste scorecards"
                subtitle="Sorteret efter round_number, så historiske Last Modified-datoer ikke ændrer rækkefølgen."
              >
                {stats.stats.last_five_scorecards.length === 0 ? (
                  <EmptyState>Ingen scorecards i det valgte filter.</EmptyState>
                ) : (
                  <div className="scorecard-grid">
                    {stats.stats.last_five_scorecards.map((scorecard) => (
                      <ScorecardTable key={scorecard.round_id} scorecard={scorecard} />
                    ))}
                  </div>
                )}
              </Panel>
            ) : null}

            {view === "headtohead" ? (
              <Panel
                title="Head-to-head winrate"
                subtitle="Solo-runder tæller ikke i head-to-head. Laveste score vinder."
              >
                {playerStats.length === 0 ? (
                  <EmptyState>Ingen head-to-head-data.</EmptyState>
                ) : (
                  <div className="table-scroll">
                    <table className="stats-table matrix-table">
                      <thead>
                        <tr>
                          <th>Spiller</th>
                          {playerStats.map((player) => (
                            <th key={player.player_id}>{player.player_name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {playerStats.map((rowPlayer) => (
                          <tr key={rowPlayer.player_id}>
                            <th>{rowPlayer.player_name}</th>
                            {playerStats.map((columnPlayer) => {
                              if (rowPlayer.player_id === columnPlayer.player_id) {
                                return (
                                  <td className="matrix-diagonal" key={columnPlayer.player_id}>
                                    –
                                  </td>
                                );
                              }
                              const value = headToHeadCell(
                                rowPlayer.player_id,
                                columnPlayer.player_id,
                                stats.stats.head_to_head,
                              );
                              return (
                                <td key={columnPlayer.player_id}>
                                  {value && value.games > 0 ? (
                                    <>
                                      <strong>{formatPercent(value.rate)}</strong>
                                      <span className="muted-cell">
                                        {value.wins}/{value.games}
                                      </span>
                                    </>
                                  ) : (
                                    "–"
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            ) : null}

            {view === "shots" ? (
              <Panel
                title="Shot counts"
                subtitle="Andel af alle spillede huller i det valgte filter."
              >
                <div className="table-scroll">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Spiller</th>
                        <th>Huller</th>
                        <th>Streger (&gt;10)</th>
                        <th>Birdie</th>
                        <th>Bogey</th>
                        <th>Double+</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.stats.shot_counts.map((player) => (
                        <tr key={player.player_id}>
                          <th>{player.player_name}</th>
                          <td>{player.holes_played}</td>
                          <td>
                            {formatPercent(player.strokes_over_10.rate)}
                            <span className="muted-cell">{player.strokes_over_10.count} stk.</span>
                          </td>
                          <td>
                            {formatPercent(player.birdie.rate)}
                            <span className="muted-cell">{player.birdie.count} stk.</span>
                          </td>
                          <td>
                            {formatPercent(player.bogey.rate)}
                            <span className="muted-cell">{player.bogey.count} stk.</span>
                          </td>
                          <td>
                            {formatPercent(player.double_plus.rate)}
                            <span className="muted-cell">{player.double_plus.count} stk.</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}

            {view === "frontback" ? (
              <div className="content-stack">
                {stats.stats.front_back.length === 0 ? (
                  <Panel title="Front / Back">
                    <EmptyState>Ingen banedata i det valgte filter.</EmptyState>
                  </Panel>
                ) : (
                  stats.stats.front_back.map((course) => (
                    <Panel
                      key={course.course_id}
                      title={`Clutch or crumble · ${course.course_name}`}
                      subtitle="Gennemsnitlig score mod par på banens første og sidste halvdel."
                    >
                      <div className="table-scroll">
                        <table className="stats-table">
                          <thead>
                            <tr>
                              <th>Spiller</th>
                              <th>Runder</th>
                              <th>{course.front_label}</th>
                              <th>{course.back_label}</th>
                              <th>Forskel</th>
                            </tr>
                          </thead>
                          <tbody>
                            {course.players.map((player) => {
                              const difference =
                                player.front_to_par !== null && player.back_to_par !== null
                                  ? player.back_to_par - player.front_to_par
                                  : null;
                              return (
                                <tr key={player.player_id}>
                                  <th>{player.player_name}</th>
                                  <td>{player.rounds}</td>
                                  <td>{formatToPar(player.front_to_par)}</td>
                                  <td>{formatToPar(player.back_to_par)}</td>
                                  <td>{formatToPar(difference)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  ))
                )}
              </div>
            ) : null}

            {view === "best" ? (
              <Panel
                title="Hver spillers bedste runde"
                subtitle="Bedste score målt mod par; laveste score bryder lighed."
              >
                <div className="best-round-grid">
                  {stats.stats.best_rounds.map((item) => (
                    <article className="best-round-card" key={item.player_id}>
                      <span>{item.player_name}</span>
                      <strong>{bestRoundLabel(item)}</strong>
                      {item.best_round ? (
                        <>
                          <p>{item.best_round.course_name}</p>
                          <small>
                            Runde {item.best_round.round_number} · {formatDate(item.best_round.date)} · rating {formatNumber(item.best_round.rating, 0)}
                          </small>
                        </>
                      ) : (
                        <small>Ingen runder</small>
                      )}
                    </article>
                  ))}
                </div>
              </Panel>
            ) : null}

            {view === "holes" ? (
              <div className="content-stack">
                {stats.stats.hole_stats.length === 0 ? (
                  <Panel title="Hulstatistik">
                    <EmptyState>Ingen hulstatistik i det valgte filter.</EmptyState>
                  </Panel>
                ) : (
                  stats.stats.hole_stats.map((course) => (
                    <Panel
                      key={course.course_id}
                      title={`Hulgennemsnit · ${course.course_name}`}
                      subtitle="Hver celle viser gennemsnit af spillerens sidste 5 runder på banen / bedste score nogensinde."
                    >
                      <div className="table-scroll">
                        <table className="stats-table hole-table">
                          <thead>
                            <tr>
                              <th>Hul</th>
                              <th>Par</th>
                              {(course.holes[0]?.players ?? []).map((player) => (
                                <th key={player.player_id}>{player.player_name}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {course.holes.map((hole) => (
                              <tr key={hole.hole_id}>
                                <th>{hole.hole_label}</th>
                                <td>{hole.par}</td>
                                {hole.players.map((player) => (
                                  <td key={player.player_id}>
                                    <strong>{formatNumber(player.average_strokes_last_five)}</strong>
                                    <span className="muted-cell">
                                      bedst {player.best_strokes_all_time ?? "–"}
                                    </span>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  ))
                )}
              </div>
            ) : null}

            {view === "bestworst" ? (
              <Panel
                title="Bedste og værste hul"
                subtitle="Baseret på gennemsnitlig score mod par over spillerens seneste fem runder på banen."
              >
                <div className="table-scroll">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Bane</th>
                        <th>Spiller</th>
                        <th>Bedste hul</th>
                        <th>Gns. vs. par</th>
                        <th>Værste hul</th>
                        <th>Gns. vs. par</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.stats.best_worst_holes.map((item) => (
                        <tr key={`${item.course_id}:${item.player_id}`}>
                          <td>{item.course_name}</td>
                          <th>{item.player_name}</th>
                          <td>{item.best_hole?.hole_label ?? "–"}</td>
                          <td>{formatToPar(item.best_hole?.average_to_par)}</td>
                          <td>{item.worst_hole?.hole_label ?? "–"}</td>
                          <td>{formatToPar(item.worst_hole?.average_to_par)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}

            {view === "rating" ? (
              <Panel
                title="Rating progression"
                subtitle="Historikken følger round_number, så runde 1 → 2 → 3 altid er den rigtige rækkefølge."
              >
                <div className="chart-grid">
                  {stats.stats.rating_history.map((item) => (
                    <RatingChart key={item.player_id} item={item} />
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
