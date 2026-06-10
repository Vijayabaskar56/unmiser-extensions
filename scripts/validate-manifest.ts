// Validate one parser-plugin bundle: JSON-schema shape first (clear authoring
// errors), then every fixture through the real parser engine.
//
//   bun scripts/validate-manifest.ts manifests/<bank>.json
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateManifestFixtures } from "../src/fixtures";
import { manifestBundleSchema } from "../src/manifest-schema";
import type { ManifestWithFixtures } from "../src/types";

const target = process.argv[2];
if (!target) {
  console.error("usage: bun scripts/validate-manifest.ts <path-to-manifest.json>");
  process.exit(2);
}

const raw = JSON.parse(readFileSync(resolve(target), "utf8"));
const parsed = manifestBundleSchema.safeParse(raw);
if (!parsed.success) {
  for (const issue of parsed.error.issues) {
    console.error(`SCHEMA ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

const bundle = parsed.data as unknown as ManifestWithFixtures;
const failures = validateManifestFixtures(bundle);
if (failures.length === 0) {
  console.log(`OK ${bundle.manifest.pluginId}: ${bundle.fixtures.length} fixtures pass`);
  process.exit(0);
}
for (const failure of failures) {
  console.error(`FAIL ${bundle.manifest.pluginId} [${failure.fixture}]: ${failure.message}`);
}
process.exit(1);
