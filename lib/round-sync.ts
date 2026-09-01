import { supabase } from "@/lib/supabase";

import {
  deletePendingRound,
  getPendingRounds,
  markPendingRoundError,
  type PendingRound,
} from "@/lib/offline-rounds";

async function syncOneRound(
  round: PendingRound,
) {
  let courseId = round.course.id;

  // ---------------------------------
  // NEW COURSE
  // ---------------------------------

  if (round.course.type === "new") {
    const { error: courseError } =
      await supabase
        .from("courses")
        .upsert(
          {
            id: round.course.id,
            name: round.course.name,
            slug: round.course.slug,
            location:
              round.course.location,
          },
          {
            onConflict: "id",
          },
        );

    if (courseError) {
      throw courseError;
    }

    const holes =
      round.course.holes.map((hole) => ({
        id: hole.id,
        course_id: round.course.id,
        score_index: hole.scoreIndex,
        hole_label: hole.holeLabel,
        display_order:
          hole.displayOrder,
        par: hole.par,
      }));

    const { error: holesError } =
      await supabase
        .from("course_holes")
        .upsert(
          holes,
          {
            onConflict: "id",
          },
        );

    if (holesError) {
      throw holesError;
    }

    courseId = round.course.id;
  }

  // ---------------------------------
  // ROUND
  // ---------------------------------

  const { error: roundError } =
    await supabase
      .from("rounds")
      .upsert(
        {
          id: round.id,
          course_id: courseId,
          played_on: round.playedOn,
          created_by:
            round.authUserId,
        },
        {
          onConflict: "id",
        },
      );

  if (roundError) {
    throw roundError;
  }

  // ---------------------------------
  // PLAYERS
  // ---------------------------------

  const roundPlayers =
    round.playerIds.map((playerId) => ({
      round_id: round.id,
      player_id: playerId,
    }));

  const { error: playersError } =
    await supabase
      .from("round_players")
      .upsert(
        roundPlayers,
        {
          onConflict:
            "round_id,player_id",
        },
      );

  if (playersError) {
    throw playersError;
  }

  // ---------------------------------
  // SCORES
  // ---------------------------------

  const holeScores =
    round.scores.map((score) => ({
      round_id: round.id,
      player_id: score.playerId,
      course_hole_id:
        score.courseHoleId,
      strokes: score.strokes,
    }));

  const { error: scoresError } =
    await supabase
      .from("hole_scores")
      .upsert(
        holeScores,
        {
          onConflict:
            "round_id,player_id,course_hole_id",
        },
      );

  if (scoresError) {
    throw scoresError;
  }

  // Everything reached Supabase
  await deletePendingRound(round.id);
}

export async function syncPendingRounds(
  authUserId: string,
) {
  const pending =
    await getPendingRounds(authUserId);

  let synced = 0;
  let failed = 0;

  for (const round of pending) {
    try {
      await syncOneRound(round);
      synced++;
    } catch (error) {
      failed++;

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await markPendingRoundError(
        round,
        message,
      );

      // Hvis nettet er væk igen,
      // giver det ikke mening at spamme
      // resten af køen.
      if (!navigator.onLine) {
        break;
      }
    }
  }

  return {
    synced,
    failed,
  };
}
