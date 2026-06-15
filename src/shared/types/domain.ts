export type OrderStatus = "pending" | "paid" | "expired" | "invalid";
export type NotifyStatus = "pending" | "done" | "retry" | "failed";

export interface PaymentSnapshot {
  account?: string;
  address?: string;
  amount: number;
  currency: string;
  driver: string;
  instructions?: string;
  memo?: string;
  network: string;
  tx?: PaymentTxEvidence;
}

export interface PaymentTxEvidence {
  amount: number;
  confirmedBy: "frontend" | "cron" | "button" | "admin";
  currency: string;
  from?: string;
  hash: string;
  raw?: unknown;
  timestamp: number;
  to?: string;
}

export interface PaymentField {
  help?: string;
  key: string;
  label: string;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  type: "text" | "textarea" | "select";
}

export interface PaymentDriverMeta {
  canAutoCheck: boolean;
  currencies: string[];
  description: string;
  id: string;
  kind: "chain" | "exchange";
  name: string;
  networks: string[];
}
