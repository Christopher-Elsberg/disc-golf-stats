import fs from "node:fs";
import path from "node:path";

// Next.js, React and TypeScript support UTF-8 source files, including
// Danish letters (ae/oe/aa with accents) and other Unicode text.
// Validate encoding, not whether every character is ASCII.
const roots = ["app", "lib", "types"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const problems = [];
let checkedFiles = 0;
const decoder = new TextDecoder("utf-8", { fatal: true });

function walk(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;

    checkedFiles += 1;
    let text;
    try {
      text = decoder.decode(fs.readFileSync(full));
    } catch {
      problems.push(full + ": invalid UTF-8 encoding");
      continue;
    }

    const invalid = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g;
    let match;
    while ((match = invalid.exec(text)) !== null) {
      const line = text.slice(0, match.index).split("\n").length;
      problems.push(full + ":" + line + " contains an invalid control or replacement character");
    }
  }
}

for (const root of roots) walk(root);

if (problems.length) {
  console.error("Source encoding check failed:");
  for (const issue of problems.slice(0, 50)) console.error("- " + issue);
  process.exit(1);
}

console.log("UTF-8 source check passed (" + checkedFiles + " files). Danish letters are supported.");
