export type { TelegramUser } from "@/shared/types/api";

export interface QueueBinding<T = unknown> {
  send(body: T): Promise<void>;
  sendBatch(messages: Array<{ body: T }>): Promise<void>;
}

export interface AppEnv {
  APP_SECRET?: string;
  ASSETS?: Fetcher;
  DB: D1Database;
  RATE_LIMIT?: RateLimit;
  QUEUE_NOTIFY?: QueueBinding<Record<string, unknown>>;
  TGBOT_TOKEN?: string;
}

export interface HonoEnv {
  Bindings: AppEnv;
}
