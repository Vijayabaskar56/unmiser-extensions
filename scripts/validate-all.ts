// CI entrypoint: validates every bundle in manifests/ (schema + fixtures) and
// enforces unique pluginIds across the store.
//
//   bun scripts/validate-all.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateManifestFixtures } from "../src/fixtures";
import { manifestBundleSchema } from "../src/manifest-schema";
import type { ManifestWithFixtures } from "../src/types";

const dir = fileURLToPath(new URL("../manifests", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const seen = new Map<string, string>();
let failures = 0;
let fixtures = 0;

for (const file of files) {
  const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const parsed = manifestBundleSchema.safeParse(raw);
  if (!parsed.success) {
    failures += parsed.error.issues.length;
    for (const issue of parsed.error.issues) {
      console.error(`SCHEMA ${file} ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    continue;
  }
  const bundle = parsed.data as unknown as ManifestWithFixtures;
  const id = bundle.manifest.pluginId;
  if (seen.has(id)) {
    failures += 1;
    console.error(`DUPLICATE pluginId ${id} in ${file} (also in ${seen.get(id)})`);
  }
  seen.set(id, file);
  const fails = validateManifestFixtures(bundle);
  failures += fails.length;
  fixtures += bundle.fixtures.length;
  for (const failure of fails) {
    console.error(`FAIL ${file} [${failure.fixture}]: ${failure.message}`);
  }
}

if (failures === 0) {
  console.log(`OK: ${files.length} bundles, ${fixtures} fixtures, 0 failures`);
} else {
  console.error(`${failures} failure(s) across ${files.length} bundles`);
  process.exit(1);
}
