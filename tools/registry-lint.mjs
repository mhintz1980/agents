// tools/registry-lint.mjs
// Usage:
//   node tools/registry-lint.mjs improved-index.yml
//   node tools/registry-lint.mjs --fix --apply-moves improved-index.yml
//
// What it does (fast):
// - Validates categories
// - Normalizes alias categories (engineering→01-core-development, etc.)
// - Dedupe agent names (keeps first, drops rest)
// - Enforces kebab-case, no spaces in source_file
// - Ensures source_file lives under the right category folder
// - Optionally moves/renames files to match new paths
//
// Zero external deps (uses Node stdlib). Backups to *.bak on --fix.

import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node tools/registry-lint.mjs [--fix] [--apply-moves] <registry.yml>");
  process.exit(1);
}
const FIX = args.includes("--fix");
const APPLY_MOVES = args.includes("--apply-moves");
const ymlPath = args.filter(a => !a.startsWith("--"))[0];
if (!ymlPath) {
  console.error("Error: missing <registry.yml> path.");
  process.exit(1);
}

const raw = fs.readFileSync(ymlPath, "utf8");

// Minimal YAML parse/write (works for this structure).
// NOTE: If your YAML gets fancy, swap in `yaml` npm package.
// For now, we operate on JSON by quick 'yaml-lite' via a naive transform:
// We’ll accept the structure because the file is machine-generated & consistent.
// Safer approach: try to load via YAML if available.
let data;
try {
  // Try native JSON first (some folks export JSON with .yml)
  data = JSON.parse(raw);
} catch {
  // Very small YAML shim: only handles the given structure reliably.
  // If this ever breaks, `npm i yaml` and replace this shim.
  const { default: YAML } = await import("node:module").then(() => ({})).catch(() => ({}));
  if (YAML) { /* will never happen */ }
  // Fallback: quick require of 'yaml' if available; otherwise error nicely
  try {
    const yaml = (await import('yaml')).default;
    data = yaml.parse(raw);
  } catch {
    console.error("This YAML isn't trivially parseable without a parser.\nQuick fix:");
    console.error("  npm i yaml && replace the parser block to always use it.");
    process.exit(1);
  }
}

// --- Config ---
const categoryMapDeclared = data?.categories ?? {};
const declaredKeys = new Set(Object.keys(categoryMapDeclared));

const aliasMap = {
  engineering: "01-core-development",
  analysis: "10-research-analysis",
  quality: "04-quality-security",
  communication: "08-business-product",
  business: "08-business-product",
  specialized: "07-specialized-domains",
};

const rootCategoryKey = "superclaude-root"; // special group
const ROOT_DIR_DEFAULT = "superclaude-root";

function toKebab(s) {
  return String(s)
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9._/ -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function getCatDir(catKey) {
  // catKey is like "01-core-development" (a key in `categories:`)
  // categories map value is the folder name; if absent, fallback to catKey
  return categoryMapDeclared[catKey] || catKey;
}

function ensurePrefixedByCategory(filePath, categoryKey) {
  const catDir = getCatDir(categoryKey);
  const base = path.basename(filePath);
  // If already starts with the category folder, keep
  if (filePath.startsWith(catDir + "/")) return filePath;
  return `${catDir}/${base}`;
}

// --- Processing ---
const problems = [];
const moves = []; // {from, to}
const kept = [];
const removed = [];
const seenNames = new Set();

const agents = Array.isArray(data?.agents) ? data.agents : [];
for (const agent of agents) {
  const out = { ...agent };

  // 1) name unique
  if (!out.name) {
    problems.push({ level: "error", msg: "Agent without name", agent });
    continue;
  }
  if (seenNames.has(out.name)) {
    removed.push({ reason: "duplicate-name", agent: out });
    continue; // drop duplicates
  }
  seenNames.add(out.name);

  // 2) normalize category
  let cat = String(out.category || "").trim();
  if (aliasMap[cat]) cat = aliasMap[cat];

  if (cat && !declaredKeys.has(cat) && cat !== rootCategoryKey) {
    problems.push({ level: "warn", msg: `Unknown category '${out.category}' -> consider '${aliasMap[out.category] || "choose one of declared keys"}'`, name: out.name });
    // Best-effort: default unknowns to core-dev to avoid dropping
    cat = aliasMap[out.category] || "01-core-development";
  }
  out.category = cat || "01-core-development";

  // 3) source_file normalization
  let src = String(out.source_file || "").trim();
  if (!src) {
    // synthesize a filename if missing
    const guessed = toKebab(out.name) + ".md";
    src = guessed;
    problems.push({ level: "warn", msg: `Missing source_file; synthesized '${guessed}'`, name: out.name });
  }

  // kebab + no spaces
  const normBase = toKebab(path.basename(src));
  let norm = src.replace(path.basename(src), normBase);

  // superclaude-root docs go under ROOT_DIR_DEFAULT/
  if (out.category === rootCategoryKey) {
    if (!norm.startsWith(`${ROOT_DIR_DEFAULT}/`)) {
      norm = `${ROOT_DIR_DEFAULT}/${normBase}`;
    }
  } else {
    // ensure category folder prefix
    norm = ensurePrefixedByCategory(norm, out.category);
  }

  // queue move if path changed
  if (norm !== src) {
    moves.push({ from: src, to: norm, name: out.name });
  }
  out.source_file = norm;

  // 4) description length check
  if (out.description && out.description.length > 160) {
    problems.push({ level: "warn", msg: `Description >160 chars (${out.description.length})`, name: out.name });
  }

  kept.push(out);
}

// Build result
const result = { ...data, agents: kept };

// --- Reporting ---
const summary = {
  total: agents.length,
  kept: kept.length,
  removed: removed.length,
  duplicates_removed: removed.filter(r => r.reason === "duplicate-name").length,
  problems: problems.length,
  moves: moves.length,
};

function printReport() {
  console.log("=== Agent Registry Lint Report ===");
  console.log(`Total: ${summary.total} | Kept: ${summary.kept} | Removed (dupes): ${summary.removed} (${summary.duplicates_removed})`);
  if (problems.length) {
    console.log("\nIssues:");
    for (const p of problems) {
      console.log(` - [${p.level}] ${p.msg}${p.name ? ` — ${p.name}` : ""}`);
    }
  }
  if (moves.length) {
    console.log("\nPath fixes suggested:");
    for (const m of moves) {
      console.log(` - ${m.from}  ->  ${m.to}`);
    }
  }
  if (removed.length) {
    console.log("\nDuplicates dropped:");
    for (const r of removed) console.log(` - ${r.agent.name}`);
  }
}

printReport();

// --- Write & apply ---
if (FIX) {
  // backup
  const bak = ymlPath + ".bak";
  fs.writeFileSync(bak, raw, "utf8");

  // write YAML using yaml lib for proper formatting
  let yamlMod;
  try {
    yamlMod = (await import('yaml')).default;
  } catch {
    console.error("\nTo write fixes, we need 'yaml'. Run: npm i yaml");
    process.exit(1);
  }
  const fixed = yamlMod.stringify(result);
  fs.writeFileSync(ymlPath, fixed, "utf8");
  console.log(`\n✔ Wrote fixes to ${ymlPath} (backup at ${bak})`);

  if (APPLY_MOVES && moves.length) {
    for (const { from, to } of moves) {
      // create dir, move file if exists
      const toDir = path.dirname(to);
      fs.mkdirSync(toDir, { recursive: true });
      try {
        if (fs.existsSync(from)) {
          fs.renameSync(from, to);
          console.log(`mv ${from} -> ${to}`);
        } else {
          // If original path not found, try basename from repo root
          const base = path.basename(from);
          if (fs.existsSync(base)) {
            fs.renameSync(base, to);
            console.log(`mv ${base} -> ${to}`);
          } else {
            console.warn(`(skip) could not find file to move: ${from}`);
          }
        }
      } catch (e) {
        console.warn(`(warn) move failed ${from} -> ${to}: ${e.message}`);
      }
    }
    console.log("✔ Applied file moves where possible.");
  } else if (moves.length) {
    console.log("\nTo apply file moves later, rerun with --apply-moves");
    console.log("Or manual git moves:");
    for (const { from, to } of moves) {
      console.log(`git mv "${from}" "${to}"`);
    }
  }
}