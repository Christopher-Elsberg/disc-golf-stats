import type { PlayerRow, CourseRow, HoleRow, RoundRow, RoundPlayerRow, HoleScoreRow, PlayerRoundResult, HoleResult } from "./models.ts";
import { roundTo, mean, populationSd, newestFirst, oldestFirst, courseLayoutKey } from "./shared.ts";
import { calculateCourseRating } from "./rating.ts";

export type StatisticsContext = {
  players: PlayerRow[];
  selectedRounds: RoundRow[];
  roundPlayers: RoundPlayerRow[];
  holeScores: HoleScoreRow[];
  courseById: Map<string, CourseRow>;
  holesByCourseLayout: Map<string, HoleRow[]>;
  availableSeasons: number[];
  availableCourses: Array<Record<string, unknown>>;
  requestedSeason: number | null;
  requestedCourseId: string | null;
  requestedSection: string;
  targetPlayerId: string;
  caller: { id: string; role: string };
  visibleOpponentIds: Set<string>;
  playerRoundNumberById: Map<string, number>;
};

export function buildStatisticsResponse(context: StatisticsContext): Response {
  const {
    players, selectedRounds, roundPlayers, holeScores,
    courseById, holesByCourseLayout, availableSeasons, availableCourses,
    requestedSeason, requestedCourseId, requestedSection, targetPlayerId, caller,
    visibleOpponentIds, playerRoundNumberById,
  } = context;
  const needs = (section: string) => requestedSection === "all" || requestedSection === section;
  const needsHistory = needs("rating") || needs("recent") || needs("allrounds");

      // Apply personal numbering only when serializing that player's stats.
      // global_round_number is retained in the response for troubleshooting.
      function personalizeRound<T extends { round_id: string; round_number: number }>(value: T): T & { global_round_number: number } {
        return {
          ...value,
          global_round_number: value.round_number,
          round_number: playerRoundNumberById.get(value.round_id) ?? value.round_number,
        };
      }


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

      const resultsByRound = new Map<string, PlayerRoundResult[]>();
      for (const result of completeResults) {
        const arr = resultsByRound.get(result.round_id) ?? [];
        arr.push(result);
        resultsByRound.set(result.round_id, arr);
      }

      const relevantPlayerIds = new Set(roundPlayers.map((rp) => rp.player_id));
      const relevantPlayers = players
        .filter((p) => p.id === targetPlayerId || relevantPlayerIds.has(p.id))
        .sort((a, b) => a.name.localeCompare(b.name));

      const targetPlayers = relevantPlayers.filter((p) => p.id === targetPlayerId);

      const playerStats = targetPlayers.map((player) => {
        const playerResults = completeResults
          .filter((r) => r.player_id === player.id)
          .sort(newestFirst);

        const lastFiveForHandicap = playerResults.slice(0, 5);
        const ratedRoundRatings = playerResults
          .map((r) => r.rating)
          .filter((rating): rating is number => rating !== null && Number.isFinite(rating));
        const lastFiveRated = playerResults
          .filter((r) => r.rating !== null)
          .slice(0, 5);

        let roundWins = 0;
        let outrightWins = 0;
        let tiedWins = 0;

        for (const result of playerResults) {
          const roundResults = resultsByRound.get(result.round_id) ?? [];
          if (roundResults.length < 2) continue;
          const best = Math.min(...roundResults.map((r) => r.total_strokes));
          const winners = roundResults.filter((r) => r.total_strokes === best);
          if (result.total_strokes === best) {
            roundWins += 1;
            if (winners.length === 1) outrightWins += 1;
            else tiedWins += 1;
          }
        }

        return {
          player_id: player.id,
          player_name: player.name,
          rounds_played: playerResults.length,
          round_wins: roundWins,
          outright_round_wins: outrightWins,
          tied_round_wins: tiedWins,
          average_strokes: roundTo(mean(playerResults.map((r) => r.total_strokes))),
          average_score_to_par: roundTo(mean(playerResults.map((r) => r.score_to_par))),
          handicap: roundTo(
            mean(lastFiveForHandicap.map((r) => r.course_par - r.total_strokes)),
          ),
          rating: roundTo(
            mean(lastFiveRated.map((r) => r.rating).filter((r): r is number => r !== null)),
          ),
          // Standard deviation of all rated round performances in the active filters.
          // With fewer than two ratings there is no meaningful consistency measure.
          consistency_sd_rating: ratedRoundRatings.length >= 2
            ? roundTo(populationSd(ratedRoundRatings))
            : null,
          consistency_rated_rounds_used: ratedRoundRatings.length,
          last_five_rounds_used: lastFiveForHandicap.length,
          last_five_rated_rounds_used: lastFiveRated.length,
        };
      });

      const headToHead: any[] = [];
      if (needs("headtohead")) {
      for (let i = 0; i < relevantPlayers.length; i++) {
        for (let j = i + 1; j < relevantPlayers.length; j++) {
          const p1 = relevantPlayers[i];
          const p2 = relevantPlayers[j];
          if (p1.id !== targetPlayerId && p2.id !== targetPlayerId) continue;
          let games = 0;
          let p1Wins = 0;
          let p2Wins = 0;
          let ties = 0;

          for (const roundResults of resultsByRound.values()) {
            const r1 = roundResults.find((r) => r.player_id === p1.id);
            const r2 = roundResults.find((r) => r.player_id === p2.id);
            if (!r1 || !r2) continue;

            games += 1;
            if (r1.total_strokes < r2.total_strokes) p1Wins += 1;
            else if (r2.total_strokes < r1.total_strokes) p2Wins += 1;
            else ties += 1;
          }

          // No head-to-head record exists until both players have completed the same round.
          if (games === 0) continue;

          headToHead.push({
            player_1_id: p1.id,
            player_1_name: p1.name,
            player_2_id: p2.id,
            player_2_name: p2.name,
            games,
            player_1_wins: p1Wins,
            player_2_wins: p2Wins,
            ties,
            player_1_win_rate: games ? roundTo((100 * p1Wins) / games, 0) : null,
            player_2_win_rate: games ? roundTo((100 * p2Wins) / games, 0) : null,
          });
        }
      }
      }

      const shotCounts = needs("shots") ? targetPlayers.map((player) => {
        const playerResults = completeResults.filter((r) => r.player_id === player.id);
        const allHoles = playerResults.flatMap((r) => r.holes);
        const total = allHoles.length;

        const strokesOver10 = allHoles.filter((h) => h.strokes > 10).length;
        const birdies = allHoles.filter((h) => h.to_par === -1).length;
        const bogeys = allHoles.filter((h) => h.to_par === 1).length;
        const doublePlus = allHoles.filter((h) => h.to_par >= 2).length;

        const rate = (count: number) => (total ? roundTo((100 * count) / total) : null);

        return {
          player_id: player.id,
          player_name: player.name,
          holes_played: total,
          strokes_over_10: { count: strokesOver10, rate: rate(strokesOver10) },
          birdie: { count: birdies, rate: rate(birdies) },
          bogey: { count: bogeys, rate: rate(bogeys) },
          double_plus: { count: doublePlus, rate: rate(doublePlus) },
        };
      }) : [];

      const scopeCourseIds = [...new Set(selectedRounds.map((r) => r.course_id))];

      const frontBack = needs("frontback") ? scopeCourseIds.map((courseId) => {
        const course = courseById.get(courseId)!;

        const rows = targetPlayers.map((player) => {
          const playerResults = completeResults.filter(
            (r) => r.player_id === player.id && r.course_id === courseId,
          );

          const frontScores: number[] = [];
          const backScores: number[] = [];

          for (const result of playerResults) {
            const orderedHoles = [...result.holes].sort(
              (a, b) => a.display_order - b.display_order,
            );
            const splitAt = Math.ceil(orderedHoles.length / 2);

            frontScores.push(
              orderedHoles
                .slice(0, splitAt)
                .reduce((sum, h) => sum + h.to_par, 0),
            );
            backScores.push(
              orderedHoles
                .slice(splitAt)
                .reduce((sum, h) => sum + h.to_par, 0),
            );
          }

          return {
            player_id: player.id,
            player_name: player.name,
            rounds: playerResults.length,
            front_to_par: roundTo(mean(frontScores)),
            back_to_par: roundTo(mean(backScores)),
          };
        });

        const currentHoles =
          holesByCourseLayout.get(
            courseLayoutKey(course.id, Number(course.current_layout_version)),
          ) ?? [];
        const splitAt = Math.ceil(currentHoles.length / 2);

        return {
          course_id: course.id,
          course_name: course.name,
          front_label: `Front ${splitAt}`,
          back_label: `Back ${Math.max(0, currentHoles.length - splitAt)}`,
          players: rows,
        };
      }) : [];

      const holeStats = (needs("holes") || needs("bestworst")) ? scopeCourseIds.map((courseId) => {
        const course = courseById.get(courseId)!;
        const currentHoles =
          holesByCourseLayout.get(
            courseLayoutKey(course.id, Number(course.current_layout_version)),
          ) ?? [];

        return {
          course_id: course.id,
          course_name: course.name,
          holes: currentHoles.map((hole) => ({
            hole_id: hole.id,
            hole_label: hole.hole_label,
            display_order: hole.display_order,
            par: Number(hole.par),
            players: targetPlayers.map((player) => {
              const courseResults = completeResults
                .filter((r) => r.course_id === courseId && r.player_id === player.id)
                .sort(newestFirst);

              const lastFiveCourseResults = courseResults.slice(0, 5);

              const recentValues = lastFiveCourseResults
                .flatMap((r) => r.holes)
                .filter((h) => h.hole_label === hole.hole_label);

              const allTimeValues = courseResults
                .flatMap((r) => r.holes)
                .filter((h) => h.hole_label === hole.hole_label);

              return {
                player_id: player.id,
                player_name: player.name,
                last_five_samples: recentValues.length,
                all_time_samples: allTimeValues.length,
                average_strokes_last_five: roundTo(mean(recentValues.map((v) => v.strokes))),
                average_to_par_last_five: roundTo(mean(recentValues.map((v) => v.to_par))),
                best_strokes_all_time: allTimeValues.length
                  ? Math.min(...allTimeValues.map((v) => v.strokes))
                  : null,
              };
            }),
          })),
        };
      }) : [];

      const bestWorstHoles: any[] = [];
      if (needs("bestworst")) {
      for (const courseStats of holeStats) {
        for (const player of relevantPlayers) {
          const candidates = courseStats.holes
            .map((hole: any) => {
              const stat = hole.players.find((p: any) => p.player_id === player.id);
              return stat && stat.last_five_samples > 0
                ? {
                    hole_id: hole.hole_id,
                    hole_label: hole.hole_label,
                    display_order: hole.display_order,
                    par: hole.par,
                    average_strokes: stat.average_strokes_last_five,
                    average_to_par: stat.average_to_par_last_five,
                  }
                : null;
            })
            .filter(Boolean) as any[];

          candidates.sort((a, b) => {
            if (a.average_to_par !== b.average_to_par) {
              return a.average_to_par - b.average_to_par;
            }
            return a.display_order - b.display_order;
          });

          bestWorstHoles.push({
            course_id: courseStats.course_id,
            course_name: courseStats.course_name,
            player_id: player.id,
            player_name: player.name,
            best_hole: candidates.length ? candidates[0] : null,
            worst_hole: candidates.length ? candidates[candidates.length - 1] : null,
          });
        }
      }
      }

      const bestRounds = needs("best") ? targetPlayers.map((player) => {
        // Highest course-adjusted rating wins, regardless of raw stroke count.
        // Unrated rounds cannot be a player's best rated round.
        const candidates = completeResults
          .filter((r) =>
            r.player_id === player.id &&
            r.rating !== null &&
            Number.isFinite(r.rating)
          )
          .sort((a, b) => {
            const ratingDiff = (b.rating as number) - (a.rating as number);
            if (ratingDiff !== 0) return ratingDiff;
            if (a.score_to_par !== b.score_to_par) return a.score_to_par - b.score_to_par;
            if (a.total_strokes !== b.total_strokes) return a.total_strokes - b.total_strokes;
            return newestFirst(a, b);
          });

        const best = candidates[0] ?? null;
        return {
          player_id: player.id,
          player_name: player.name,
          best_round: best,
        };
      }) : [];

      const toScorecard = (round: RoundRow) => {
          const course = courseById.get(round.course_id)!;
          const layoutVersion = Number(round.course_layout_version || 1);
          const courseHoles =
            holesByCourseLayout.get(courseLayoutKey(round.course_id, layoutVersion)) ?? [];
          const roundResults = (resultsByRound.get(round.id) ?? []).sort((a, b) =>
            a.player_name.localeCompare(b.player_name)
          );

          return {
            round_id: round.id,
            round_number: Number(round.round_number),
            date: round.played_on,
            season: Number(round.season),
            course_id: course.id,
            course_name: course.name,
            course_layout_version: layoutVersion,
            course_par: courseHoles.reduce((sum, h) => sum + Number(h.par), 0),
            holes: courseHoles.map((h) => ({
              hole_id: h.id,
              hole_label: h.hole_label,
              display_order: h.display_order,
              par: Number(h.par),
            })),
            players: roundResults.map((result) => ({
              player_id: result.player_id,
              player_name: result.player_name,
              total_strokes: result.total_strokes,
              score_to_par: result.score_to_par,
              rating: roundTo(result.rating),
              scores: result.holes.map((h) => ({
                hole_id: h.hole_id,
                strokes: h.strokes,
              })),
            })),
          };
      };

      // Personal scorecards must NOT be derived from the five latest GLOBAL rounds.
      const playerLastFiveScorecards: Record<string, ReturnType<typeof toScorecard>[]> = {};
      if (needs("scorecards")) {
      for (const player of targetPlayers) {
        playerLastFiveScorecards[player.id] = completeResults
          .filter((result) => result.player_id === player.id)
          .sort(newestFirst)
          .slice(0, 5)
          .flatMap((result) => {
            const round = selectedRounds.find((item) => item.id === result.round_id);
            return round ? [toScorecard(round)] : [];
          })
          .map((card) => ({
            ...card,
            players: card.players.filter((item) => item.player_id === player.id),
          }));
      }
      }

      const ratingHistory = needsHistory ? targetPlayers.map((player) => ({
        player_id: player.id,
        player_name: player.name,
        history: completeResults
          .filter((r) => r.player_id === player.id)
          .sort(oldestFirst)
          .map((r) => ({
            round_id: r.round_id,
            round_number: r.round_number,
            date: r.date,
            season: r.season,
            course_id: r.course_id,
            course_name: r.course_name,
            course_layout_version: r.course_layout_version,
            total_strokes: r.total_strokes,
            course_par: r.course_par,
            score_to_par: r.score_to_par,
            rating: roundTo(r.rating),
          })),
      })) : [];

      // SECURITY BOUNDARY: return only the authorized profile's data.
      // Never serialize the all-player objects used for calculating aggregates.
      const targetResults = completeResults.filter((r) => r.player_id === targetPlayerId);
      const targetRoundIds = new Set(roundPlayers
        .filter((rp) => rp.player_id === targetPlayerId)
        .map((rp) => rp.round_id));
      const targetCards = (playerLastFiveScorecards[targetPlayerId] ?? [])
        .map(personalizeRound);
      const targetHeadToHead = headToHead.filter((r) =>
        (r.player_1_id === targetPlayerId &&
          (caller.role === "admin" || visibleOpponentIds.has(r.player_2_id))) ||
        (r.player_2_id === targetPlayerId &&
          (caller.role === "admin" || visibleOpponentIds.has(r.player_1_id)))
      );

      return Response.json({
        available_seasons: availableSeasons,
        available_courses: availableCourses,
        selected: {
          season: requestedSeason ?? "all",
          course_id: requestedCourseId ?? "all",
        },
        formulas: {
          handicap: "average(course_par - total_strokes) over player's latest 5 completed rounds",
          rating: "course-specific rating_formula; unrated courses return null",
          rating_variables: ["score", "course_par", "score_to_par"],
          player_rating: "average of player's latest 5 completed rounds that have a rating",
          head_to_head_winner: "lowest total_strokes wins",
          consistency: "population standard deviation of all rated round ratings in selected season/course filters (at least 2 rated rounds; lower is more consistent)",
        },
        warnings: {
          rating_formula_errors: uniqueFormulaErrors.filter((item) =>
            targetResults.some((r) => r.course_id === item.course_id)),
        },
        stats: {
          rounds: targetRoundIds.size,
          completed_rounds: new Set(targetResults.map((r) => r.round_id)).size,
          player_round_results: targetResults.length,
          incomplete_entries: incompleteEntries
            .filter((r) => r.player_id === targetPlayerId)
            .map(personalizeRound),
          player_stats: playerStats.filter((r) => r.player_id === targetPlayerId),
          head_to_head: targetHeadToHead,
          shot_counts: shotCounts.filter((r) => r.player_id === targetPlayerId),
          front_back: frontBack.map((course) => ({
            ...course,
            players: course.players.filter((r) => r.player_id === targetPlayerId),
          })).filter((course) => course.players.length > 0),
          best_rounds: bestRounds
            .filter((r) => r.player_id === targetPlayerId)
            .map((item) => ({
              ...item,
              best_round: item.best_round ? personalizeRound(item.best_round) : null,
            })),
          hole_stats: holeStats.map((course) => ({
            ...course,
            holes: course.holes.map((hole) => ({
              ...hole,
              players: hole.players.filter((r) => r.player_id === targetPlayerId),
            })),
          })),
          best_worst_holes: bestWorstHoles.filter((r) => r.player_id === targetPlayerId),
          last_five_scorecards: targetCards,
          player_last_five_scorecards: { [targetPlayerId]: targetCards },
          rating_history: ratingHistory
            .filter((r) => r.player_id === targetPlayerId)
            .map((item) => ({
              ...item,
              history: item.history.map(personalizeRound),
            })),
        },
      });
}
