// CI catalog generator: validates every bundle in manifests/ (schema +
// fixtures + unique pluginIds — same checks as validate-all.ts) and emits
// index.json at the repo root with per-file integrity metadata:
//
//   {
//     "schemaVersion": "1",
//     "generatedAt": "<ISO timestamp>",
//     "signature": null,            // reserved — signing deferred
//     "entries": [
//       { pluginId, name, country, currency, version,
//         file: "manifests/<x>.json", sha256: <hex of raw file bytes>, bytes }
//     ]
//   }
//
// The app fetches index.json (via jsDelivr) to populate the browse list, then
// fetches manifests/<file> on install and re-verifies sha256 client-side.
//
//   bun scripts/generate-catalog.ts            # write index.json
//   bun scripts/generate-catalog.ts --check    # exit 1 if index.json is stale
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateManifestFixtures } from "../src/fixtures";
import { manifestBundleSchema } from "../src/manifest-schema";
import type { ManifestWithFixtures } from "../src/types";

interface CatalogEntry {
  pluginId: string;
  name: string;
  country: string;
  currency: string;
  version: string;
  file: string;
  sha256: string;
  bytes: number;
}

interface Catalog {
  schemaVersion: "1";
  generatedAt: string;
  signature: null;
  entries: CatalogEntry[];
}

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestsDir = join(repoRoot, "manifests");
const indexPath = join(repoRoot, "index.json");
const checkOnly = process.argv.includes("--check");

const files = readdirSync(manifestsDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

const seen = new Map<string, string>();
const entries: CatalogEntry[] = [];
let failures = 0;

for (const file of files) {
  const bytes = readFileSync(join(manifestsDir, file));
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    failures += 1;
    console.error(`PARSE ${file}: ${(e as Error).message}`);
    continue;
  }

  const parsed = manifestBundleSchema.safeParse(raw);
  if (!parsed.success) {
    failures += parsed.error.issues.length;
    for (const issue of parsed.error.issues) {
      console.error(`SCHEMA ${file} ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    continue;
  }

  const bundle = parsed.data as unknown as ManifestWithFixtures;
  const { pluginId, name, country, currency, version } = bundle.manifest;

  if (seen.has(pluginId)) {
    failures += 1;
    console.error(`DUPLICATE pluginId ${pluginId} in ${file} (also in ${seen.get(pluginId)})`);
    continue;
  }
  seen.set(pluginId, file);

  const fixtureFailures = validateManifestFixtures(bundle);
  failures += fixtureFailures.length;
  for (const failure of fixtureFailures) {
    console.error(`FAIL ${file} [${failure.fixture}]: ${failure.message}`);
  }

  entries.push({
    pluginId,
    name,
    country,
    currency,
    version,
    file: `manifests/${file}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  });
}

if (failures > 0) {
  console.error(`${failures} failure(s) across ${files.length} bundles — index.json not written`);
  process.exit(1);
}

entries.sort((a, b) => a.pluginId.localeCompare(b.pluginId));

const catalog: Catalog = {
  schemaVersion: "1",
  generatedAt: new Date().toISOString(),
  signature: null,
  entries,
};

// Stability: only rewrite (or flag stale) when something other than the
// timestamp changed, so CI doesn't commit-loop on generatedAt alone.
function entriesOf(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as Partial<Catalog>;
    return JSON.stringify({ schemaVersion: parsed.schemaVersion, signature: parsed.signature ?? null, entries: parsed.entries });
  } catch {
    return null;
  }
}

const next = JSON.stringify(catalog, null, 2) + "\n";
const prev = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : null;
const unchanged = prev !== null && entriesOf(prev) === entriesOf(next);

if (checkOnly) {
  if (unchanged) {
    console.log(`OK: index.json is up to date (${entries.length} entries)`);
  } else {
    console.error("STALE: index.json does not match manifests/ — run `bun scripts/generate-catalog.ts`");
    process.exit(1);
  }
} else if (unchanged) {
  console.log(`OK: index.json already up to date (${entries.length} entries) — not rewritten`);
} else {
  writeFileSync(indexPath, next);
  console.log(`Wrote index.json: ${entries.length} entries from ${files.length} bundles`);
}
