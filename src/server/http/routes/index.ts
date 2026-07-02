import { Hono } from "hono";
import admin from "@/server/http/routes/admin";
import auth from "@/server/http/routes/auth";
import publicRoutes from "@/server/http/routes/public";
import type { HonoEnv } from "@/shared/types/env";

const app = new Hono<HonoEnv>();

app.route("/", publicRoutes);
app.route("/api", auth);
app.route("/api/admin", admin);

export default app;
