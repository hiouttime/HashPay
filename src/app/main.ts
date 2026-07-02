import { createApp } from "vue";
import naive from "naive-ui";
import { createRouter, createWebHistory } from "vue-router";
import App from "@/app/App.vue";
import NSegmented from "@/app/components/NSegmented.vue";
import "@/app/styles.scss";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { component: () => import("@/app/pages/Setup.vue"), path: "/setup" },
    { path: "/admin", redirect: "/admin/overview" },
    { component: () => import("@/app/pages/Admin.vue"), path: "/admin/merchants/new" },
    { component: () => import("@/app/pages/Admin.vue"), path: "/admin/merchants/:id/edit" },
    { component: () => import("@/app/pages/Admin.vue"), path: "/admin/:tab(overview|orders|payments|merchants|settings)" },
    { component: () => import("@/app/pages/Pay.vue"), path: "/pay/:id" },
    { component: () => import("@/app/pages/Home.vue"), path: "/" },
  ],
});

window.Telegram?.WebApp?.ready();
window.Telegram?.WebApp?.expand();

createApp(App).use(naive).component("NSegmented", NSegmented).use(router).mount("#app");
