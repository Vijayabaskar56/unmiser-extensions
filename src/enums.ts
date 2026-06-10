// String enums, mirroring the Kotlin enums stored as TEXT (value === enum name)
// by Room's TypeConverters.

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "CREDIT", "TRANSFER", "INVESTMENT"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_SOURCES = ["MANUAL", "SMS", "IMPORT", "API_SOURCE"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const EXTENSION_TYPES = ["sms-parser", "rule"] as const;
export type ExtensionType = (typeof EXTENSION_TYPES)[number];

export const EXTENSION_TRUST_TIERS = ["bundled", "owner", "community"] as const;
export type ExtensionTrustTier = (typeof EXTENSION_TRUST_TIERS)[number];

export const SMS_REVIEW_STATUSES = [
  "UNRECOGNIZED",
  "ACCOUNT_RESOLUTION_REQUIRED",
  "LOW_CONFIDENCE",
  "DUPLICATE_SKIPPED",
  "REJECTED",
] as const;
export type SmsReviewStatus = (typeof SMS_REVIEW_STATUSES)[number];

export const SMS_REVIEW_REASONS = [
  "NO_PARSER",
  "FILTER_REJECTED",
  "UNKNOWN_ACCOUNT_LAST4",
  "AMBIGUOUS_MERCHANT",
  "MISSING_AMOUNT",
  "MISSING_TYPE",
  "MISSING_MERCHANT",
  "PIPELINE_REJECTED",
] as const;
export type SmsReviewReason = (typeof SMS_REVIEW_REASONS)[number];

export const SUBSCRIPTION_STATES = ["ACTIVE", "HIDDEN"] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export const CARD_TYPES = ["DEBIT", "CREDIT"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const BUDGET_PERIODS = ["CUSTOM", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const BUDGET_TRACK_TYPES = ["ADDED_ONLY", "ALL_TRANSACTIONS"] as const;
export type BudgetTrackType = (typeof BUDGET_TRACK_TYPES)[number];

export const BUDGET_TYPES = ["EXPENSE", "SAVINGS"] as const;
export type BudgetType = (typeof BUDGET_TYPES)[number];

export const WEBHOOK_DATA_TYPES = [
  "SUMMARY",
  "TRANSACTIONS",
  "BUDGETS",
  "ACCOUNTS",
  "SUBSCRIPTIONS",
] as const;
export type WebhookDataType = (typeof WEBHOOK_DATA_TYPES)[number];

export const WEBHOOK_LOG_STATUSES = ["SUCCESS", "FAILURE"] as const;
export type WebhookLogStatus = (typeof WEBHOOK_LOG_STATUSES)[number];

export const WEBHOOK_RANGE_PRESETS = [
  "SINCE_LAST_SUCCESS",
  "TODAY",
  "CURRENT_WEEK",
  "CURRENT_MONTH",
  "PREVIOUS_MONTH",
  "LAST_30_DAYS",
  "CUSTOM",
] as const;
export type WebhookRangePreset = (typeof WEBHOOK_RANGE_PRESETS)[number];

export const WEBHOOK_SYNC_REASONS = ["MANUAL", "INTERVAL", "SCHEDULED", "TEST"] as const;
export type WebhookSyncReason = (typeof WEBHOOK_SYNC_REASONS)[number];
