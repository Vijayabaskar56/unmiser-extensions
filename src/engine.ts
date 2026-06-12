import type { TransactionType } from "./enums";
import { transactionHash } from "./dedup-hash";
import { smsParserManifestSchema } from "./manifest-schema";
import type {
  ExtractField,
  ExtractorSpec,
  MandateRaw,
  ParsedField,
  ParsedSmsFields,
  ParserCondition,
  ParserReason,
  ParserResult,
  PipelineStep,
  RawMatch,
  SmsInput,
  SmsParserManifest,
} from "./types";
import { format as formatDate, isValid, parse as parseDate } from "date-fns";

const DEFAULT_COMMON_WORDS = new Set([
  "USING",
  "VIA",
  "THROUGH",
  "BY",
  "WITH",
  "FOR",
  "TO",
  "FROM",
  "AT",
  "THE",
]);

const TYPE_PRIORITY: Array<[Lowercase<TransactionType>, TransactionType]> = [
  ["investment", "INVESTMENT"],
  ["credit", "CREDIT"],
  ["expense", "EXPENSE"],
  ["income", "INCOME"],
  ["transfer", "TRANSFER"],
];

/**
 * Validate manifests once, outside the per-message hot path. Worklet-compat:
 * zod cannot run on a background worklet runtime, so callers that parse off
 * the RN runtime must prepare manifests here (RN-side) and hand the plain
 * validated objects to `parsePreparedSms*`.
 */
export function prepareManifests(manifests: SmsParserManifest[]): SmsParserManifest[] {
  return manifests.map((manifest) => smsParserManifestSchema.parse(manifest));
}

/**
 * Worklet-compat: `transactionHash` depends on js-md5 + decimal.js, which are
 * not workletizable, so hashing runs RN-side after a prepared parse returns
 * from the worklet runtime. `parseSmsWithManifest` composes this for the
 * single-runtime path, keeping behavior identical to the pre-split engine.
 */
export function attachTransactionHash(result: ParserResult, input: SmsInput): ParserResult {
  if (result.fields?.amount !== undefined) {
    result.fields.transactionHash = transactionHash({
      sender: input.sender,
      amount: result.fields.amount,
      body: input.body,
    });
  }
  return result;
}

export function attachMandateInfo(result: ParserResult): ParserResult {
  if (!result.mandateRaw || !result.matchedManifest) return result;

  const reasons: string[] = [];
  const raw = result.mandateRaw;
  if (!raw.amount) reasons.push("missing_amount");
  if (!raw.date) reasons.push("missing_date");
  if (!raw.merchant) reasons.push("missing_merchant");

  let nextDeductionDate: string | undefined;
  if (raw.date) {
    const parsed = parseDate(raw.date, raw.dateFormat, new Date());
    if (isValid(parsed)) nextDeductionDate = formatDate(parsed, "yyyy-MM-dd");
    else reasons.push("invalid_date");
  }

  if (reasons.length > 0 || !raw.amount || !raw.merchant || !nextDeductionDate) {
    result.confidence = "REVIEW";
    result.mandateParseFailed = { reasons };
    return result;
  }

  result.mandate = {
    amount: raw.amount.replaceAll(",", ""),
    nextDeductionDate,
    merchant: raw.merchant,
    umn: raw.umn,
    currency: result.matchedManifest.currency,
    pluginId: result.matchedManifest.pluginId,
    provider: result.matchedManifest.name,
  };
  return result;
}

export function parseSmsWithManifest(
  manifestInput: SmsParserManifest,
  input: SmsInput,
): ParserResult {
  const manifest = smsParserManifestSchema.parse(manifestInput);
  return attachMandateInfo(attachTransactionHash(parsePreparedSms(manifest, input), input));
}

export function parseSmsWithManifests(
  manifests: SmsParserManifest[],
  input: SmsInput,
): ParserResult {
  for (const manifest of manifests) {
    const result = parseSmsWithManifest(manifest, input);
    if (!result.reasons.includes("NO_MATCHING_MANIFEST")) return result;
  }
  return rejected(["NO_MATCHING_MANIFEST"], []);
}

function resultFor(
  manifest: SmsParserManifest,
  confidence: ParserResult["confidence"],
  reasons: ParserReason[],
  fields: ParsedSmsFields | undefined,
  rawMatches: RawMatch[],
  mandateRaw?: MandateRaw,
): ParserResult {
  "worklet";
  return {
    confidence,
    reasons,
    matchedManifest: {
      pluginId: manifest.pluginId,
      version: manifest.version,
      name: manifest.name,
      currency: manifest.currency,
    },
    fields,
    mandateRaw,
    rawMatches,
  };
}

function rejected(reasons: ParserReason[], rawMatches: RawMatch[]): ParserResult {
  "worklet";
  return {
    confidence: "REJECTED",
    reasons,
    rawMatches,
  };
}

function matchesDispatch(manifest: SmsParserManifest, sender: string): boolean {
  "worklet";
  const upperSender = sender.toUpperCase();
  const direct = manifest.dispatch.senders?.some(
    (candidate) => candidate.toUpperCase() === upperSender,
  );
  if (direct) return true;
  return (
    manifest.dispatch.dltPatterns?.some((pattern) => new RegExp(pattern, "i").test(sender)) ?? false
  );
}

function passesFilter(manifest: SmsParserManifest, body: string): boolean {
  "worklet";
  const lowerBody = body.toLowerCase();
  const excludes = manifest.filter?.excludeKeywords ?? [];
  if (excludes.some((keyword) => lowerBody.includes(keyword.toLowerCase()))) return false;

  const required = manifest.filter?.requireAnyKeyword ?? [];
  if (required.length === 0) return true;
  return required.some((keyword) => lowerBody.includes(keyword.toLowerCase()));
}

function classify(manifest: SmsParserManifest, body: string): TransactionType | undefined {
  "worklet";
  const lowerBody = body.toLowerCase();
  for (const [key, type] of TYPE_PRIORITY) {
    const keywords = manifest.typeRules?.[key] ?? [];
    if (keywords.some((keyword) => lowerBody.includes(keyword.toLowerCase()))) return type;
  }
  return undefined;
}

function detectCard(manifest: SmsParserManifest, body: string): boolean {
  "worklet";
  const lowerBody = body.toLowerCase();
  const excludes = manifest.cardRules?.excludeKeywords ?? ["a/c", "account", "saving account"];
  if (excludes.some((keyword) => lowerBody.includes(keyword.toLowerCase()))) return false;
  const includes = manifest.cardRules?.includeKeywords ?? [
    "card ending",
    "debit card",
    "credit card",
    "card xx",
  ];
  return includes.some((keyword) => lowerBody.includes(keyword.toLowerCase()));
}

function conditionMatches(condition: ParserCondition, input: SmsInput): boolean {
  "worklet";
  const lowerBody = input.body.toLowerCase();
  const lowerSender = input.sender.toLowerCase();
  if (condition.containsAny?.length) {
    const matched = condition.containsAny.some((keyword) =>
      lowerBody.includes(keyword.toLowerCase()),
    );
    if (!matched) return false;
  }
  if (condition.containsAll?.length) {
    const matched = condition.containsAll.every((keyword) =>
      lowerBody.includes(keyword.toLowerCase()),
    );
    if (!matched) return false;
  }
  if (condition.notContainsAny?.length) {
    const matched = condition.notContainsAny.some((keyword) =>
      lowerBody.includes(keyword.toLowerCase()),
    );
    if (matched) return false;
  }
  if (condition.senderContainsAny?.length) {
    const matched = condition.senderContainsAny.some((keyword) =>
      lowerSender.includes(keyword.toLowerCase()),
    );
    if (!matched) return false;
  }
  return true;
}

function cleanMerchantName(value: string, manifest: SmsParserManifest): string {
  "worklet";
  let cleaned = value.trim();
  for (const pattern of manifest.cleaning?.stripPatterns ?? []) {
    cleaned = cleaned.replace(new RegExp(pattern, "gi"), "");
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

function isTransactionType(value: string): value is TransactionType {
  "worklet";
  return (
    value === "INCOME" ||
    value === "EXPENSE" ||
    value === "CREDIT" ||
    value === "TRANSFER" ||
    value === "INVESTMENT"
  );
}

function takeLast4(value: string): string {
  "worklet";
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? digits.slice(-4) : digits;
}

function uniqueReasons(reasons: ParserReason[]): ParserReason[] {
  "worklet";
  return [...new Set(reasons)];
}

function extractNamedValue(body: string, pattern: string): string | undefined {
  "worklet";
  const match = new RegExp(pattern, "i").exec(body);
  return match?.groups?.value?.trim() ?? match?.[1]?.trim();
}

function extractMandateRaw(manifest: SmsParserManifest, body: string): MandateRaw | undefined {
  "worklet";
  if (!manifest.mandate) return undefined;
  if (!body.toLowerCase().includes(manifest.mandate.detectKeyword.toLowerCase())) {
    return undefined;
  }

  return {
    amount: extractNamedValue(body, manifest.mandate.amount)?.replaceAll(",", ""),
    date: extractNamedValue(body, manifest.mandate.date),
    merchant: extractNamedValue(body, manifest.mandate.merchant),
    umn: manifest.mandate.umn ? extractNamedValue(body, manifest.mandate.umn) : undefined,
    dateFormat: manifest.mandate.dateFormat,
  };
}

// NOTE (worklet ordering): functions carrying a "worklet" directive are NOT
// hoisted — the worklets babel plugin rewrites them into non-hoisted bindings
// whose closures are captured at the DEFINITION point. A worklet that calls a
// helper defined later in the file captures `undefined` and crashes at parse
// time on-device ("undefined is not a function" — invisible to vitest, which
// runs untransformed code). Everything below is therefore in strict
// topological order: leaf worklets above, then these mid-tier helpers, then
// the parse cores last. Do not reorder.

function extractFirst(
  body: string,
  extractors: ExtractorSpec[],
  field: ParsedField,
  rawMatches: RawMatch[],
): string | undefined {
  "worklet";
  for (const extractor of extractors) {
    const regex = new RegExp(extractor.re, extractor.flags ?? "i");
    const match = regex.exec(body);
    if (!match) continue;

    const rawValue =
      typeof extractor.group === "number"
        ? match[extractor.group]
        : (match.groups?.[extractor.group ?? "value"] ?? match[1]);
    if (rawValue === undefined) continue;

    const value = extractor.takeLast4 ? takeLast4(rawValue) : rawValue.trim();
    if (!value) continue;
    rawMatches.push({ field, pattern: extractor.re, value });
    return value;
  }
  return undefined;
}

function normalizeExtractedValue(
  field: ExtractField,
  value: string,
  manifest: SmsParserManifest,
): string {
  "worklet";
  if (field === "amount" || field === "balance" || field === "creditLimit") {
    return value.replaceAll(",", "");
  }
  if (field === "accountLast4") return takeLast4(value);
  if (field === "merchant") return cleanMerchantName(value, manifest);
  return value.trim();
}

function assignField(fields: ParsedSmsFields, field: ParsedField, value: string | boolean): void {
  "worklet";
  if (field === "isFromCard" && typeof value === "boolean") {
    fields.isFromCard = value;
    return;
  }
  if (field === "transactionType" && typeof value === "string" && isTransactionType(value)) {
    fields.transactionType = value;
    return;
  }
  if (typeof value !== "string") return;
  if (field === "amount") fields.amount = value;
  if (field === "merchant") fields.merchant = value;
  if (field === "balance") fields.balance = value;
  if (field === "reference") fields.reference = value;
  if (field === "accountLast4") fields.accountLast4 = value;
  if (field === "creditLimit") fields.creditLimit = value;
}

function applyPipeline(
  steps: PipelineStep[],
  manifest: SmsParserManifest,
  input: SmsInput,
  fields: ParsedSmsFields,
  rawMatches: RawMatch[],
  reasons: ParserReason[],
): void {
  "worklet";
  for (const step of steps) {
    if (step.kind === "fallbackField") {
      const current = fields[step.field as keyof ParsedSmsFields];
      if (current === undefined || current === "") assignField(fields, step.field, step.value);
      continue;
    }

    if (!conditionMatches(step.when, input)) continue;

    if (step.kind === "rejectWhen") {
      reasons.push(step.reason ?? "PIPELINE_REJECTED");
      continue;
    }
    if (step.kind === "extractFieldWhen") {
      const value = extractFirst(input.body, step.extractors, step.field, rawMatches);
      if (value !== undefined)
        assignField(fields, step.field, normalizeExtractedValue(step.field, value, manifest));
      continue;
    }
    if (step.kind === "setFieldWhen") {
      assignField(fields, step.field, step.value);
      rawMatches.push({ field: step.field, pattern: "pipeline", value: step.value });
      continue;
    }
    if (step.kind === "confidenceWhen" && step.reason !== undefined) {
      reasons.push(step.reason);
    }
  }
}

/**
 * The zod-free, hash-free parse core. Safe to call on a background worklet
 * runtime (every helper above carries a `worklet` directive); `manifest` MUST
 * already be validated via `prepareManifests`. `fields.transactionHash` is
 * left unset — attach it RN-side with `attachTransactionHash`. Defined AFTER
 * every worklet helper it calls (see worklet-ordering note above).
 */
export function parsePreparedSms(manifest: SmsParserManifest, input: SmsInput): ParserResult {
  "worklet";
  const rawMatches: RawMatch[] = [];

  if (!matchesDispatch(manifest, input.sender)) {
    return rejected(["NO_MATCHING_MANIFEST"], rawMatches);
  }

  const mandateRaw = extractMandateRaw(manifest, input.body);
  if (mandateRaw) {
    return resultFor(manifest, "HIGH", ["MANDATE_DETECTED"], undefined, rawMatches, mandateRaw);
  }

  if (!passesFilter(manifest, input.body)) {
    return resultFor(manifest, "REJECTED", ["FILTER_REJECTED"], undefined, rawMatches);
  }

  const fields: ParsedSmsFields = {
    currency: manifest.currency,
    bankName: manifest.name,
    isFromCard: detectCard(manifest, input.body),
  };
  const reasons: ParserReason[] = [];

  for (const field of Object.keys(manifest.extract) as ExtractField[]) {
    const value = extractFirst(input.body, manifest.extract[field] ?? [], field, rawMatches);
    if (value !== undefined)
      assignField(fields, field, normalizeExtractedValue(field, value, manifest));
  }

  applyPipeline(manifest.pipeline ?? [], manifest, input, fields, rawMatches, reasons);

  if (fields.transactionType === undefined) {
    fields.transactionType = classify(manifest, input.body);
    if (fields.transactionType !== undefined) {
      rawMatches.push({
        field: "transactionType",
        pattern: "typeRules",
        value: fields.transactionType,
      });
    }
  }

  if (fields.amount === undefined) reasons.push("MISSING_AMOUNT");
  if (fields.transactionType === undefined) reasons.push("MISSING_TYPE");
  if (fields.merchant === undefined && fields.transactionType !== "TRANSFER") {
    reasons.push("MISSING_MERCHANT");
  }

  const confidence = reasons.length === 0 ? "HIGH" : "REVIEW";
  return resultFor(manifest, confidence, uniqueReasons(reasons), fields, rawMatches);
}

/** Worklet-safe multi-manifest parse over `prepareManifests` output. */
export function parsePreparedSmsWithManifests(
  manifests: SmsParserManifest[],
  input: SmsInput,
): ParserResult {
  "worklet";
  for (const manifest of manifests) {
    const result = parsePreparedSms(manifest, input);
    if (!result.reasons.includes("NO_MATCHING_MANIFEST")) return result;
  }
  return rejected(["NO_MATCHING_MANIFEST"], []);
}

export function isValidMerchantName(manifest: SmsParserManifest, merchant: string): boolean {
  const cleaned = cleanMerchantName(merchant, manifest);
  const commonWords = new Set([
    ...DEFAULT_COMMON_WORDS,
    ...(manifest.cleaning?.commonWords ?? []).map((word) => word.toUpperCase()),
  ]);
  return (
    cleaned.length >= (manifest.cleaning?.minMerchantLength ?? 2) &&
    /[a-z]/i.test(cleaned) &&
    !/^\d+$/.test(cleaned) &&
    !cleaned.includes("@") &&
    !commonWords.has(cleaned.toUpperCase())
  );
}
