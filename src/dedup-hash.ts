import Decimal from "decimal.js";
import { md5 } from "js-md5";

export interface TransactionHashInput {
  sender: string;
  amount: string;
  body: string;
}

function normalizedAmount(amount: string): string {
  return new Decimal(amount).toFixed(2);
}

export function transactionHash(input: TransactionHashInput): string {
  const smsBodyHash = md5(input.body).slice(0, 16);
  const canonical = `${input.sender}|${normalizedAmount(input.amount)}|${smsBodyHash}`;
  return md5(canonical);
}
