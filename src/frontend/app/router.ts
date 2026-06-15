import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { component: () => import("@/frontend/pages/Setup.vue"), path: "/setup" },
    { component: () => import("@/frontend/pages/Admin.vue"), path: "/admin" },
    { component: () => import("@/frontend/pages/Admin.vue"), path: "/admin/:tab" },
    { component: () => import("@/frontend/pages/Pay.vue"), path: "/pay/:id" },
    { component: () => import("@/frontend/pages/Home.vue"), path: "/" },
  ],
});
