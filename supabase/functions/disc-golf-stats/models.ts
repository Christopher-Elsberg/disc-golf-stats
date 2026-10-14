export type PlayerRow = {
  id: string;
  name: string;
  active: boolean;
  auth_user_id: string | null;
};

export type CourseRow = {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  rating_formula: string | null;
  current_layout_version: number;
};

export type HoleRow = {
  id: string;
  course_id: string;
  layout_version: number;
  score_index: number;
  hole_label: string;
  display_order: number;
  par: number;
};

export type RoundRow = {
  id: string;
  round_number: number;
  course_id: string;
  course_layout_version: number;
  played_on: string;
  season: number;
  created_by: string | null;
};

export type RoundPlayerRow = {
  round_id: string;
  player_id: string;
};

export type HoleScoreRow = {
  id: string;
  round_id: string;
  player_id: string;
  course_hole_id: string;
  strokes: number;
};

export type HoleResult = {
  hole_id: string;
  hole_label: string;
  display_order: number;
  par: number;
  strokes: number;
  to_par: number;
};

export type PlayerRoundResult = {
  round_id: string;
  round_number: number;
  date: string;
  season: number;
  course_id: string;
  course_name: string;
  course_layout_version: number;
  player_id: string;
  player_name: string;
  total_strokes: number;
  course_par: number;
  score_to_par: number;
  rating: number | null;
  holes: HoleResult[];
};

export type RatingVariables = {
  score: number;
  course_par: number;
  score_to_par: number;
};

export type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: keyof RatingVariables }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "leftParen" }
  | { type: "rightParen" };

