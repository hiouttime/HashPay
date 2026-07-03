export type OrderStatus = "pending" | "paid" | "expired" | "invalid";
export type NotifyStatus = "pending" | "done" | "retry" | "failed";

export interface PaymentSnapshot {
  address?: string;
  amount: number;
  currency: string;
  currencyName: string;
  driver: string;
  network: string;
  networkName?: string;
  review?: PaymentReviewEvidence;
  tx?: PaymentTxEvidence;
}

export interface PaymentReviewEvidence {
  answer: string;
  image: string;
  status: "pending";
  submittedAt: number;
}

export interface PaymentTxEvidence {
  confirmedBy: "system" | "admin";
  timestamp: number;
  txid?: string;
}
