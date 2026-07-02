export interface QueueBinding<T = unknown> {
  send(body: T, options?: { delaySeconds?: number }): Promise<void>;
}

export interface AppEnv {
  APP_SECRET?: string;
  ASSETS?: Fetcher;
  DB: D1Database;
  QUEUE_NOTIFY?: QueueBinding<Record<string, unknown>>;
  TGBOT_TOKEN?: string;
}

export interface AppVariables {
  requestId: string;
  tgUser?: TelegramUser;
}

export interface HonoEnv {
  Bindings: AppEnv;
  Variables: AppVariables;
}

export interface TelegramUser {
  firstName?: string;
  id: number;
  lastName?: string;
  username?: string;
}
