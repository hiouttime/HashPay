import { createApp } from "@/server/http/app";
import { handleNotifyQueue, runScheduledJobs } from "@/server/services/jobs/service";
import type { AppEnv } from "@/shared/types/env";

const app = createApp();

export default {
  fetch(request: Request, env: AppEnv, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: AppEnv, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledJobs(env));
  },
  async queue(batch: MessageBatch<unknown>, env: AppEnv) {
    await handleNotifyQueue(batch, env);
  },
} satisfies ExportedHandler<AppEnv>;
