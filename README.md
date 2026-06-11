# Unmiser Extensions

The community store of bank SMS parser plugins for
[Unmiser](https://github.com/Vijayabaskar56/unmiser). Each plugin is a single
JSON file: a declarative parsing manifest plus the SMS fixtures that prove it.
No code required to contribute a bank.

99 banks across India, Thailand, UAE, Nepal, Tanzania, Kenya, Ethiopia, Iran,
Saudi Arabia, Egypt, the US, and more — ported from the original
[Cashiro](https://github.com/ritesh) `parser-core` Kotlin parsers. Per-bank
porting notes and known deviations live in `docs/parser-port-notes.md`.

## Add a bank

1. Copy any file in `manifests/` and rename it `<your-bank>.json`. Keep
   `"$schema": "../manifest.schema.json"` — your editor will validate as you
   type.
2. Fill in `manifest`: `dispatch` (sender ids / DLT regexes), `filter`
   (exclude + required keywords), `extract` (regex extractors for amount,
   merchant, balance, reference, accountLast4), `typeRules`, and optional
   `pipeline` steps.
3. Add `fixtures`: real SMS bodies (anonymize names/numbers) with the expected
   parse result. Include at least one `REJECTED` fixture if your filter drops
   promos/OTPs.
4. Validate:

   ```bash
   bun install
   bun scripts/validate-manifest.ts manifests/<your-bank>.json
   ```

5. Run the whole store before opening a PR: `bun run validate`
   (also checks pluginId uniqueness).

## Conventions

- `pluginId`: `<iso-country>.<bank>.<bank|card|wallet>`, lowercase
  (e.g. `in.axis.bank`, `th.ktc.card`, `ke.mpesa.wallet`).
- Amounts in expected fields are normalized without thousands separators
  (`"1234.00"`).
- Privacy: fixture bodies must not contain real personal data — replace names,
  phone numbers, and full account numbers with realistic stand-ins.

## Catalog / app consumption

`index.json` at the repo root is the machine-readable catalog: one entry per
bank with `pluginId`, `name`, `country`, `currency`, `version`, the manifest
`file` path, its `sha256` (hex of the raw file bytes), and `bytes`. CI
regenerates it on every push to `main`
(`.github/workflows/catalog.yml` → `bun scripts/generate-catalog.ts`) after
full validation; don't edit it by hand.

The Unmiser app consumes the store over the jsDelivr CDN:

1. Fetch the catalog to populate the browse list:
   `https://cdn.jsdelivr.net/gh/Vijayabaskar56/unmiser-extensions@main/index.json`
2. On install, fetch only the chosen bundle:
   `https://cdn.jsdelivr.net/gh/Vijayabaskar56/unmiser-extensions@main/manifests/<file>`
3. The app re-hashes the downloaded body and rejects on `sha256` mismatch
   (checksum verified client-side). The catalog's top-level `signature` field
   is reserved and currently `null` — manifest signing is deferred.

## How validation works

`src/` vendors the Unmiser parser engine (source of truth lives in the app
repo at `lib/parser/`). `scripts/validate-all.ts` schema-checks every bundle
with zod, then runs every fixture through the real engine — exactly what the
app does at runtime.
