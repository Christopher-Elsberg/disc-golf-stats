import type { PlayerRow, PlayerRoundResult } from "./models.ts";
import { roundTo, mean, populationSd, newestFirst } from "./shared.ts";

/** One player's aggregate dashboard, including wins in their own shared rounds. */
export function calculatePlayerOverview(
  targetPlayers: PlayerRow[],
  completeResults: PlayerRoundResult[],
  resultsByRound: Map<string, PlayerRoundResult[]>,
) {
      return targetPlayers.map((player) => {
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


}
