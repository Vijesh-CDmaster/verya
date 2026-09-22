// Minimal dependency-free syntax highlighter for the workspace editor.
// Returns token lists (not HTML) so React renders every span safely.
// Coverage is deliberately pragmatic: TS/JS/TSX, JSON, SQL, Python; anything
// else falls back to plain text. Comments/strings/numbers/keywords/types/tags.

export type Token = { text: string; cls: string };

const KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "declare", "default", "delete", "do", "else", "enum", "export", "extends",
  "finally", "for", "from", "function", "get", "if", "implements", "import", "in", "infer",
  "instanceof", "interface", "is", "keyof", "let", "namespace", "new", "of", "private",
  "protected", "public", "readonly", "return", "satisfies", "set", "static", "super",
  "switch", "this", "throw", "try", "type", "typeof", "var", "void", "while", "yield",
  // python
  "and", "def", "elif", "except", "lambda", "None", "not", "or", "pass", "print", "raise",
  "True", "False", "with", "self",
]);

const LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);

// Tailwind-free token classes (the workspace needs colors inside <pre> too).
export const TOKEN_COLORS: Record<string, string> = {
  comment: "text-slate-500 italic",
  string: "text-emerald-300",
  number: "text-amber-300",
  keyword: "text-violet-300",
  literal: "text-sky-300",
  type: "text-teal-200",
  fn: "text-sky-200",
  tag: "text-rose-300",
  punct: "text-slate-400",
  plain: "text-slate-200",
};

export function tokenize(code: string, language: string): Token[] {
  if (language === "json") return tokenizeJson(code);
  if (language === "sql") return tokenizeSql(code);
  if (language === "python" || language === "typescript" || language === "javascript") {
    return tokenizeClike(code);
  }
  return [{ text: code, cls: "plain" }];
}

function push(tokens: Token[], text: string, cls: string): void {
  if (text) tokens.push({ text, cls });
}

function tokenizeClike(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    // Split identifiers/keywords from the buffered plain text.
    const parts = buffer.split(/([A-Za-z_$][A-Za-z0-9_$]*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (KEYWORDS.has(part)) push(tokens, part, "keyword");
      else if (LITERALS.has(part)) push(tokens, part, "literal");
      else if (/^[A-Z]/.test(part)) push(tokens, part, "type");
      else if (code[tokens.length] === undefined) push(tokens, part, "plain");
      else push(tokens, part, "plain");
    }
    buffer = "";
  };

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    // Line comment
    if (ch === "/" && next === "/") {
      flush();
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push(tokens, code.slice(i, stop), "comment");
      i = stop;
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      flush();
      const end = code.indexOf("*/", i + 2);
      const stop = end === -1 ? code.length : end + 2;
      push(tokens, code.slice(i, stop), "comment");
      i = stop;
      continue;
    }
    // Strings (single/double/template)
    if (ch === '"' || ch === "'" || ch === "`") {
      flush();
      let j = i + 1;
      while (j < code.length && code[j] !== ch) {
        if (code[j] === "\\") j++;
        j++;
      }
      push(tokens, code.slice(i, Math.min(j + 1, code.length)), "string");
      i = j + 1;
      continue;
    }
    // Numbers
    if (/[0-9]/.test(ch) && !/[A-Za-z0-9_$]/.test(code[i - 1] ?? "")) {
      flush();
      let j = i;
      while (j < code.length && /[0-9a-fA-FxX._]/.test(code[j])) j++;
      push(tokens, code.slice(i, j), "number");
      i = j;
      continue;
    }
    // JSX tags — heuristically color `<Name` / `</Name` / `/>`
    if (ch === "<" && /[A-Za-z/]/.test(next ?? "")) {
      flush();
      const m = /^<\/?[A-Za-z][A-Za-z0-9._-]*/.exec(code.slice(i));
      if (m) {
        push(tokens, m[0], "tag");
        i += m[0].length;
        continue;
      }
    }
    // Function call names: identifier followed by "("
    if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.exec(code.slice(i));
      if (m && !KEYWORDS.has(m[0].replace(/\s*\($/, ""))) {
        flush();
        const name = m[0].replace(/\s*\($/, "");
        push(tokens, name, "fn");
        push(tokens, m[0].slice(name.length), "punct");
        i += m[0].length;
        continue;
      }
    }
    if (/[{}()[\];:,.<>=+\-*/%!&|?~^]/.test(ch)) {
      flush();
      push(tokens, ch, "punct");
      i++;
      continue;
    }
    buffer += ch;
    i++;
  }
  flush();
  return tokens;
}

function tokenizeJson(code: string): Token[] {
  const tokens: Token[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m.index > last) push(tokens, code.slice(last, m.index), "plain");
    if (m[1]) {
      push(tokens, m[1], m[2] ? "type" : "string");
      if (m[2]) push(tokens, m[2], "punct");
    } else if (m[3]) push(tokens, m[3], "number");
    else if (m[4]) push(tokens, m[4], "literal");
    last = re.lastIndex;
  }
  if (last < code.length) push(tokens, code.slice(last), "plain");
  return tokens;
}

function tokenizeSql(code: string): Token[] {
  const tokens: Token[] = [];
  const keywords = new Set([
    "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
    "CREATE", "TABLE", "ALTER", "DROP", "INDEX", "JOIN", "LEFT", "RIGHT", "INNER",
    "OUTER", "ON", "GROUP", "BY", "ORDER", "LIMIT", "OFFSET", "AND", "OR", "NOT",
    "NULL", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "IF", "EXISTS", "AS", "WITH",
  ]);
  const re = /('(?:[^'\\]|\\.)*')|(--[^\n]*)|([A-Za-z_][A-Za-z0-9_]*)|(-?\d+(?:\.\d+)?)|([^\sA-Za-z0-9_]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1]) push(tokens, m[1], "string");
    else if (m[2]) push(tokens, m[2], "comment");
    else if (m[3]) push(tokens, m[3], keywords.has(m[3].toUpperCase()) ? "keyword" : "plain");
    else if (m[4]) push(tokens, m[4], "number");
    else push(tokens, m[5] ?? "", "punct");
  }
  return tokens;
}
