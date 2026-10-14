import { withSupabase } from "npm:@supabase/server";
import type { PlayerRow, CourseRow, HoleRow, RoundRow, RoundPlayerRow, HoleScoreRow } from "./models.ts";
import { courseLayoutKey } from "./shared.ts";
import { fetchAll, fetchByRoundIds as fetchRowsByIds } from "./repository.ts";
import { buildStatisticsResponse } from "./statistics.ts";

export default {export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Use POST" }, { status: 405 });
    }

    // Only an authenticated identity may request a profile.
    // The privileged client is used only AFTER the friendship/admin authorization check.
    const supabase = ctx.supabaseAdmin;
    const fetchPaged = (table: string, columns: string) => fetchAll(supabase, table, columns);
    const fetchByRoundIds = (table: string, columns: string, ids: string[], column = "round_id") =>
      fetchRowsByIds(supabase, table, columns, ids, column);

    try {
      let body: { season?: number | string | null; course_id?: string | null; player_id?: string | null } = {};
      try {
        body = await req.json();
      } catch {
        body = {};
      }

      const authUserId = ctx.userClaims?.id;
      if (!authUserId) return Response.json({ error: "Authentication required" }, { status: 401 });

      const { data: caller, error: callerError } = await ctx.supabase
        .from("players")
        .select("id,role")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (callerError) throw callerError;
      if (!caller) return Response.json({ error: "Player profile missing" }, { status: 403 });

      const targetPlayerId = typeof body.player_id === "string" && body.player_id.trim()
        ? body.player_id.trim() : caller.id;
      const { data: permitted, error: aclError } = await ctx.supabase.rpc(
        "can_view_disc_golf_player", { p_player_id: targetPlayerId },
      );
      if (aclError) throw aclError;
      if (permitted !== true) {
        return Response.json({ error: "You must be friends to view this player's statistics" }, { status: 403 });
      }

      // Opponent breakdowns must not leak statistics for unrelated players.
      // Admins can see all; regular users only themselves and accepted friends.
      const visibleOpponentIds = new Set<string>([caller.id, targetPlayerId]);
      if (caller.role !== "admin") {
        const { data: friendships, error: friendsError } = await ctx.supabase
          .from("friendships")
          .select("requester_id,recipient_id")
          .eq("status", "accepted");
        if (friendsError) throw friendsError;
        for (const f of friendships ?? []) {
          if (f.requester_id === caller.id) visibleOpponentIds.add(f.recipient_id);
          if (f.recipient_id === caller.id) visibleOpponentIds.add(f.requester_id);
        }
      }

      const requestedSeason =
        body.season === undefined || body.season === null || body.season === "all"
          ? null
          : Number(body.season);

      const requestedCourseId =
        body.course_id === undefined || body.course_id === null || body.course_id === "all"
          ? null
          : body.course_id;

      if (requestedSeason !== null && !Number.isInteger(requestedSeason)) {
        return Response.json({ error: "season must be an integer or 'all'" }, { status: 400 });
      }

      const targetRoundIdsAllTime: string[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: targetRoundsError } = await supabase
          .from("round_players")
          .select("round_id")
          .eq("player_id", targetPlayerId)
          .order("round_id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (targetRoundsError) throw targetRoundsError;
        const page = data ?? [];
        targetRoundIdsAllTime.push(...page.map((item) => item.round_id));
        if (page.length < PAGE_SIZE) break;
      }
      const targetRoundSetAllTime = new Set(targetRoundIdsAllTime);

      const [playersRaw, coursesRaw, holesRaw, roundsRaw] = await Promise.all([
        fetchPaged("players", "id,name,active,auth_user_id"),
        fetchPaged(
          "courses",
          "id,name,slug,location,rating_formula,current_layout_version",
        ),
        fetchPaged(
          "course_holes",
          "id,course_id,layout_version,score_index,hole_label,display_order,par",
        ),
        fetchByRoundIds(
          "rounds",
          "id,round_number,course_id,course_layout_version,played_on,season,created_by",
          targetRoundIdsAllTime,
          "id",
        ),
      ]);

      const players = playersRaw as PlayerRow[];
      const courses = coursesRaw as CourseRow[];
      const holes = holesRaw as HoleRow[];
      const rounds = roundsRaw as RoundRow[];

      if (requestedCourseId && !courses.some((c) => c.id === requestedCourseId)) {
        return Response.json({ error: "Unknown course_id" }, { status: 400 });
      }

      const courseById = new Map(courses.map((c) => [c.id, c]));

      const holesByCourseLayout = new Map<string, HoleRow[]>();
      for (const course of courses) {
        const versions = [...new Set(
          holes
            .filter((h) => h.course_id === course.id)
            .map((h) => Number(h.layout_version)),
        )];

        for (const version of versions) {
          holesByCourseLayout.set(
            courseLayoutKey(course.id, version),
            holes
              .filter(
                (h) => h.course_id === course.id && Number(h.layout_version) === version,
              )
              .sort((a, b) => a.display_order - b.display_order),
          );
        }
      }

      const availableSeasons = [...new Set(rounds.map((r) => Number(r.season)))]
        .filter(Number.isFinite)
        .sort((a, b) => b - a);

      const availableCourses = courses
        .map((course) => {
          const currentHoles =
            holesByCourseLayout.get(
              courseLayoutKey(course.id, Number(course.current_layout_version)),
            ) ?? [];

          return {
            id: course.id,
            name: course.name,
            slug: course.slug,
            location: course.location,
            rating_formula: course.rating_formula,
            current_layout_version: Number(course.current_layout_version),
            holes: currentHoles.length,
            par: currentHoles.reduce((sum, h) => sum + Number(h.par), 0),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      // Personal round numbering is global across ALL courses/seasons, not
      // reset by the current stats filters. The database-wide round_number
      // remains the immutable ordering key; only the authorized API result
      // will show the target player's 1, 2, 3... numbering.

      const playerRoundNumberById = new Map<string, number>();
      rounds
        .filter((round) => targetRoundSetAllTime.has(round.id))
        .sort((a, b) => Number(a.round_number) - Number(b.round_number))
        .forEach((round, index) => playerRoundNumberById.set(round.id, index + 1));

      const selectedRounds = rounds.filter((round) => {
        if (requestedSeason !== null && Number(round.season) !== requestedSeason) return false;
        if (requestedCourseId !== null && round.course_id !== requestedCourseId) return false;
        return true;
      });

      const selectedRoundIds = selectedRounds.map((r) => r.id);

      const [roundPlayersRaw, holeScoresRaw] = await Promise.all([
        fetchByRoundIds("round_players", "round_id,player_id", selectedRoundIds),
        fetchByRoundIds(
          "hole_scores",
          "id,round_id,player_id,course_hole_id,strokes",
          selectedRoundIds,
        ),
      ]);

      const roundPlayers = roundPlayersRaw as RoundPlayerRow[];
      const holeScores = holeScoresRaw as HoleScoreRow[];


      return buildStatisticsResponse({
        players, selectedRounds, roundPlayers, holeScores,
        courseById, holesByCourseLayout, availableSeasons, availableCourses,
        requestedSeason, requestedCourseId, targetPlayerId, caller,
        visibleOpponentIds, playerRoundNumberById,
      });
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 },
      );
    }
  }),
};