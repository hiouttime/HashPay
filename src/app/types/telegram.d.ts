export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        expand(): void;
        initData?: string;
        ready(): void;
      };
    };
  }
}
