import type { TransactionType } from "./enums";

export const PARSER_CONFIDENCE = ["HIGH", "REVIEW", "REJECTED"] as const;
export type ParserConfidence = (typeof PARSER_CONFIDENCE)[number];

export const PARSER_REASONS = [
  "NO_MATCHING_MANIFEST",
  "FILTER_REJECTED",
  "MANDATE_DETECTED",
  "MISSING_AMOUNT",
  "MISSING_TYPE",
  "MISSING_MERCHANT",
  "AMBIGUOUS_FIELD",
  "PIPELINE_REJECTED",
] as const;
export type ParserReason = (typeof PARSER_REASONS)[number];

export interface SmsInput {
  sender: string;
  body: string;
  receivedAt: string;
}

export interface ExtractorSpec {
  re: string;
  flags?: string;
  group?: string | number;
  takeLast4?: boolean;
}

export type ExtractField =
  | "amount"
  | "merchant"
  | "balance"
  | "reference"
  | "accountLast4"
  | "creditLimit";

export type ParsedField = ExtractField | "transactionType" | "isFromCard";

export interface ParserCondition {
  containsAny?: string[];
  containsAll?: string[];
  notContainsAny?: string[];
  senderContainsAny?: string[];
}

export type PipelineStep =
  | {
      kind: "rejectWhen";
      when: ParserCondition;
      reason?: ParserReason;
    }
  | {
      kind: "extractFieldWhen";
      when: ParserCondition;
      field: ExtractField;
      extractors: ExtractorSpec[];
    }
  | {
      kind: "setFieldWhen";
      when: ParserCondition;
      field: ParsedField;
      value: string | boolean;
    }
  | {
      kind: "fallbackField";
      field: ParsedField;
      value: string | boolean;
    }
  | {
      kind: "confidenceWhen";
      when: ParserCondition;
      confidence: ParserConfidence;
      reason?: ParserReason;
    };

export interface SmsParserManifest {
  schemaVersion: "1.0";
  pluginId: string;
  type: "sms-parser";
  name: string;
  country: string;
  currency: string;
  version: string;
  trust: "bundled" | "owner" | "community";
  dispatch: {
    senders?: string[];
    dltPatterns?: string[];
  };
  filter?: {
    excludeKeywords?: string[];
    requireAnyKeyword?: string[];
  };
  extract: Partial<Record<ExtractField, ExtractorSpec[]>>;
  typeRules?: Partial<Record<Lowercase<TransactionType>, string[]>>;
  cardRules?: {
    includeKeywords?: string[];
    excludeKeywords?: string[];
  };
  cleaning?: {
    stripPatterns?: string[];
    minMerchantLength?: number;
    commonWords?: string[];
  };
  mandate?: {
    detectKeyword: string;
    amount: string;
    date: string;
    merchant: string;
    umn?: string;
    dateFormat: string;
  };
  pipeline?: PipelineStep[];
}

export interface RawMatch {
  field: ParsedField;
  pattern: string;
  value: string | boolean;
}

export interface ParsedSmsFields {
  amount?: string;
  transactionType?: TransactionType;
  merchant?: string;
  reference?: string;
  accountLast4?: string;
  balance?: string;
  creditLimit?: string;
  currency: string;
  bankName: string;
  isFromCard: boolean;
  transactionHash?: string;
}

export interface MandateRaw {
  amount?: string;
  date?: string;
  merchant?: string;
  umn?: string;
  dateFormat: string;
}

export interface MandateInfo {
  amount: string;
  nextDeductionDate: string;
  merchant: string;
  umn?: string;
  currency: string;
  pluginId: string;
  provider: string;
}

export interface ParserResult {
  confidence: ParserConfidence;
  reasons: ParserReason[];
  matchedManifest?: {
    pluginId: string;
    version: string;
    name: string;
    currency: string;
  };
  fields?: ParsedSmsFields;
  mandateRaw?: MandateRaw;
  mandate?: MandateInfo;
  mandateParseFailed?: {
    reasons: string[];
  };
  rawMatches: RawMatch[];
}

export interface ManifestFixture {
  name: string;
  sender: string;
  body: string;
  receivedAt: string;
  expected: {
    confidence: ParserConfidence;
    fields?: Partial<ParsedSmsFields>;
    mandate?: Partial<MandateInfo>;
    mandateParseFailed?: boolean;
    reasons?: ParserReason[];
  };
}

export interface ManifestWithFixtures {
  manifest: SmsParserManifest;
  fixtures: ManifestFixture[];
}
