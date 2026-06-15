import { createApp } from "vue";
import naive from "naive-ui";
import App from "@/frontend/app/App.vue";
import { router } from "@/frontend/app/router";
import "@/frontend/app/styles.scss";

window.Telegram?.WebApp?.ready();
window.Telegram?.WebApp?.expand();

createApp(App).use(naive).use(router).mount("#app");
