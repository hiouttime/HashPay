import type { PaymentCheckMatch, PaymentCheckOrder } from "@/server/payments/driver";
import { fitAmount, sameAmount, type AmountTolerance } from "@/shared/amount";
import type { PaymentSnapshot } from "@/shared/types/domain";

type Hit<T> = { amount: number; exact: boolean; orderId: string; row: T; txid: string };

export function paymentMatches<T>(
  orders: PaymentCheckOrder[],
  rows: T[],
  match: (snapshot: PaymentSnapshot, row: T, createdAt: number, expireAt: number) => number | null,
  evidence: (row: T) => Omit<PaymentCheckMatch, "amount" | "orderId">,
  tolerance?: AmountTolerance | null,
) {
  const hits: Hit<T>[] = [];
  for (const order of orders) {
    for (const row of rows) {
      const observed = match(order.snapshot, row, order.createdAt, order.expireAt);
      const amount = observed == null ? null : fitAmount(observed, order.snapshot.amount, tolerance);
      if (amount == null) continue;
      const txid = String(evidence(row).txid ?? "").trim();
      if (!txid || hits.some((hit) => hit.orderId === order.id && hit.txid === txid)) continue;
      hits.push({ amount, exact: sameAmount(amount, order.snapshot.amount), orderId: order.id, row, txid });
    }
  }

  const used = new Set<string>();
  const matched = new Set<string>();
  const result: PaymentCheckMatch[] = [];
  const claim = (hit: Hit<T>) => {
    used.add(hit.txid);
    matched.add(hit.orderId);
    result.push({ amount: hit.amount, orderId: hit.orderId, ...evidence(hit.row) });
  };
  for (const order of orders) {
    const exact = hits.find((hit) => hit.orderId === order.id && hit.exact && !used.has(hit.txid));
    if (exact) claim(exact);
  }

  const ranged = hits.filter((hit) => !hit.exact && !matched.has(hit.orderId) && !used.has(hit.txid));
  const ordersForTx = new Map<string, Set<string>>();
  const txsForOrder = new Map<string, Set<string>>();
  for (const hit of ranged) {
    ordersForTx.set(hit.txid, (ordersForTx.get(hit.txid) ?? new Set()).add(hit.orderId));
    txsForOrder.set(hit.orderId, (txsForOrder.get(hit.orderId) ?? new Set()).add(hit.txid));
  }
  for (const hit of ranged) {
    if (txsForOrder.get(hit.orderId)?.size === 1 && ordersForTx.get(hit.txid)?.size === 1) claim(hit);
  }
  return result;
}
