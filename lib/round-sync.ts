import { supabase } from "@/lib/supabase";
import {
  deletePendingRound,
  getPendingRounds,
  markPendingRoundError,
  type PendingRound,
} from "@/lib/offline-rounds";

async function syncOneRound(round: PendingRound): Promise<void> {
  let finalCourseId = round.course.id;

  if (round.course.type === "new") {
    const newCourse = round.course;

    const { error: courseError } = await supabase.from("courses").upsert(
      {
        id: newCourse.id,
        name: newCourse.name,
        slug: newCourse.slug,
        location: newCourse.location,
      },
      { onConflict: "id" },
    );

    if (courseError) throw courseError;

    const { error: holesError } = await supabase.from("course_holes").upsert(
      newCourse.holes.map((hole) => ({
        id: hole.id,
        course_id: newCourse.id,
        score_index: hole.score_index,
        hole_label: hole.hole_label,
        display_order: hole.display_order,
        par: hole.par,
      })),
      { onConflict: "id" },
    );

    if (holesError) throw holesError;
    finalCourseId = newCourse.id;
  }

  const { error: roundError } = await supabase.from("rounds").upsert(
    {
      id: round.id,
      course_id: finalCourseId,
      played_on: round.played_on,
      created_by: round.auth_user_id,
    },
    { onConflict: "id" },
  );

  if (roundError) throw roundError;

  const { error: playersError } = await supabase.from("round_players").upsert(
    round.player_ids.map((playerId) => ({
      round_id: round.id,
      player_id: playerId,
    })),
    { onConflict: "round_id,player_id" },
  );

  if (playersError) throw playersError;

  const { error: scoresError } = await supabase.from("hole_scores").upsert(
    round.scores.map((score) => ({
      round_id: round.id,
      player_id: score.player_id,
      course_hole_id: score.course_hole_id,
      strokes: score.strokes,
    })),
    { onConflict: "round_id,player_id,course_hole_id" },
  );

  if (scoresError) throw scoresError;

  await deletePendingRound(round.id);
}

export type SyncResult = {
  synced: number;
  failed: number;
  lastError: string | null;
};

export async function syncPendingRounds(authUserId: string): Promise<SyncResult> {
  const pending = await getPendingRounds(authUserId);
  let synced = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const round of pending) {
    try {
      await syncOneRound(round);
      synced += 1;
    } catch (error) {
      failed += 1;
      lastError = error instanceof Error ? error.message : String(error);
      await markPendingRoundError(round, lastError);

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        break;
      }
    }
  }

  return { synced, failed, lastError };
}
