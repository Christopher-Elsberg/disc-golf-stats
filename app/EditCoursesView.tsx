"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { evaluateRatingFormula, validateRatingFormula } from "@/lib/rating-formula";
import styles from "./EditCoursesView.module.css";

type Course = {
  id: string;
  name: string;
  location: string | null;
  rating_formula: string | null;
  current_layout_version: number;
};

type Hole = {
  id: string;
  score_index: number;
  hole_label: string;
  display_order: number;
  par: number;
};

type EditableHole = Hole & { localKey: string };

type Props = {
  onSaved?: () => void;
};

function holeSignature(holes: EditableHole[]) {
  return JSON.stringify(
    holes.map((hole, index) => ({
      order: index + 1,
      label: hole.hole_label.trim(),
      par: hole.par,
    })),
  );
}

function clearCourseCaches(courseId: string) {
  try {
    window.localStorage.removeItem("disc-golf-setup-cache-v1");
    window.localStorage.removeItem("disc-golf-setup-cache-v2");
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`disc-golf-course-holes-v2:${courseId}:`)) keys.push(key);
      if (key?.startsWith(`disc-golf-course-holes-v1:${courseId}`)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Cache cleanup is optional.
  }
}

export default function EditCoursesView({ onSaved }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [ratingFormula, setRatingFormula] = useState("");
  const [holes, setHoles] = useState<EditableHole[]>([]);
  const [originalHolesSignature, setOriginalHolesSignature] = useState("");
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingHoles, setLoadingHoles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === courseId) ?? null,
    [courses, courseId],
  );

  const coursePar = useMemo(() => holes.reduce((sum, hole) => sum + hole.par, 0), [holes]);
  const formulaError = useMemo(() => validateRatingFormula(ratingFormula), [ratingFormula]);
  const layoutChanged = useMemo(
    () => holeSignature(holes) !== originalHolesSignature,
    [holes, originalHolesSignature],
  );

  const ratingPreview = useMemo(() => {
    if (!ratingFormula.trim() || formulaError || holes.length === 0) return null;
    try {
      return [-5, 0, 5].map((toPar) => {
        const score = coursePar + toPar;
        return {
          score,
          toPar,
          rating: Math.round(
            evaluateRatingFormula(ratingFormula, {
              score,
              course_par: coursePar,
              score_to_par: toPar,
            }),
          ),
        };
      });
    } catch {
      return null;
    }
  }, [coursePar, formulaError, holes.length, ratingFormula]);

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      setLoadingCourses(true);
      setError("");
      const { data, error: coursesError } = await supabase
        .from("courses")
        .select("id,name,location,rating_formula,current_layout_version")
        .order("name", { ascending: true });

      if (cancelled) return;
      if (coursesError) {
        setError(coursesError.message);
        setLoadingCourses(false);
        return;
      }

      const rows = (data ?? []) as Course[];
      setCourses(rows);
      setCourseId((current) => current || rows[0]?.id || "");
      setLoadingCourses(false);
    }

    loadCourses();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCourse) {
      setHoles([]);
      return;
    }

    const activeCourse = selectedCourse;
    setName(activeCourse.name);
    setLocation(activeCourse.location ?? "");
    setRatingFormula(activeCourse.rating_formula ?? "");
    setSuccess("");
    setError("");

    let cancelled = false;
    async function loadHoles() {
      setLoadingHoles(true);
      const { data, error: holesError } = await supabase
        .from("course_holes")
        .select("id,score_index,hole_label,display_order,par")
        .eq("course_id", activeCourse.id)
        .eq("layout_version", activeCourse.current_layout_version)
        .order("display_order", { ascending: true });

      if (cancelled) return;
      if (holesError) {
        setError(holesError.message);
        setHoles([]);
        setOriginalHolesSignature("");
        setLoadingHoles(false);
        return;
      }

      const rows = ((data ?? []) as Hole[]).map((hole) => ({
        ...hole,
        localKey: hole.id,
      }));
      setHoles(rows);
      setOriginalHolesSignature(holeSignature(rows));
      setLoadingHoles(false);
    }

    loadHoles();
    return () => {
      cancelled = true;
    };
  }, [selectedCourse]);

  function updateHole(localKey: string, field: "hole_label" | "par", value: string) {
    setHoles((current) =>
      current.map((hole) => {
        if (hole.localKey !== localKey) return hole;
        if (field === "par") {
          const parsed = Number(value);
          return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20
            ? { ...hole, par: parsed }
            : hole;
        }
        return { ...hole, hole_label: value };
      }),
    );
    setSuccess("");
  }

  function moveHole(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= holes.length) return;
    setHoles((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setSuccess("");
  }

  function addHole() {
    const numericLabels = holes
      .map((hole) => Number(hole.hole_label))
      .filter((value) => Number.isInteger(value) && value > 0);
    const nextLabel = numericLabels.length ? Math.max(...numericLabels) + 1 : holes.length + 1;
    const nextOrder = holes.length + 1;
    setHoles((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        localKey: crypto.randomUUID(),
        score_index: nextOrder,
        hole_label: String(nextLabel),
        display_order: nextOrder,
        par: 3,
      },
    ]);
    setSuccess("");
  }

  function removeHole(localKey: string) {
    setHoles((current) => current.filter((hole) => hole.localKey !== localKey));
    setSuccess("");
  }

  function validate(): string | null {
    if (!selectedCourse) return "V\u00e6lg en bane.";
    if (!name.trim()) return "Banen skal have et navn.";
    if (holes.length === 0) return "Banen skal have mindst \u00e9t hul.";
    if (holes.some((hole) => !hole.hole_label.trim())) return "Alle huller skal have et navn eller nummer.";
    const labels = holes.map((hole) => hole.hole_label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) return "Hulnavne skal v\u00e6re unikke i layoutet.";
    if (formulaError) return formulaError;
    return null;
  }

  async function saveChanges() {
    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError || !selectedCourse) {
      setError(validationError ?? "V\u00e6lg en bane.");
      return;
    }

    setSaving(true);
    try {
      let newLayoutVersion = selectedCourse.current_layout_version;

      if (layoutChanged) {
        newLayoutVersion += 1;
        const { error: insertError } = await supabase.from("course_holes").insert(
          holes.map((hole, index) => ({
            id: crypto.randomUUID(),
            course_id: selectedCourse.id,
            layout_version: newLayoutVersion,
            score_index: index + 1,
            hole_label: hole.hole_label.trim(),
            display_order: index + 1,
            par: hole.par,
          })),
        );
        if (insertError) throw insertError;
      }

      const { error: updateError } = await supabase
        .from("courses")
        .update({
          name: name.trim(),
          location: location.trim() || null,
          rating_formula: ratingFormula.trim() || null,
          current_layout_version: newLayoutVersion,
        })
        .eq("id", selectedCourse.id);
      if (updateError) throw updateError;

      clearCourseCaches(selectedCourse.id);

      const updatedCourse: Course = {
        ...selectedCourse,
        name: name.trim(),
        location: location.trim() || null,
        rating_formula: ratingFormula.trim() || null,
        current_layout_version: newLayoutVersion,
      };
      setCourses((current) =>
        current.map((course) => (course.id === updatedCourse.id ? updatedCourse : course)),
      );

      if (layoutChanged) {
        const { data, error: reloadError } = await supabase
          .from("course_holes")
          .select("id,score_index,hole_label,display_order,par")
          .eq("course_id", selectedCourse.id)
          .eq("layout_version", newLayoutVersion)
          .order("display_order", { ascending: true });
        if (reloadError) throw reloadError;
        const rows = ((data ?? []) as Hole[]).map((hole) => ({ ...hole, localKey: hole.id }));
        setHoles(rows);
        setOriginalHolesSignature(holeSignature(rows));
      }

      setSuccess(
        layoutChanged
          ? `Gemt. Nyt banelayout er version ${newLayoutVersion}. Gamle runder beholder deres tidligere layout.`
          : "Baneoplysninger og ratingformel er gemt.",
      );
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke gemme banen.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingCourses) {
    return (
      <section className="panel new-round-loading">
        <div className="spinner" />
        <p>Henter baner&#x2026;</p>
      </section>
    );
  }

  if (courses.length === 0) {
    return <div className="error-banner">Der findes ingen baner endnu.</div>;
  }

  return (
    <div className={styles.stack}>
      <section className={`panel ${styles.panel}`}>
        <div className="panel-heading">
          <div>
            <h2>Rediger baner</h2>
            <p>Ret baneinfo, ratingformel, par, hulnavne og r&#xE6;kkef&#xF8;lge.</p>
          </div>
        </div>

        <div className={styles.body}>
          <label className={styles.field}>
            <span>Bane</span>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </label>

          {selectedCourse ? (
            <div className={styles.versionBadge}>
              Aktiv layout-version: <strong>{selectedCourse.current_layout_version}</strong>
            </div>
          ) : null}
        </div>
      </section>

      {selectedCourse ? (
        <>
          <section className={`panel ${styles.panel}`}>
            <div className="panel-heading">
              <div><h2>Baneoplysninger</h2><p>Navn og lokation kan &#xE6;ndres uden at oprette et nyt layout.</p></div>
            </div>
            <div className={`${styles.body} ${styles.twoColumns}`}>
              <label className={styles.field}>
                <span>Navn</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Lokation</span>
                <input value={location} onChange={(event) => setLocation(event.target.value)} />
              </label>
            </div>
          </section>

          <section className={`panel ${styles.panel}`}>
            <div className="panel-heading">
              <div>
                <h2>Ratingformel</h2>
                <p>Efterlad feltet tomt, hvis runder p&#xE5; banen ikke skal have rating.</p>
              </div>
            </div>
            <div className={styles.body}>
              <label className={styles.field}>
                <span>Formel</span>
                <input
                  value={ratingFormula}
                  onChange={(event) => setRatingFormula(event.target.value)}
                  placeholder="1000 + 8.4 * (59 - score)"
                />
              </label>
              <div className={`${styles.formulaStatus} ${formulaError ? styles.invalid : styles.valid}`}>
                {!ratingFormula.trim()
                  ? "Ingen rating p\u00e5 denne bane."
                  : formulaError
                    ? formulaError
                    : "Formlen er gyldig."}
              </div>
              {ratingPreview ? (
                <div className={styles.previewGrid}>
                  {ratingPreview.map((item) => (
                    <div key={item.toPar} className={styles.previewCard}>
                      <span>{item.toPar === 0 ? "Par" : item.toPar > 0 ? `+${item.toPar}` : item.toPar}</span>
                      <strong>{item.rating}</strong>
                      <small>score {item.score}</small>
                    </div>
                  ))}
                </div>
              ) : null}
              <small className={styles.help}>Tilladte variabler: score, course_par og score_to_par.</small>
            </div>
          </section>

          <section className={`panel ${styles.panel}`}>
            <div className="panel-heading">
              <div>
                <h2>Aktivt banelayout</h2>
                <p>En &#xE6;ndring af huller, par eller r&#xE6;kkef&#xF8;lge opretter automatisk en ny layout-version.</p>
              </div>
              <div className={styles.parBadge}>Par {coursePar}</div>
            </div>

            <div className={styles.body}>
              {loadingHoles ? (
                <div className={styles.loading}>Henter huller&#x2026;</div>
              ) : (
                <div className={styles.holeList}>
                  {holes.map((hole, index) => (
                    <div className={styles.holeRow} key={hole.localKey}>
                      <div className={styles.order}>{index + 1}</div>
                      <label className={styles.compactField}>
                        <span>Hul</span>
                        <input
                          value={hole.hole_label}
                          onChange={(event) => updateHole(hole.localKey, "hole_label", event.target.value)}
                        />
                      </label>
                      <label className={styles.compactField}>
                        <span>Par</span>
                        <select value={hole.par} onChange={(event) => updateHole(hole.localKey, "par", event.target.value)}>
                          {Array.from({ length: 8 }, (_, parIndex) => parIndex + 2).map((par) => (
                            <option key={par} value={par}>{par}</option>
                          ))}
                        </select>
                      </label>
                      <div className={styles.moveButtons}>
                        <button type="button" onClick={() => moveHole(index, -1)} disabled={index === 0} aria-label="Flyt hul op">&#x2191;</button>
                        <button type="button" onClick={() => moveHole(index, 1)} disabled={index === holes.length - 1} aria-label="Flyt hul ned">&#x2193;</button>
                      </div>
                      <button className={styles.removeButton} type="button" onClick={() => removeHole(hole.localKey)}>Fjern</button>
                    </div>
                  ))}
                </div>
              )}

              <button className={styles.addButton} type="button" onClick={addHole}>+ Tilf&#xF8;j hul</button>

              {layoutChanged ? (
                <div className={styles.layoutWarning}>
                  Layoutet er &#xE6;ndret. Ved gem oprettes version {selectedCourse.current_layout_version + 1}; eksisterende runder &#xE6;ndres ikke.
                </div>
              ) : null}
            </div>
          </section>

          {error ? <div className="error-banner"><strong>Kunne ikke gemme</strong><span>{error}</span></div> : null}
          {success ? <div className="success-banner"><strong>Gemt</strong><span>{success}</span></div> : null}

          <div className={styles.saveBar}>
            <button className="primary-button" type="button" onClick={saveChanges} disabled={saving || loadingHoles}>
              {saving ? "Gemmer\u2026" : "Gem \u00e6ndringer"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
