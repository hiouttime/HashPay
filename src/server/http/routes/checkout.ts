import { Hono } from "hono";
import { checkoutData, getOrder, publicOrder, selectOrderPayment, submitTxCandidates } from "@/server/services/orders/service";
import type { AppEnv, AppVariables } from "@/shared/types/env";

export function createCheckoutRoutes() {
  const app = new Hono<{ Bindings: AppEnv; Variables: AppVariables }>();
  app.get("/:id", async (c) => c.json(await checkoutData(c.env, c.req.param("id"))));
  app.post("/:id/payment", async (c) => {
    const body = (await c.req.json()) as { currency?: string; payway?: number };
    return c.json(await selectOrderPayment(c.env, c.req.param("id"), Number(body.payway), String(body.currency ?? "")));
  });
  app.get("/:id/status", async (c) => c.json(publicOrder(await getOrder(c.env, c.req.param("id")))));
  app.post("/:id/tx-candidates", async (c) => c.json(await submitTxCandidates(c.env, c.req.param("id"), await c.req.json())));
  return app;
}
