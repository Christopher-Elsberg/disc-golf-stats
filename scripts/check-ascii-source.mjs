import fs from "node:fs";
import path from "node:path";

const roots = ["app", "lib", "types"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const problems = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (!extensions.has(path.extname(entry.name))) continue;

    const text = fs.readFileSync(full, "utf8");

    for (let index = 0; index < text.length; index += 1) {
      const code = text.codePointAt(index);

      if (code > 127) {
        const before = text.slice(0, index);
        const line = before.split("\n").length;
        problems.push(`${full}:${line} contains raw non-ASCII U+${code.toString(16).toUpperCase()}`);
        if (code > 0xffff) index += 1;
      }
    }
  }
}

for (const dir of roots) walk(dir);

if (problems.length > 0) {
  console.error("");
  console.error("Source encoding check failed.");
  console.error("Use Unicode escapes in JS/TS strings and HTML entities in JSX text.");
  console.error("");
  for (const problem of problems.slice(0, 50)) {
    console.error(`- ${problem}`);
  }
  if (problems.length > 50) {
    console.error(`- ...and ${problems.length - 50} more`);
  }
  process.exit(1);
}

console.log("Source encoding check passed: app/lib/types are ASCII-safe.");
