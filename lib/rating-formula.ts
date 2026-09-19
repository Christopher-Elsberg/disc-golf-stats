export type RatingVariables = {
  score: number;
  course_par: number;
  score_to_par: number;
};

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: keyof RatingVariables }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(input: string): Token[] {
  const source = input
    .replace(/,/g, ".")
    .replace(/\u00d7/g, "*")
    .replace(/\u2212/g, "-")
    .trim();

  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }

    const number = rest.match(/^\d+(?:\.\d+)?/);
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }

    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      const value = identifier[0] as keyof RatingVariables;
      if (!(["score", "course_par", "score_to_par"] as string[]).includes(value)) {
        throw new Error(`Ukendt variabel: ${identifier[0]}`);
      }
      tokens.push({ type: "identifier", value });
      index += identifier[0].length;
      continue;
    }

    const char = source[index];
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "lparen" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen" });
      index += 1;
      continue;
    }

    throw new Error(`Ugyldigt tegn i ratingformlen: ${char}`);
  }

  return tokens;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly variables: RatingVariables,
  ) {}

  parse(): number {
    const result = this.expression();
    if (this.index !== this.tokens.length) {
      throw new Error("Ratingformlen kunne ikke fortolkes helt.");
    }
    if (!Number.isFinite(result)) {
      throw new Error("Ratingformlen giver ikke et gyldigt tal.");
    }
    return result;
  }

  private expression(): number {
    let value = this.term();
    while (true) {
      const token = this.tokens[this.index];
      if (token?.type !== "operator" || (token.value !== "+" && token.value !== "-")) break;
      this.index += 1;
      const right = this.term();
      value = token.value === "+" ? value + right : value - right;
    }
    return value;
  }

  private term(): number {
    let value = this.factor();
    while (true) {
      const token = this.tokens[this.index];
      if (token?.type !== "operator" || (token.value !== "*" && token.value !== "/")) break;
      this.index += 1;
      const right = this.factor();
      if (token.value === "/" && right === 0) throw new Error("Ratingformlen dividerer med 0.");
      value = token.value === "*" ? value * right : value / right;
    }
    return value;
  }

  private factor(): number {
    const token = this.tokens[this.index];
    if (!token) throw new Error("Ratingformlen slutter uventet.");

    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      this.index += 1;
      const value = this.factor();
      return token.value === "-" ? -value : value;
    }

    if (token.type === "number") {
      this.index += 1;
      return token.value;
    }

    if (token.type === "identifier") {
      this.index += 1;
      return this.variables[token.value];
    }

    if (token.type === "lparen") {
      this.index += 1;
      const value = this.expression();
      if (this.tokens[this.index]?.type !== "rparen") {
        throw new Error("Ratingformlen mangler en afsluttende parentes.");
      }
      this.index += 1;
      return value;
    }

    throw new Error("Ugyldig ratingformel.");
  }
}

export function evaluateRatingFormula(formula: string, variables: RatingVariables): number {
  const tokens = tokenize(formula);
  if (tokens.length === 0) throw new Error("Ratingformlen er tom.");
  return new Parser(tokens, variables).parse();
}

export function validateRatingFormula(formula: string): string | null {
  if (!formula.trim()) return null;
  try {
    evaluateRatingFormula(formula, {
      score: 60,
      course_par: 66,
      score_to_par: -6,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Ugyldig ratingformel.";
  }
}
