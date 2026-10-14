import type { Token, RatingVariables, CourseRow } from "./models.ts";

function normalizeFormula(formula: string) {
  return formula
    .trim()
    .replace(/,/g, ".")
    .replace(/[xXx\u00d7]/g, "*")
    .replace(/[\u2212\u2013\u2014]/g, "-");
}

function tokenizeFormula(formula: string): Token[] {
  const input = normalizeFormula(formula);
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let raw = "";
      let dots = 0;

      while (i < input.length && /[0-9.]/.test(input[i])) {
        if (input[i] === ".") dots += 1;
        raw += input[i];
        i += 1;
      }

      if (dots > 1 || raw === ".") {
        throw new Error(`Invalid number in rating formula: ${raw}`);
      }

      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number in rating formula: ${raw}`);
      }

      tokens.push({ type: "number", value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let raw = "";
      while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) {
        raw += input[i];
        i += 1;
      }

      const identifier = raw.toLowerCase();
      if (
        identifier !== "score" &&
        identifier !== "course_par" &&
        identifier !== "score_to_par"
      ) {
        throw new Error(`Unknown variable in rating formula: ${raw}`);
      }

      tokens.push({
        type: "identifier",
        value: identifier as keyof RatingVariables,
      });
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "operator", value: char });
      i += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "leftParen" });
      i += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rightParen" });
      i += 1;
      continue;
    }

    throw new Error(`Unsupported character in rating formula: ${char}`);
  }

  if (tokens.length === 0) {
    throw new Error("Rating formula is empty");
  }

  return tokens;
}

function evaluateRatingFormula(formula: string, variables: RatingVariables): number {
  const tokens = tokenizeFormula(formula);
  let index = 0;

  function peek() {
    return tokens[index] ?? null;
  }

  function consume() {
    return tokens[index++] ?? null;
  }

  function parsePrimary(): number {
    const token = consume();
    if (!token) throw new Error("Unexpected end of rating formula");

    if (token.type === "number") return token.value;
    if (token.type === "identifier") return variables[token.value];

    if (token.type === "leftParen") {
      const value = parseExpression();
      const closing = consume();
      if (!closing || closing.type !== "rightParen") {
        throw new Error("Missing closing parenthesis in rating formula");
      }
      return value;
    }

    throw new Error("Expected number, variable, or parenthesis in rating formula");
  }

  function parseUnary(): number {
    const token = peek();
    if (token?.type === "operator" && (token.value === "+" || token.value === "-")) {
      consume();
      const value = parseUnary();
      return token.value === "-" ? -value : value;
    }
    return parsePrimary();
  }

  function parseTerm(): number {
    let value = parseUnary();

    while (true) {
      const token = peek();
      if (!token || token.type !== "operator" || (token.value !== "*" && token.value !== "/")) {
        break;
      }

      consume();
      const rhs = parseUnary();

      if (token.value === "*") {
        value *= rhs;
      } else {
        if (rhs === 0) throw new Error("Division by zero in rating formula");
        value /= rhs;
      }
    }

    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();

    while (true) {
      const token = peek();
      if (!token || token.type !== "operator" || (token.value !== "+" && token.value !== "-")) {
        break;
      }

      consume();
      const rhs = parseTerm();
      value = token.value === "+" ? value + rhs : value - rhs;
    }

    return value;
  }

  const result = parseExpression();

  if (index !== tokens.length) {
    throw new Error("Unexpected token at end of rating formula");
  }

  if (!Number.isFinite(result)) {
    throw new Error("Rating formula returned a non-finite value");
  }

  return result;
}

export function calculateCourseRating(
  course: CourseRow,
  totalStrokes: number,
  coursePar: number,
): number | null {
  const formula = course.rating_formula?.trim();
  if (!formula) return null;

  return evaluateRatingFormula(formula, {
    score: totalStrokes,
    course_par: coursePar,
    score_to_par: totalStrokes - coursePar,
  });
}

