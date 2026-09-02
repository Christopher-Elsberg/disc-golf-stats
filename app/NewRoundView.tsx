"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { savePendingRound, type PendingRound } from "@/lib/offline-rounds";

type PlayerOption = {
  id: string;
  name: string;
  auth_user_id: string | null;
};

type CourseOption = {
  id: string;
  name: string;
  location: string | null;
};

type CourseHole = {
  id: string;
  score_index: number;
  hole_label: string;
  display_order: number;
  par: number;
};

type DraftHole = CourseHole & {
  draft: true;
};

type Props = {
  currentUserId: string;
  onQueued: () => void;
};

const NEW_COURSE = "__new_course__";
const SETUP_CACHE_KEY = "disc-golf-setup-cache-v1";
const HOLES_CACHE_PREFIX = "disc-golf-course-holes-v1:";

function localDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toParLabel(value: number) {
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function readSetupCache(): { players: PlayerOption[]; courses: CourseOption[] } | null {
  try {
    const raw = window.localStorage.getItem(SETUP_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { players: PlayerOption[]; courses: CourseOption[] };
  } catch {
    return null;
  }
}

function writeSetupCache(players: PlayerOption[], courses: CourseOption[]) {
  try {
    window.localStorage.setItem(SETUP_CACHE_KEY, JSON.stringify({ players, courses }));
  } catch {
    // Cache is helpful, but the live app should still work if storage is unavailable.
  }
}

function readHolesCache(courseId: string): CourseHole[] | null {
  try {
    const raw = window.localStorage.getItem(`${HOLES_CACHE_PREFIX}${courseId}`);
    if (!raw) return null;
    return JSON.parse(raw) as CourseHole[];
  } catch {
    return null;
  }
}

function writeHolesCache(courseId: string, holes: CourseHole[]) {
  try {
    window.localStorage.setItem(`${HOLES_CACHE_PREFIX}${courseId}`, JSON.stringify(holes));
  } catch {
    // Ignore cache failures.
  }
}

export default function NewRoundView({ currentUserId, onQueued }: Props) {
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [holes, setHoles] = useState<CourseHole[]>([]);
  const [draftHoles, setDraftHoles] = useState<DraftHole[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [courseId, setCourseId] = useState("");
  const [newCourseLocalId, setNewCourseLocalId] = useState<string | null>(null);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseLocation, setNewCourseLocation] = useState("");
  const [playedOn, setPlayedOn] = useState(localDateString());
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingHoles, setLoadingHoles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isNewCourse = courseId === NEW_COURSE;
  const roundHoles: CourseHole[] = isNewCourse ? draftHoles : holes;

  useEffect(() => {
    let cancelled = false;

    async function loadSetup() {
      setLoadingSetup(true);
      setError("");

      const [playersResult, coursesResult] = await Promise.all([
        supabase
          .from("players")
          .select("id,name,auth_user_id")
          .eq("active", true)
          .order("name", { ascending: true }),
        supabase
          .from("courses")
          .select("id,name,location")
          .order("name", { ascending: true }),
      ]);

      if (cancelled) return;

      if (playersResult.error || coursesResult.error) {
        const cached = readSetupCache();
        if (!cached) {
          const message = playersResult.error?.message ?? coursesResult.error?.message ?? "Ukendt fejl";
          setError(`Kunne ikke hente spillere og baner, og der findes ingen offline-cache: ${message}`);
          setLoadingSetup(false);
          return;
        }

        setPlayers(cached.players);
        setCourses(cached.courses);
        const me = cached.players.find((player) => player.auth_user_id === currentUserId);
        if (me) setSelectedPlayers([me.id]);
        setCourseId(cached.courses[0]?.id ?? NEW_COURSE);
        setLoadingSetup(false);
        return;
      }

      const playerRows = (playersResult.data ?? []) as PlayerOption[];
      const courseRows = (coursesResult.data ?? []) as CourseOption[];

      setPlayers(playerRows);
      setCourses(courseRows);
      writeSetupCache(playerRows, courseRows);

      const me = playerRows.find((player) => player.auth_user_id === currentUserId);
      if (me) setSelectedPlayers([me.id]);
      setCourseId(courseRows[0]?.id ?? NEW_COURSE);
      setLoadingSetup(false);
    }

    loadSetup();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!isNewCourse) return;
    if (!newCourseLocalId) setNewCourseLocalId(crypto.randomUUID());
  }, [isNewCourse, newCourseLocalId]);

  useEffect(() => {
    if (!courseId || isNewCourse) {
      setHoles([]);
      setLoadingHoles(false);
      setScores({});
      return;
    }

    let cancelled = false;

    async function loadHoles() {
      setLoadingHoles(true);
      setError("");
      setSuccess("");

      const { data, error: holesError } = await supabase
        .from("course_holes")
        .select("id,score_index,hole_label,display_order,par")
        .eq("course_id", courseId)
        .order("display_order", { ascending: true });

      if (cancelled) return;

      if (holesError) {
        const cached = readHolesCache(courseId);
        if (cached) {
          setHoles(cached);
          setScores({});
        } else {
          setError(`Kunne ikke hente banens huller, og de findes ikke i offline-cache: ${holesError.message}`);
          setHoles([]);
        }
      } else {
        const rows = (data ?? []) as CourseHole[];
        setHoles(rows);
        writeHolesCache(courseId, rows);
        setScores({});
      }

      setLoadingHoles(false);
    }

    loadHoles();

    return () => {
      cancelled = true;
    };
  }, [courseId, isNewCourse]);

  const selectedPlayerRows = useMemo(
    () => players.filter((player) => selectedPlayers.includes(player.id)),
    [players, selectedPlayers],
  );

  const coursePar = useMemo(
    () => roundHoles.reduce((sum, hole) => sum + hole.par, 0),
    [roundHoles],
  );

  const totals = useMemo(() => {
    const result: Record<string, { total: number; complete: boolean }> = {};

    for (const player of selectedPlayerRows) {
      let total = 0;
      let complete = roundHoles.length > 0;

      for (const hole of roundHoles) {
        const raw = scores[player.id]?.[hole.id] ?? "";
        const parsed = Number(raw);
        if (raw === "" || !Number.isInteger(parsed) || parsed < 1 || parsed > 99) {
          complete = false;
        } else {
          total += parsed;
        }
      }

      result[player.id] = { total, complete };
    }

    return result;
  }, [roundHoles, scores, selectedPlayerRows]);

  function handleCourseChange(value: string) {
    setCourseId(value);
    setScores({});
    setError("");
    setSuccess("");

    if (value === NEW_COURSE && !newCourseLocalId) {
      setNewCourseLocalId(crypto.randomUUID());
    }
  }

  function togglePlayer(playerId: string) {
    setSuccess("");
    setError("");
    setSelectedPlayers((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    );
  }

  function updateScore(playerId: string, holeId: string, value: string) {
    if (value !== "" && !/^\d{1,2}$/.test(value)) return;

    setSuccess("");
    setScores((current) => ({
      ...current,
      [playerId]: {
        ...(current[playerId] ?? {}),
        [holeId]: value,
      },
    }));
  }

  function addDraftHole() {
    const nextOrder = draftHoles.length + 1;
    const numericLabels = draftHoles
      .map((hole) => Number(hole.hole_label))
      .filter((value) => Number.isInteger(value) && value > 0);
    const nextDefaultLabel = numericLabels.length > 0 ? Math.max(...numericLabels) + 1 : 1;

    const newHole: DraftHole = {
      id: crypto.randomUUID(),
      score_index: nextOrder,
      hole_label: String(nextDefaultLabel),
      display_order: nextOrder,
      par: 3,
      draft: true,
    };

    setDraftHoles((current) => [...current, newHole]);
    setError("");
    setSuccess("");
  }

  function updateDraftHole(holeId: string, field: "hole_label" | "par", value: string) {
    setDraftHoles((current) =>
      current.map((hole) => {
        if (hole.id !== holeId) return hole;
        if (field === "par") {
          const parsed = Number(value);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) return hole;
          return { ...hole, par: parsed };
        }
        return { ...hole, hole_label: value };
      }),
    );
  }

  function removeDraftHole(holeId: string) {
    setDraftHoles((current) => {
      const remaining = current.filter((hole) => hole.id !== holeId);
      return remaining.map((hole, index) => ({
        ...hole,
        score_index: index + 1,
        display_order: index + 1,
      }));
    });

    setScores((current) => {
      const next: Record<string, Record<string, string>> = {};
      for (const [playerId, playerScores] of Object.entries(current)) {
        const { [holeId]: _removed, ...rest } = playerScores;
        next[playerId] = rest;
      }
      return next;
    });
  }

  function validateRound() {
    if (!courseId) return "V\u00e6lg en bane.";
    if (!playedOn) return "V\u00e6lg en dato.";
    if (selectedPlayerRows.length === 0) return "V\u00e6lg mindst \u00e9n spiller.";

    if (isNewCourse) {
      if (!newCourseName.trim()) return "Skriv navnet p\u00e5 den nye bane.";
      if (!newCourseLocation.trim()) return "Skriv lokationen p\u00e5 den nye bane.";
      if (draftHoles.length === 0) return "Tilf\u00f8j mindst \u00e9t hul til den nye bane.";
      if (draftHoles.some((hole) => !hole.hole_label.trim())) return "Alle huller skal have et navn/nummer.";
      const labels = draftHoles.map((hole) => hole.hole_label.trim().toLowerCase());
      if (new Set(labels).size !== labels.length) return "Hulnavne skal v\u00e6re unikke p\u00e5 banen.";
    } else if (holes.length === 0) {
      return "Den valgte bane har ingen registrerede huller.";
    }

    for (const player of selectedPlayerRows) {
      for (const hole of roundHoles) {
        const raw = scores[player.id]?.[hole.id] ?? "";
        const value = Number(raw);
        if (raw === "" || !Number.isInteger(value) || value < 1 || value > 99) {
          return `Indtast en gyldig score p\u00e5 alle huller for ${player.name}.`;
        }
      }
    }

    return null;
  }

  async function saveRound() {
    setError("");
    setSuccess("");

    const validationError = validateRound();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      const roundId = crypto.randomUUID();

      const course = isNewCourse
        ? (() => {
            const localCourseId = newCourseLocalId ?? crypto.randomUUID();
            if (!newCourseLocalId) setNewCourseLocalId(localCourseId);
            const baseSlug = slugify(`${newCourseName}-${newCourseLocation}`) || "disc-golf-bane";

            return {
              type: "new" as const,
              id: localCourseId,
              name: newCourseName.trim(),
              slug: `${baseSlug}-${localCourseId.slice(0, 8)}`,
              location: newCourseLocation.trim() || null,
              holes: draftHoles.map((hole, index) => ({
                id: hole.id,
                score_index: index + 1,
                hole_label: hole.hole_label.trim(),
                display_order: index + 1,
                par: hole.par,
              })),
            };
          })()
        : {
            type: "existing" as const,
            id: courseId,
          };

      const pendingRound: PendingRound = {
        id: roundId,
        auth_user_id: currentUserId,
        played_on: playedOn,
        course,
        player_ids: selectedPlayerRows.map((player) => player.id),
        scores: selectedPlayerRows.flatMap((player) =>
          roundHoles.map((hole) => ({
            player_id: player.id,
            course_hole_id: hole.id,
            strokes: Number(scores[player.id][hole.id]),
          })),
        ),
        created_at: new Date().toISOString(),
        status: "pending",
      };

      await savePendingRound(pendingRound);
      setScores({});
      onQueued();

      setSuccess(
        navigator.onLine
          ? "Runden er gemt sikkert p\u00e5 telefonen og synkroniseres automatisk med Supabase."
          : "Runden er gemt sikkert p\u00e5 telefonen og afventer synkronisering, n\u00e5r forbindelsen kommer tilbage.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke gemme runden lokalt.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingSetup) {
    return (
      <section className="panel new-round-loading">
        <div className="spinner" />
        <p>Henter spillere og baner&#x2026;</p>
      </section>
    );
  }

  return (
    <div className="new-round-stack">
      <section className="panel round-setup-panel">
        <div className="panel-heading">
          <div>
            <h2>Opret ny runde</h2>
            <p>V&#xE6;lg en eksisterende bane eller opret en ny bane, mens I spiller.</p>
          </div>
        </div>

        <div className="round-setup-grid">
          <label className="round-field">
            <span>Bane</span>
            <select value={courseId} onChange={(event) => handleCourseChange(event.target.value)}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}{course.location ? ` \u00b7 ${course.location}` : ""}
                </option>
              ))}
              <option value={NEW_COURSE}>&#xFF0B; Ny bane</option>
            </select>
          </label>

          <label className="round-field">
            <span>Dato</span>
            <input
              type="date"
              value={playedOn}
              onChange={(event) => setPlayedOn(event.target.value)}
              required
            />
          </label>

          <div className="course-summary">
            <span>Baneinfo</span>
            <strong>
              {loadingHoles
                ? "Henter\u2026"
                : isNewCourse
                  ? `${draftHoles.length} huller tilf\u00f8jet \u00b7 Par ${coursePar}`
                  : `${holes.length} huller \u00b7 Par ${coursePar}`}
            </strong>
          </div>
        </div>

        {isNewCourse ? (
          <div className="new-course-builder">
            <div className="new-course-header">
              <div>
                <span className="builder-eyebrow">Ny bane</span>
                <h3>Opret banen under runden</h3>
                <p>Tilf&#xF8;j et hul, n&#xE5;r I n&#xE5;r til det, og angiv hulnavn/nummer og par.</p>
              </div>
            </div>

            <div className="new-course-fields">
              <label className="round-field">
                <span>Banens navn</span>
                <input
                  value={newCourseName}
                  onChange={(event) => setNewCourseName(event.target.value)}
                  placeholder={"Fx \u00d8stre Anl\u00e6g Disc Golf"}
                />
              </label>

              <label className="round-field">
                <span>Lokation</span>
                <input
                  value={newCourseLocation}
                  onChange={(event) => setNewCourseLocation(event.target.value)}
                  placeholder="Fx Aalborg"
                />
              </label>
            </div>

            <div className="draft-hole-list">
              {draftHoles.length === 0 ? (
                <div className="draft-hole-empty">Ingen huller endnu. Tilf&#xF8;j f&#xF8;rste hul, n&#xE5;r runden starter.</div>
              ) : (
                draftHoles.map((hole, index) => (
                  <div className="draft-hole-row" key={hole.id}>
                    <span className="draft-hole-number">{index + 1}</span>
                    <label>
                      <span>Hul</span>
                      <input
                        value={hole.hole_label}
                        onChange={(event) => updateDraftHole(hole.id, "hole_label", event.target.value)}
                        aria-label={`Navn p\u00e5 hul ${index + 1}`}
                      />
                    </label>
                    <label>
                      <span>Par</span>
                      <select
                        value={hole.par}
                        onChange={(event) => updateDraftHole(hole.id, "par", event.target.value)}
                        aria-label={`Par p\u00e5 hul ${hole.hole_label}`}
                      >
                        {Array.from({ length: 8 }, (_, parIndex) => parIndex + 2).map((par) => (
                          <option key={par} value={par}>{par}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="remove-hole-button"
                      type="button"
                      onClick={() => removeDraftHole(hole.id)}
                      aria-label={`Fjern hul ${hole.hole_label}`}
                    >
                      Fjern
                    </button>
                  </div>
                ))
              )}
            </div>

            <button type="button" className="add-hole-button" onClick={addDraftHole}>
              <span>&#xFF0B;</span> Tilf&#xF8;j n&#xE6;ste hul
            </button>
          </div>
        ) : null}

        <div className="player-picker-wrap">
          <div className="picker-heading">
            <div>
              <span>Spillere</span>
              <strong>{selectedPlayerRows.length} valgt</strong>
            </div>
            <small>Klik p&#xE5; en spiller for at til- eller frav&#xE6;lge.</small>
          </div>

          <div className="player-picker">
            {players.map((player) => {
              const selected = selectedPlayers.includes(player.id);
              const isMe = player.auth_user_id === currentUserId;
              return (
                <button
                  key={player.id}
                  type="button"
                  className={`player-chip ${selected ? "selected" : ""}`}
                  onClick={() => togglePlayer(player.id)}
                  aria-pressed={selected}
                >
                  <span className="player-chip-check">{selected ? "\u2713" : "+"}</span>
                  <span>{player.name}</span>
                  {isMe ? <small>dig</small> : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error ? <div className="error-banner"><strong>Kan ikke gemme runden</strong><span>{error}</span></div> : null}
      {success ? <div className="success-banner"><strong>Runden er sikret</strong><span>{success}</span></div> : null}

      <section className="panel score-entry-panel">
        <div className="panel-heading score-entry-heading">
          <div>
            <h2>Scorekort</h2>
            <p>
              {isNewCourse
                ? "N\u00e5r du tilf\u00f8jer et nyt hul ovenfor, dukker det straks op her."
                : "Indtast antal kast p\u00e5 hvert hul. Total og score mod par beregnes automatisk."}
            </p>
          </div>
          <div className="round-par-badge">Par {coursePar || "\u2013"}</div>
        </div>

        {selectedPlayerRows.length === 0 ? (
          <div className="empty-state">V&#xE6;lg mindst &#xE9;n spiller ovenfor.</div>
        ) : loadingHoles ? (
          <div className="new-round-loading inline-loading"><div className="spinner" /><p>Henter huller&#x2026;</p></div>
        ) : roundHoles.length === 0 ? (
          <div className="empty-state">
            {isNewCourse ? "Tilf\u00f8j f\u00f8rste hul til den nye bane ovenfor." : "Den valgte bane har ingen registrerede huller."}
          </div>
        ) : (
          <div className="table-scroll score-entry-scroll">
            <table className="stats-table score-entry-table">
              <thead>
                <tr>
                  <th>Hul</th>
                  <th>Par</th>
                  {selectedPlayerRows.map((player) => (
                    <th key={player.id}>{player.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roundHoles.map((hole) => (
                  <tr key={hole.id}>
                    <th>{hole.hole_label}</th>
                    <td>{hole.par}</td>
                    {selectedPlayerRows.map((player) => {
                      const value = scores[player.id]?.[hole.id] ?? "";
                      const numeric = Number(value);
                      const diff = value !== "" && Number.isInteger(numeric) ? numeric - hole.par : null;
                      return (
                        <td key={player.id}>
                          <div className="score-input-wrap">
                            <input
                              className="score-input"
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={99}
                              step={1}
                              value={value}
                              onChange={(event) => updateScore(player.id, hole.id, event.target.value)}
                              aria-label={`${player.name}, hul ${hole.hole_label}`}
                            />
                            <span className={`hole-diff ${diff === null ? "empty" : diff < 0 ? "under" : diff > 0 ? "over" : "even"}`}>
                              {diff === null ? "" : toParLabel(diff)}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="total-row score-total-row">
                  <th>Sum</th>
                  <td><strong>{coursePar}</strong></td>
                  {selectedPlayerRows.map((player) => {
                    const total = totals[player.id]?.total ?? 0;
                    const complete = totals[player.id]?.complete ?? false;
                    return (
                      <td key={player.id}>
                        <strong>{complete ? total : "\u2013"}</strong>
                        <span className="to-par-inline">
                          {complete ? toParLabel(total - coursePar) : "ufuldst\u00e6ndig"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="round-save-bar">
          <div>
            <strong>{selectedPlayerRows.length} spiller{selectedPlayerRows.length === 1 ? "" : "e"}</strong>
            <span>{roundHoles.length} huller &#xB7; {playedOn || "ingen dato"}</span>
          </div>
          <button
            type="button"
            className="primary-button save-round-button"
            onClick={saveRound}
            disabled={saving || loadingHoles || selectedPlayerRows.length === 0 || roundHoles.length === 0}
          >
            {saving ? "Gemmer sikkert\u2026" : isNewCourse ? "Gem ny bane + runde" : "Gem runde"}
          </button>
        </div>
      </section>
    </div>
  );
}

