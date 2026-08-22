export type CourseOption = {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  holes: number;
  par: number;
};

export type PlayerStat = {
  player_id: string;
  player_name: string;
  rounds_played: number;
  round_wins: number;
  outright_round_wins: number;
  tied_round_wins: number;
  average_strokes: number | null;
  average_score_to_par: number | null;
  handicap: number | null;
  rating: number | null;
  consistency_sd_to_par: number | null;
  last_five_rounds_used: number;
};

export type HeadToHead = {
  player_1_id: string;
  player_1_name: string;
  player_2_id: string;
  player_2_name: string;
  games: number;
  player_1_wins: number;
  player_2_wins: number;
  ties: number;
  player_1_win_rate: number | null;
  player_2_win_rate: number | null;
};

export type RateStat = { count: number; rate: number | null };

export type ShotCount = {
  player_id: string;
  player_name: string;
  holes_played: number;
  strokes_over_10: RateStat;
  birdie: RateStat;
  bogey: RateStat;
  double_plus: RateStat;
};

export type FrontBackCourse = {
  course_id: string;
  course_name: string;
  front_label: string;
  back_label: string;
  players: Array<{
    player_id: string;
    player_name: string;
    rounds: number;
    front_to_par: number | null;
    back_to_par: number | null;
  }>;
};

export type RoundResult = {
  round_id: string;
  round_number: number;
  date: string;
  season: number;
  course_id: string;
  course_name: string;
  player_id: string;
  player_name: string;
  total_strokes: number;
  course_par: number;
  score_to_par: number;
  rating: number;
  holes: Array<{
    hole_id: string;
    hole_label: string;
    display_order: number;
    par: number;
    strokes: number;
    to_par: number;
  }>;
};

export type BestRound = {
  player_id: string;
  player_name: string;
  best_round: RoundResult | null;
};

export type HoleStatsCourse = {
  course_id: string;
  course_name: string;
  holes: Array<{
    hole_id: string;
    hole_label: string;
    display_order: number;
    par: number;
    players: Array<{
      player_id: string;
      player_name: string;
      last_five_samples: number;
      all_time_samples: number;
      average_strokes_last_five: number | null;
      average_to_par_last_five: number | null;
      best_strokes_all_time: number | null;
    }>;
  }>;
};

export type BestWorstHole = {
  course_id: string;
  course_name: string;
  player_id: string;
  player_name: string;
  best_hole: HoleSummary | null;
  worst_hole: HoleSummary | null;
};

export type HoleSummary = {
  hole_id: string;
  hole_label: string;
  display_order: number;
  par: number;
  average_strokes: number | null;
  average_to_par: number | null;
};

export type Scorecard = {
  round_id: string;
  round_number: number;
  date: string;
  season: number;
  course_id: string;
  course_name: string;
  course_par: number;
  holes: Array<{
    hole_id: string;
    hole_label: string;
    display_order: number;
    par: number;
  }>;
  players: Array<{
    player_id: string;
    player_name: string;
    total_strokes: number;
    score_to_par: number;
    scores: Array<{
      hole_id: string;
      strokes: number;
    }>;
  }>;
};

export type RatingHistory = {
  player_id: string;
  player_name: string;
  history: Array<{
    round_id: string;
    round_number: number;
    date: string;
    season: number;
    course_id: string;
    course_name: string;
    total_strokes: number;
    course_par: number;
    score_to_par: number;
    rating: number | null;
  }>;
};

export type StatsResponse = {
  available_seasons: number[];
  available_courses: CourseOption[];
  selected: {
    season: number | "all";
    course_id: string | "all";
  };
  formulas: {
    handicap: string;
    rating: string;
    rating_reference: string;
    head_to_head_winner: string;
    consistency: string;
  };
  stats: {
    rounds: number;
    completed_rounds: number;
    player_round_results: number;
    incomplete_entries: Array<{
      round_id: string;
      round_number: number;
      player_id: string;
      player_name: string;
      missing_holes: string[];
    }>;
    player_stats: PlayerStat[];
    head_to_head: HeadToHead[];
    shot_counts: ShotCount[];
    front_back: FrontBackCourse[];
    best_rounds: BestRound[];
    hole_stats: HoleStatsCourse[];
    best_worst_holes: BestWorstHole[];
    last_five_scorecards: Scorecard[];
    rating_history: RatingHistory[];
  };
};
