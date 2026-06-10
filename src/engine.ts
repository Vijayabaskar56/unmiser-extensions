import type { TransactionType } from "./enums";
import { transactionHash } from "./dedup-hash";
import { smsParserManifestSchema } from "./manifest-schema";
import type {
  ExtractField,
  ExtractorSpec,
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

export function parseSmsWithManifest(
  manifestInput: SmsParserManifest,
  input: SmsInput,
): ParserResult {
  const manifest = smsParserManifestSchema.parse(manifestInput);
  const rawMatches: RawMatch[] = [];

  if (!matchesDispatch(manifest, input.sender)) {
    return rejected(["NO_MATCHING_MANIFEST"], rawMatches);
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

  if (fields.amount !== undefined) {
    fields.transactionHash = transactionHash({
      sender: input.sender,
      amount: fields.amount,
      body: input.body,
    });
  }

  const confidence = reasons.length === 0 ? "HIGH" : "REVIEW";
  return resultFor(manifest, confidence, uniqueReasons(reasons), fields, rawMatches);
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
): ParserResult {
  return {
    confidence,
    reasons,
    matchedManifest: {
      pluginId: manifest.pluginId,
      version: manifest.version,
      name: manifest.name,
    },
    fields,
    rawMatches,
  };
}

function rejected(reasons: ParserReason[], rawMatches: RawMatch[]): ParserResult {
  return {
    confidence: "REJECTED",
    reasons,
    rawMatches,
  };
}

function matchesDispatch(manifest: SmsParserManifest, sender: string): boolean {
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
  const lowerBody = body.toLowerCase();
  const excludes = manifest.filter?.excludeKeywords ?? [];
  if (excludes.some((keyword) => lowerBody.includes(keyword.toLowerCase()))) return false;

  const required = manifest.filter?.requireAnyKeyword ?? [];
  if (required.length === 0) return true;
  return required.some((keyword) => lowerBody.includes(keyword.toLowerCase()));
}

function extractFirst(
  body: string,
  extractors: ExtractorSpec[],
  field: ParsedField,
  rawMatches: RawMatch[],
): string | undefined {
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
  if (field === "amount" || field === "balance" || field === "creditLimit") {
    return value.replaceAll(",", "");
  }
  if (field === "accountLast4") return takeLast4(value);
  if (field === "merchant") return cleanMerchantName(value, manifest);
  return value.trim();
}

function assignField(fields: ParsedSmsFields, field: ParsedField, value: string | boolean): void {
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

function classify(manifest: SmsParserManifest, body: string): TransactionType | undefined {
  const lowerBody = body.toLowerCase();
  for (const [key, type] of TYPE_PRIORITY) {
    const keywords = manifest.typeRules?.[key] ?? [];
    if (keywords.some((keyword) => lowerBody.includes(keyword.toLowerCase()))) return type;
  }
  return undefined;
}

function detectCard(manifest: SmsParserManifest, body: string): boolean {
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

function applyPipeline(
  steps: PipelineStep[],
  manifest: SmsParserManifest,
  input: SmsInput,
  fields: ParsedSmsFields,
  rawMatches: RawMatch[],
  reasons: ParserReason[],
): void {
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

function conditionMatches(condition: ParserCondition, input: SmsInput): boolean {
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
  let cleaned = value.trim();
  for (const pattern of manifest.cleaning?.stripPatterns ?? []) {
    cleaned = cleaned.replace(new RegExp(pattern, "gi"), "");
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

function isTransactionType(value: string): value is TransactionType {
  return (
    value === "INCOME" ||
    value === "EXPENSE" ||
    value === "CREDIT" ||
    value === "TRANSFER" ||
    value === "INVESTMENT"
  );
}

function takeLast4(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? digits.slice(-4) : digits;
}

function uniqueReasons(reasons: ParserReason[]): ParserReason[] {
  return [...new Set(reasons)];
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
