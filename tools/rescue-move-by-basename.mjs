// tools/rescue-move-by-basename.mjs
// Usage: node tools/rescue-move-by-basename.mjs improved-index.yml
import fs from "fs";
import path from "path";
import yaml from "yaml";

const registry = process.argv[2] || "improved-index.yml";
const root = process.cwd();

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const doc = yaml.parse(fs.readFileSync(registry, "utf8"));
const want = (doc.agents || []).map(a => a.source_file).filter(Boolean);

const all = walk(root).filter(p => p.endsWith(".md"));
const index = new Map(); // basename -> full paths
for (const p of all) {
  const b = path.basename(p).toLowerCase();
  if (!index.has(b)) index.set(b, []);
  index.get(b).push(p);
}

let moved = 0, missing = 0, skipped = 0;
for (const to of want) {
  const base = path.basename(to).toLowerCase();
  if (fs.existsSync(to)) { skipped++; continue; }
  const candidates = index.get(base) || [];
  if (candidates.length === 1) {
    const from = candidates[0];
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try {
      fs.renameSync(from, to);
      console.log(`mv ${from} -> ${to}`);
      moved++;
    } catch (e) {
      console.warn(`(warn) move failed ${from} -> ${to}: ${e.message}`);
    }
  } else if (candidates.length > 1) {
    console.warn(`(ambiguous) ${base} has ${candidates.length} matches:`);
    candidates.forEach(c => console.warn("  - " + c));
  } else {
    console.warn(`(missing) could not find source for ${to}`);
    missing++;
  }
}

console.log(`Done. moved=${moved}, skipped=${skipped}, unresolved_missing=${missing}`);