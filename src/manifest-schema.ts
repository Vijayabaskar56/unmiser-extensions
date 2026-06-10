import { z } from "zod";

import { TRANSACTION_TYPES } from "./enums";
import { PARSER_CONFIDENCE, PARSER_REASONS } from "./types";

const extractorSchema = z.object({
  re: z.string().min(1),
  flags: z.string().optional(),
  group: z.union([z.string(), z.number()]).optional(),
  takeLast4: z.boolean().optional(),
});

const conditionSchema = z.object({
  containsAny: z.array(z.string()).optional(),
  containsAll: z.array(z.string()).optional(),
  notContainsAny: z.array(z.string()).optional(),
  senderContainsAny: z.array(z.string()).optional(),
});

const extractFieldSchema = z.enum([
  "amount",
  "merchant",
  "balance",
  "reference",
  "accountLast4",
  "creditLimit",
]);

const parsedFieldSchema = z.union([extractFieldSchema, z.enum(["transactionType", "isFromCard"])]);

const pipelineStepSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rejectWhen"),
    when: conditionSchema,
    reason: z.enum(PARSER_REASONS).optional(),
  }),
  z.object({
    kind: z.literal("extractFieldWhen"),
    when: conditionSchema,
    field: extractFieldSchema,
    extractors: z.array(extractorSchema).min(1),
  }),
  z.object({
    kind: z.literal("setFieldWhen"),
    when: conditionSchema,
    field: parsedFieldSchema,
    value: z.union([z.string(), z.boolean()]),
  }),
  z.object({
    kind: z.literal("fallbackField"),
    field: parsedFieldSchema,
    value: z.union([z.string(), z.boolean()]),
  }),
  z.object({
    kind: z.literal("confidenceWhen"),
    when: conditionSchema,
    confidence: z.enum(PARSER_CONFIDENCE),
    reason: z.enum(PARSER_REASONS).optional(),
  }),
]);

export const smsParserManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  pluginId: z.string().min(3),
  type: z.literal("sms-parser"),
  name: z.string().min(1),
  country: z.string().length(2),
  currency: z.string().length(3),
  version: z.string().min(1),
  trust: z.enum(["bundled", "owner", "community"]),
  dispatch: z.object({
    senders: z.array(z.string()).optional(),
    dltPatterns: z.array(z.string()).optional(),
  }),
  filter: z
    .object({
      excludeKeywords: z.array(z.string()).optional(),
      requireAnyKeyword: z.array(z.string()).optional(),
    })
    .optional(),
  extract: z.object({
    amount: z.array(extractorSchema).optional(),
    merchant: z.array(extractorSchema).optional(),
    balance: z.array(extractorSchema).optional(),
    reference: z.array(extractorSchema).optional(),
    accountLast4: z.array(extractorSchema).optional(),
    creditLimit: z.array(extractorSchema).optional(),
  }),
  typeRules: z
    .object(
      Object.fromEntries(
        TRANSACTION_TYPES.map((type) => [type.toLowerCase(), z.array(z.string()).optional()]),
      ),
    )
    .partial()
    .optional(),
  cardRules: z
    .object({
      includeKeywords: z.array(z.string()).optional(),
      excludeKeywords: z.array(z.string()).optional(),
    })
    .optional(),
  cleaning: z
    .object({
      stripPatterns: z.array(z.string()).optional(),
      minMerchantLength: z.number().int().positive().optional(),
      commonWords: z.array(z.string()).optional(),
    })
    .optional(),
  pipeline: z.array(pipelineStepSchema).optional(),
});

export type SmsParserManifestInput = z.input<typeof smsParserManifestSchema>;

// Parsed-field assertions a fixture can make (subset of ParsedSmsFields that
// authors control; currency/bankName/isFromCard/transactionHash are derived).
const fixtureFieldsSchema = z
  .object({
    amount: z.string(),
    merchant: z.string(),
    balance: z.string(),
    reference: z.string(),
    accountLast4: z.string(),
    creditLimit: z.string(),
    currency: z.string(),
    bankName: z.string(),
    transactionType: z.enum(TRANSACTION_TYPES),
    isFromCard: z.boolean(),
  })
  .partial();

export const manifestFixtureSchema = z.object({
  name: z.string().min(1),
  sender: z.string().min(1),
  body: z.string().min(1),
  receivedAt: z.string().min(1),
  expected: z.object({
    confidence: z.enum(PARSER_CONFIDENCE),
    fields: fixtureFieldsSchema.optional(),
    reasons: z.array(z.enum(PARSER_REASONS)).optional(),
  }),
});

/**
 * The authorable plugin file: a manifest plus the fixtures that prove it.
 * This is what ships as lib/parser/manifests/<bank>.json — and what a
 * community author writes, with `$schema` pointing at the generated
 * lib/parser/manifest.schema.json for editor validation.
 */
export const manifestBundleSchema = z.object({
  $schema: z.string().optional(),
  notes: z.array(z.string()).optional(),
  manifest: smsParserManifestSchema,
  fixtures: z.array(manifestFixtureSchema).min(1),
});
