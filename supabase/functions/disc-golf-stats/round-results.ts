import type { PlayerRow, CourseRow, HoleRow, RoundRow, RoundPlayerRow, HoleScoreRow, PlayerRoundResult, HoleResult } from "./models.ts";
import { courseLayoutKey } from "./shared.ts";
import { calculateCourseRating } from "./rating.ts";

type Input = {
  players: PlayerRow[];
  selectedRounds: RoundRow[];
  roundPlayers: RoundPlayerRow[];
  holeScores: HoleScoreRow[];
  courseById: Map<string, CourseRow>;
  holesByCourseLayout: Map<string, HoleRow[]>;
};

/** Construct only requested-player round scores and their actual co-players. */
export function assembleRoundResults({
  players, selectedRounds, roundPlayers, holeScores, courseById, holesByCourseLayout,
}: Input) {
      const playerById = new Map(players.map((p) => [p.id, p]));
      const roundById = new Map(selectedRounds.map((r) => [r.id, r]));

      const scoresByRoundPlayer = new Map<string, HoleScoreRow[]>();
      for (const score of holeScores) {
        const key = `${score.round_id}:${score.player_id}`;
        const arr = scoresByRoundPlayer.get(key) ?? [];
        arr.push(score);
        scoresByRoundPlayer.set(key, arr);
      }

      const completeResults: PlayerRoundResult[] = [];
      const incompleteEntries: any[] = [];
      const formulaErrors: any[] = [];

      for (const rp of roundPlayers) {
        const round = roundById.get(rp.round_id);
        const player = playerById.get(rp.player_id);
        if (!round || !player) continue;

        const course = courseById.get(round.course_id);
        if (!course) continue;

        const layoutVersion = Number(round.course_layout_version || 1);
        const courseHoles =
          holesByCourseLayout.get(courseLayoutKey(round.course_id, layoutVersion)) ?? [];

        if (courseHoles.length === 0) {
          incompleteEntries.push({
            round_id: round.id,
            round_number: round.round_number,
            player_id: player.id,
            player_name: player.name,
            reason: "missing_course_layout",
            course_layout_version: layoutVersion,
            missing_holes: [],
          });
          continue;
        }

        const rawScores = scoresByRoundPlayer.get(`${rp.round_id}:${rp.player_id}`) ?? [];
        const scoreMap = new Map(rawScores.map((s) => [s.course_hole_id, Number(s.strokes)]));
        const missingHoles = courseHoles.filter((h) => !scoreMap.has(h.id));

        if (missingHoles.length > 0) {
          incompleteEntries.push({
            round_id: round.id,
            round_number: round.round_number,
            player_id: player.id,
            player_name: player.name,
            reason: "missing_scores",
            course_layout_version: layoutVersion,
            missing_holes: missingHoles.map((h) => h.hole_label),
          });
          continue;
        }

        const holeResults: HoleResult[] = courseHoles.map((hole) => {
          const strokes = scoreMap.get(hole.id)!;
          return {
            hole_id: hole.id,
            hole_label: hole.hole_label,
            display_order: hole.display_order,
            par: Number(hole.par),
            strokes,
            to_par: strokes - Number(hole.par),
          };
        });

        const totalStrokes = holeResults.reduce((sum, h) => sum + h.strokes, 0);
        const coursePar = holeResults.reduce((sum, h) => sum + h.par, 0);
        const scoreToPar = totalStrokes - coursePar;

        let rating: number | null = null;
        try {
          rating = calculateCourseRating(course, totalStrokes, coursePar);
        } catch (error) {
          formulaErrors.push({
            course_id: course.id,
            course_name: course.name,
            rating_formula: course.rating_formula,
            error: error instanceof Error ? error.message : String(error),
          });
          rating = null;
        }

        completeResults.push({
          round_id: round.id,
          round_number: Number(round.round_number),
          date: round.played_on,
          season: Number(round.season),
          course_id: course.id,
          course_name: course.name,
          course_layout_version: layoutVersion,
          player_id: player.id,
          player_name: player.name,
          total_strokes: totalStrokes,
          course_par: coursePar,
          score_to_par: scoreToPar,
          rating,
          holes: holeResults,
        });
      }

      const uniqueFormulaErrors = [...new Map(
        formulaErrors.map((item) => [item.course_id, item]),
      ).values()];


  return { completeResults, incompleteEntries, uniqueFormulaErrors };
}
