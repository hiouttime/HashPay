<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { FormItemRule, MenuOption } from "naive-ui";
import { useMessage } from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import binanceIcon from "@/frontend/assets/chains/binance.svg";
import bnbIcon from "@/frontend/assets/chains/bnb.svg";
import ethereumIcon from "@/frontend/assets/chains/ethereum.svg";
import huobiIcon from "@/frontend/assets/chains/huobi.svg";
import okpayIcon from "@/frontend/assets/chains/okpay.svg";
import okxIcon from "@/frontend/assets/chains/okx.svg";
import polygonIcon from "@/frontend/assets/chains/polygon.svg";
import tonIcon from "@/frontend/assets/chains/ton.svg";
import tronIcon from "@/frontend/assets/chains/tron.svg";
import AdminOrderRow from "@/frontend/components/AdminOrderRow.vue";
import { api, telegramInitData } from "@/frontend/services/api";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const routeParts = computed(() => route.path.split("/").filter(Boolean));
const tab = computed(() => {
  const parts = routeParts.value;
  return parts[0] === "admin" ? String(parts[1] ?? "overview") : "overview";
});
const paymentRoute = computed(() => {
  if (tab.value !== "payments") return { id: "", mode: "" };
  const [, , part2, part3] = routeParts.value;
  if (part2 === "new") return { id: "new", mode: "new" };
  if (part3 === "edit") return { id: part2 ?? "", mode: "edit" };
  return { id: "", mode: "" };
});
const merchantRoute = computed(() => {
  if (tab.value !== "merchants") return { id: "", mode: "" };
  const [, , part2, part3] = routeParts.value;
  if (part2 === "new") return { id: "new", mode: "new" };
  if (part3 === "edit") return { id: part2 ?? "", mode: "edit" };
  return { id: "", mode: "" };
});
const botStartUrl = computed(() => state.value.botUsername ? `https://t.me/${state.value.botUsername}?start=hashpay` : "");
const bannerPreviewUrl = computed(() => `/site/banner.webp?v=${bannerVersion.value}`);
const releaseVersion = __GIT_SHORT_HASH__;
const navOptions: MenuOption[] = [
  { key: "overview", label: "概览" },
  { key: "orders", label: "订单" },
  { key: "payments", label: "收款" },
  { key: "merchants", label: "商户" },
  { key: "settings", label: "设置" },
];
const dashboard = ref<any>(null);
const overviewTrendRange = ref("today");
const trendHover = ref<{ field: "orderCount" | "paidAmount"; index: number } | null>(null);
const orders = ref<any[]>([]);
const orderPage = ref(1);
const orderPageSize = ref(20);
const orderDetail = ref<any>(null);
const orderDetailAction = ref("");
const orderDetailLoading = ref(false);
const orderDetailVisible = ref(false);
const orderSearch = ref("");
const orderSelectedIds = ref<string[]>([]);
const orderStatus = ref("all");
const orderTotal = ref(0);
const orderTestLoading = ref(false);
const ordersLoading = ref(false);
const payments = ref<any[]>([]);
const merchants = ref<any[]>([]);
const catalog = ref<any>({ drivers: [], schema: {} });
const settings = ref<Record<string, any>>({});
const bannerUploading = ref(false);
const bannerRestoring = ref(false);
const bannerVersion = ref(Date.now());
const state = ref<{ botReady?: boolean; botUsername?: string | null; installed?: boolean }>({});
const authenticated = ref(false);
const pin = ref("");
const pinChallenge = ref("");
const pinCommand = ref("");
const pinExpiresAt = ref(0);
const pinStatus = ref("");
const pinCommandWrap = ref<HTMLElement | null>(null);
let pinPollTimer: ReturnType<typeof setInterval> | undefined;
const ready = ref(false);
const mobileNavOpen = ref(false);
const paymentKind = ref("chain");
const paymentEditingId = ref<number | null>(null);
const paymentLoading = ref(false);
const paymentDeleteTarget = ref<any>(null);
type PaymentFormState = {
  driver: string;
  enabled: boolean;
  fields: Record<string, string>;
  name: string;
};
const paymentForm = ref<PaymentFormState>({
  driver: "chain/tron",
  enabled: true,
  fields: {
    account: "",
    address: "",
    currencies: "USDT,TRX",
    network: "tron",
  },
  name: "",
});
const merchantEditingId = ref<string | null>(null);
const merchantForm = ref({ callback_url: "", name: "", status: "active", type: "website" });
const merchantCredential = ref<{ merchantId: string; merchantName: string; privateKey: string } | null>(null);
const merchantLoading = ref(false);
const currencyOptions = [
  { label: "CNY - 人民币", value: "CNY" },
  { label: "USD - 美元", value: "USD" },
  { label: "EUR - 欧元", value: "EUR" },
  { label: "GBP - 英镑", value: "GBP" },
  { label: "TWD - 新台币", value: "TWD" },
];
const bannerLimits = {
  maxBytes: 10 * 1024 * 1024,
  maxDimensionSum: 10000,
  maxRatio: 20,
  minHeight: 300,
  minWidth: 600,
};
let settingsPreviewTimer: ReturnType<typeof setTimeout> | undefined;
let orderFilterTimer: ReturnType<typeof setTimeout> | undefined;
const paymentKinds = [
  { key: "chain", label: "区块链" },
  { key: "exchange", label: "交易所" },
  { key: "wallet", label: "第三方钱包" },
];
const merchantTypes = [
  { key: "website", label: "网站" },
  { key: "telegram", label: "Telegram 机器人" },
];
const merchantTypeDescription = computed(() =>
  merchantForm.value.type === "telegram"
    ? "在 Telegram 内下单，跳转钱包机器人完成付款。"
    : "通过 REST API 下单，以跳转收银台或直接返回二维码等形式完成付款。",
);
const orderStatusOptions = [
  { countKey: "total", label: "全部", value: "all" },
  { countKey: "pending", label: "待支付", value: "pending" },
  { countKey: "paid", label: "已支付", value: "paid" },
  { countKey: "expired", label: "已超时", value: "expired" },
  { countKey: "invalid", label: "异常", value: "invalid" },
];
const overviewTrendOptions = [
  { label: "今天", value: "today" },
  { label: "昨天", value: "yesterday" },
  { label: "近 7 天", value: "7d" },
  { label: "近半个月", value: "15d" },
  { label: "近一个月", value: "30d" },
];
const evmCoins: Record<string, string[]> = {
  bsc: ["USDT", "USDC", "BNB"],
  eth: ["USDT", "USDC", "ETH"],
  polygon: ["USDT", "USDC", "MATIC"],
};
const addressPatterns: Record<string, { message: string; pattern: RegExp }> = {
  "chain/evm": { message: "请填写有效的 EVM 地址", pattern: /^0x[a-fA-F0-9]{40}$/ },
  "chain/ton": { message: "请填写有效的 TON 地址", pattern: /^(EQ|UQ)[A-Za-z0-9_-]{46}$/ },
  "chain/tron": { message: "请填写有效的 TRON 地址", pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/ },
};
const evmSelection = ref<Record<string, string[]>>({ eth: [...evmCoins.eth] });
const paymentFormMode = computed(() => paymentRoute.value.mode !== "");
const paymentIsEdit = computed(() => paymentRoute.value.mode === "edit");
const merchantFormMode = computed(() => merchantRoute.value.mode !== "");
const merchantIsEdit = computed(() => merchantRoute.value.mode === "edit");
const paymentModalVisible = computed(() => paymentFormMode.value);
const merchantModalVisible = computed(() => merchantFormMode.value);
const visibleDrivers = computed(() =>
  (catalog.value.drivers ?? []).filter((driver: any) => driver.kind === paymentKind.value && (!paymentIsEdit.value || driver.id === paymentForm.value.driver)),
);
const selectedDriver = computed(() => (catalog.value.drivers ?? []).find((driver: any) => driver.id === paymentForm.value.driver));
const selectedDriverFields = computed(() =>
  (catalog.value.schema?.[paymentForm.value.driver] ?? []).filter((field: any) => !["currencies", "network"].includes(field.key)),
);
const editablePaymentFields = computed(() =>
  paymentIsEdit.value
    ? selectedDriverFields.value.filter((field: any) => ["account", "account_name", "address"].includes(field.key))
    : selectedDriverFields.value,
);
const selectedCoins = computed(() => parseCoins(paymentForm.value.fields.currencies));
const currentNetwork = computed(() => paymentForm.value.fields.network || selectedDriver.value?.networks?.[0] || "");
const coinOptions = computed(() => supportedCoins(selectedDriver.value, currentNetwork.value));
const evmNetworks = computed(() => Object.keys(evmSelection.value));
const currentPayment = computed(() =>
  paymentRoute.value.mode === "edit"
    ? payments.value.find((item) => Number(item.id) === Number(paymentRoute.value.id))
    : null,
);
const currentMerchant = computed(() =>
  merchantRoute.value.mode === "edit"
    ? merchants.value.find((item) => String(item.id) === merchantRoute.value.id)
    : null,
);
const currentPageOrderIds = computed(() => orders.value.map((order) => String(order.id)));
const checkedCurrentPageIds = computed(() => currentPageOrderIds.value.filter((id) => orderSelectedIds.value.includes(id)));
const allCurrentPageSelected = computed(() => currentPageOrderIds.value.length > 0 && checkedCurrentPageIds.value.length === currentPageOrderIds.value.length);
const selectedOrderCount = computed(() => orderSelectedIds.value.length);
const selectedPendingCount = computed(() => selectableSelectedOrderIds().length);
const someCurrentPageSelected = computed(() => checkedCurrentPageIds.value.length > 0 && !allCurrentPageSelected.value);

async function loadAll() {
  ready.value = false;
  state.value = await api<{ botReady?: boolean; botUsername?: string | null; installed?: boolean }>("/api/state").catch(() => ({}));
  if (!state.value.installed) {
    await router.replace("/setup");
    return;
  }
  const me = await api("/api/auth/me").catch(() => null);
  authenticated.value = Boolean(me);
  if (!authenticated.value) {
    if (!telegramInitData()) await loadPin();
    ready.value = true;
    return;
  }
  const [dashboardData, orderData, paymentData, merchantData, catalogData, settingsData] = await Promise.all([
    api("/api/admin/dashboard"),
    fetchOrders(),
    api<any[]>("/api/admin/payments"),
    api<any[]>("/api/admin/merchants"),
    api("/api/admin/payments/catalog"),
    api<Record<string, any>>("/api/admin/settings"),
  ]);
  dashboard.value = dashboardData;
  orders.value = orderData.items;
  orderPage.value = orderData.page;
  orderPageSize.value = orderData.pageSize;
  orderTotal.value = orderData.total;
  payments.value = paymentData;
  merchants.value = merchantData;
  catalog.value = catalogData;
  settings.value = { ...settingsData, rate_adjust: Number(settingsData.rate_adjust ?? 0), timeout: Number(settingsData.timeout ?? 30) };
  await loadBanner();
  syncFormsFromRoute();
  ready.value = true;
}

async function refreshPayments() {
  payments.value = await api<any[]>("/api/admin/payments");
}

async function refreshMerchants() {
  merchants.value = await api<any[]>("/api/admin/merchants");
}

async function fetchOrders() {
  const query = new URLSearchParams({
    page: String(orderPage.value),
    pageSize: String(orderPageSize.value),
    status: orderStatus.value,
  });
  const keyword = orderSearch.value.trim();
  if (keyword) query.set("q", keyword);
  return api<{ items: any[]; page: number; pageSize: number; total: number }>(`/api/admin/orders?${query.toString()}`);
}

async function loadOrders() {
  ordersLoading.value = true;
  try {
    const result = await fetchOrders();
    orders.value = result.items;
    orderPage.value = result.page;
    orderPageSize.value = result.pageSize;
    orderTotal.value = result.total;
  } finally {
    ordersLoading.value = false;
  }
}

async function createCheckoutTestOrder() {
  orderTestLoading.value = true;
  try {
    const result = await api<{ order: { id: string } }>("/api/admin/orders/test-checkout", { method: "POST" });
    message.success("测试订单已创建");
    await Promise.all([loadOrders(), refreshDashboard()]);
    await router.push(`/pay/${encodeURIComponent(result.order.id)}`);
  } catch (error) {
    message.error(error instanceof Error ? error.message : "测试订单创建失败");
  } finally {
    orderTestLoading.value = false;
  }
}

async function refreshDashboard() {
  dashboard.value = await api("/api/admin/dashboard");
}

async function login() {
  const initData = telegramInitData();
  if (!initData) return;
  const payload = { initData };
  await api("/api/auth/telegram", { body: JSON.stringify(payload), method: "POST" });
  await loadAll();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => null);
  authenticated.value = false;
  clearPinPolling();
  await loadAll();
}

function clearPinPolling() {
  if (pinPollTimer) {
    clearInterval(pinPollTimer);
    pinPollTimer = undefined;
  }
}

function createSixDigitPin() {
  const data = new Uint32Array(1);
  crypto.getRandomValues(data);
  return String(Math.floor((data[0] / 0x100000000) * 1000000)).padStart(6, "0");
}

async function loadPin() {
  clearPinPolling();
  try {
    pin.value = createSixDigitPin();
    const result = await api<{ challenge: string; command: string; expiresAt: number }>("/api/auth/pin", {
      body: JSON.stringify({ pin: pin.value }),
      method: "POST",
    });
    pinChallenge.value = result.challenge;
    pinCommand.value = result.command;
    pinExpiresAt.value = result.expiresAt;
    pinStatus.value = "等待确认，页面会自动跳转。";
    await pollPinStatus();
    pinPollTimer = setInterval(() => void pollPinStatus(), 2000);
  } catch (error) {
    pinStatus.value = error instanceof Error ? error.message : "登录 PIN 创建失败";
  }
}

async function pollPinStatus() {
  if (!pin.value || !pinChallenge.value) return;
  if (pinExpiresAt.value && Math.floor(Date.now() / 1000) > pinExpiresAt.value) {
    clearPinPolling();
    await loadPin();
    return;
  }
  try {
    const result = await api<{ authenticated: boolean }>(
      `/api/auth/pin/status?pin=${encodeURIComponent(pin.value)}&challenge=${encodeURIComponent(pinChallenge.value)}`,
    );
    if (!result.authenticated) return;
    clearPinPolling();
    pinStatus.value = "登录成功";
    await loadAll();
  } catch (error) {
    clearPinPolling();
    pinStatus.value = error instanceof Error ? error.message : "登录检查失败";
  }
}

async function copyPin() {
  if (!pinCommand.value) return;
  if (await copyText(pinCommand.value)) {
    message.success("已复制登录指令");
    return;
  }
  await selectPinCommand();
  message.warning("请手动复制");
}

async function copyText(text: string) {
  if (!navigator.clipboard?.writeText || !window.isSecureContext) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function selectPinCommand() {
  await nextTick();
  const input = pinCommandWrap.value?.querySelector("input");
  input?.focus();
  input?.select();
}

async function savePayment() {
  const driver = selectedDriver.value;
  if (!driver) {
    message.error(paymentKind.value === "wallet" ? "当前还没有第三方钱包驱动" : "请选择收款网络或平台");
    return;
  }
  if (!paymentForm.value.name.trim()) {
    message.error("请填写通道名称");
    return;
  }
  const missing = editablePaymentFields.value.find((field: any) => field.required && !String(paymentForm.value.fields[field.key] || "").trim());
  if (missing) {
    message.error(`请填写 ${missing.label}`);
    return;
  }
  const addressError = validatePaymentAddress(driver.id, paymentForm.value.fields.address);
  if (addressError) {
    message.error(addressError);
    return;
  }
  paymentLoading.value = true;
  try {
    if (!paymentIsEdit.value && driver.id === "chain/evm") {
      if (!evmNetworks.value.length) {
        message.error("请至少选择一个 EVM 网络");
        return;
      }
      for (const network of evmNetworks.value) {
        if (!evmSelection.value[network]?.length) {
          message.error(`请至少选择 ${networkName(network)} 的一个币种`);
          return;
        }
      }
      for (const network of evmNetworks.value) {
        await api("/api/admin/payments", {
          body: JSON.stringify({
            driver: driver.id,
            enabled: true,
            fields: {
              ...sanitizePaymentFields(paymentForm.value.fields),
              currencies: evmSelection.value[network].join(","),
              network,
            },
            name: evmNetworks.value.length === 1 ? paymentForm.value.name.trim() : `${paymentForm.value.name.trim()} · ${networkName(network)}`,
          }),
          method: "POST",
        });
      }
    } else {
      if (!selectedCoins.value.length) {
        message.error("请至少选择一个币种");
        return;
      }
      const fields = {
        ...sanitizePaymentFields(paymentForm.value.fields),
        currencies: selectedCoins.value.join(","),
        network: currentNetwork.value,
      };
      const url = paymentEditingId.value ? `/api/admin/payments/${paymentEditingId.value}` : "/api/admin/payments";
      await api(url, {
        body: JSON.stringify({ driver: driver.id, enabled: paymentIsEdit.value ? paymentForm.value.enabled : true, fields, name: paymentForm.value.name.trim() }),
        method: paymentEditingId.value ? "PUT" : "POST",
      });
    }
    message.success(paymentIsEdit.value ? "支付方式已保存" : "支付方式已新增");
    resetPaymentForm();
    await router.push("/admin/payments");
    await refreshPayments();
  } finally {
    paymentLoading.value = false;
  }
}

async function saveMerchant() {
  if (!merchantForm.value.name.trim()) {
    message.error("请填写商户名称");
    return;
  }
  if (merchantForm.value.callback_url && !merchantForm.value.callback_url.startsWith("http")) {
    message.error("回调 URL 必须以 http 开头");
    return;
  }
  merchantLoading.value = true;
  const editing = Boolean(merchantEditingId.value);
  try {
    const url = merchantEditingId.value ? `/api/admin/merchants/${merchantEditingId.value}` : "/api/admin/merchants";
    const result = await api<any>(url, { body: JSON.stringify(merchantForm.value), method: merchantEditingId.value ? "PUT" : "POST" });
    const saved = result.merchant ?? result;
    merchantEditingId.value = saved.id ?? merchantEditingId.value;
    merchantForm.value = normalizeMerchant(saved);
    if (saved.id) {
      merchants.value = [saved, ...merchants.value.filter((item) => String(item.id) !== String(saved.id))];
    }
    message.success(editing ? "商户已保存" : "商户已新增");
    if (!editing && result.private_key) {
      resetMerchantForm();
      await router.push("/admin/merchants");
      showMerchantCredential(saved, result.private_key);
    }
    await refreshMerchants();
  } finally {
    merchantLoading.value = false;
  }
}

async function removePayment(id: number) {
  const target = payments.value.find((item) => Number(item.id) === Number(id));
  if (!target) return;
  paymentDeleteTarget.value = target;
}

async function confirmRemovePayment() {
  const target = paymentDeleteTarget.value;
  if (!target) return;
  await api(`/api/admin/payments/${target.id}`, { method: "DELETE" });
  message.success("支付方式已删除");
  if (paymentEditingId.value === target.id) resetPaymentForm();
  paymentDeleteTarget.value = null;
  await refreshPayments();
}

function cancelRemovePayment() {
  paymentDeleteTarget.value = null;
}

async function removeMerchant(id: string) {
  await api(`/api/admin/merchants/${id}`, { method: "DELETE" });
  message.success("商户已删除");
  if (merchantEditingId.value === id) resetMerchantForm();
  await router.push("/admin/merchants");
  await refreshMerchants();
}

async function toggleMerchantStatus(item: any, status: string) {
  const next = status === "active" ? "active" : "paused";
  const previous = item.status;
  item.status = next;
  try {
    const result = await api<any>(`/api/admin/merchants/${item.id}`, {
      body: JSON.stringify({
        callback_url: item.callback_url ?? "",
        name: item.name,
        status: next,
        type: item.type ?? "website",
      }),
      method: "PUT",
    });
    const saved = result.merchant ?? result;
    merchants.value = merchants.value.map((merchant) => (String(merchant.id) === String(saved.id) ? saved : merchant));
    message.success(next === "active" ? "商户已启用" : "商户已停用");
  } catch (error) {
    item.status = previous;
    throw error;
  }
}

function editPayment(item: any) {
  paymentEditingId.value = item.id;
  paymentKind.value = driverKind(item.driver);
  evmSelection.value = evmSelectionFromPayment(item);
  paymentForm.value = {
    driver: item.driver,
    enabled: Boolean(item.enabled),
    fields: {
      account: item.fields?.account ?? "",
      address: item.fields?.address ?? "",
      currencies: item.fields?.currencies ?? "",
      memo: item.fields?.memo ?? "",
      network: item.fields?.network ?? defaultNetwork(item.driver),
    },
    name: item.name,
  };
  void router.push(`/admin/payments/${item.id}/edit`);
}

function editMerchant(item: any) {
  merchantEditingId.value = item.id;
  merchantForm.value = {
    callback_url: item.callback_url ?? "",
    name: item.name ?? "",
    status: item.status ?? "active",
    type: item.type ?? "website",
  };
  void router.push(`/admin/merchants/${item.id}/edit`);
}

function resetPaymentForm() {
  paymentEditingId.value = null;
  paymentKind.value = "chain";
  evmSelection.value = { eth: [...evmCoins.eth] };
  paymentForm.value = {
    driver: "chain/tron",
    enabled: true,
    fields: {
      account: "",
      address: "",
      currencies: "USDT,TRX",
      network: "tron",
    },
    name: "",
  };
}

function resetMerchantForm() {
  merchantEditingId.value = null;
  merchantForm.value = { callback_url: "", name: "", status: "active", type: "website" };
}

async function resetMerchantKey() {
  if (!merchantEditingId.value) return;
  merchantLoading.value = true;
  try {
    const result = await api<any>(`/api/admin/merchants/${merchantEditingId.value}/key`, { method: "POST" });
    const saved = result.merchant ?? result;
    merchants.value = [saved, ...merchants.value.filter((item) => String(item.id) !== String(saved.id))];
    resetMerchantForm();
    await router.push("/admin/merchants");
    showMerchantCredential(saved, result.private_key ?? "");
    message.success("接入凭据已重置");
  } finally {
    merchantLoading.value = false;
  }
}

async function copyMerchantPrivateKey() {
  if (!merchantCredential.value?.privateKey) return;
  if (await copyText(merchantCredential.value.privateKey)) {
    message.success("已复制私钥");
    return;
  }
  message.warning("请手动复制");
}

function showMerchantCredential(merchant: any, privateKey: string) {
  if (!privateKey) return;
  merchantCredential.value = {
    merchantId: String(merchant.id ?? ""),
    merchantName: String(merchant.name ?? ""),
    privateKey,
  };
}

function closeMerchantCredential() {
  merchantCredential.value = null;
}

function openPaymentForm() {
  resetPaymentForm();
  void router.push("/admin/payments/new");
}

function openMerchantForm() {
  resetMerchantForm();
  void router.push("/admin/merchants/new");
}

function closePaymentModal() {
  resetPaymentForm();
  void router.push("/admin/payments");
}

function closeMerchantModal() {
  resetMerchantForm();
  void router.push("/admin/merchants");
}

function selectPaymentKind(kind: string) {
  if (paymentIsEdit.value) return;
  paymentKind.value = kind;
  const driver = (catalog.value.drivers ?? []).find((item: any) => item.kind === kind);
  if (driver) selectPaymentDriver(driver.id);
}

function selectPaymentDriver(driverId: string) {
  if (paymentIsEdit.value) return;
  const driver = (catalog.value.drivers ?? []).find((item: any) => item.id === driverId);
  if (!driver) return;
  const network = driver.networks?.[0] ?? "";
  paymentForm.value.driver = driver.id;
  paymentForm.value.fields = {
    account: "",
    address: "",
    currencies: (driver.currencies ?? []).join(","),
    network,
  };
  evmSelection.value = driver.id === "chain/evm" ? { [network]: [...supportedCoins(driver, network)] } : {};
}

function toggleCoin(coin: string) {
  if (selectedCoins.value.includes(coin) && selectedCoins.value.length === 1) {
    message.warning("至少需要一个币种");
    return;
  }
  const coins = selectedCoins.value.includes(coin) ? selectedCoins.value.filter((item) => item !== coin) : [...selectedCoins.value, coin];
  paymentForm.value.fields.currencies = coins.join(",");
}

function toggleEvmNetwork(network: string) {
  const next = { ...evmSelection.value };
  if (next[network]) {
    if (Object.keys(next).length === 1) {
      message.warning("至少需要一个EVM网络");
      return;
    }
    delete next[network];
  } else {
    next[network] = [...supportedCoins(selectedDriver.value, network)];
  }
  evmSelection.value = next;
}

function toggleEvmCoin(network: string, coin: string) {
  const selected = evmSelection.value[network] ?? [];
  if (selected.includes(coin) && selected.length === 1) {
    message.warning(`至少需要一个${networkName(network)}币种`);
    return;
  }
  evmSelection.value = {
    ...evmSelection.value,
    [network]: selected.includes(coin) ? selected.filter((item) => item !== coin) : [...selected, coin],
  };
}

function parseCoins(raw: string) {
  return Array.from(new Set(String(raw || "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)));
}

function sanitizePaymentFields(fields: Record<string, string>) {
  const next = { ...fields };
  delete next.name;
  delete next.confirm_tolerance;
  delete next.amount_tolerance;
  delete next.instructions;
  return next;
}

function driverKind(driverId: string) {
  return (catalog.value.drivers ?? []).find((item: any) => item.id === driverId)?.kind ?? "chain";
}

function defaultNetwork(driverId: string) {
  return (catalog.value.drivers ?? []).find((item: any) => item.id === driverId)?.networks?.[0] ?? "";
}

function supportedCoins(driver: any, network: string) {
  if (!driver) return [];
  if (driver.id === "chain/evm") return evmCoins[network] ?? evmCoins.eth;
  return driver.currencies ?? [];
}

function validatePaymentAddress(driverId: string, address?: string) {
  const validator = addressPatterns[driverId];
  const value = address?.trim() ?? "";
  if (!validator || !value || validator.pattern.test(value)) return "";
  return validator.message;
}

function paymentFieldRule(field: any): FormItemRule | undefined {
  if (field.key !== "address") return undefined;
  return {
    trigger: ["input", "blur"],
    validator: () => {
      const value = paymentForm.value.fields.address?.trim() ?? "";
      if (field.required && !value) return new Error(`请填写 ${field.label}`);
      const addressError = validatePaymentAddress(paymentForm.value.driver, value);
      return addressError ? new Error(addressError) : true;
    },
  };
}

function networkName(network: string) {
  const names: Record<string, string> = {
    bsc: "BSC",
    "chain/evm": "EVM 兼容链",
    "chain/ton": "TON",
    "chain/tron": "TRON 波场",
    "exchange/binance": "Binance 币安",
    "exchange/huobi": "Huobi 火币",
    "exchange/okx": "OKX 欧易",
    eth: "Ethereum",
    binance: "Binance 币安",
    huobi: "Huobi 火币",
    okpay: "Okpay",
    okx: "OKX 欧易",
    polygon: "Polygon",
    ton: "TON",
    tron: "TRON 波场",
    "wallet/okpay": "Okpay",
  };
  return names[network] ?? network;
}

function currencyLabel(currency: unknown) {
  const value = String(currency || "").toUpperCase();
  return value === "GRAM" ? "Gram (ex TON)" : value;
}

function paymentKindName(kind: string) {
  const names: Record<string, string> = {
    chain: "区块链",
    exchange: "交易所",
    wallet: "第三方钱包",
  };
  return names[kind] ?? kind;
}

function paymentIcon(driverId: string, network?: string) {
  if (driverId === "chain/evm") {
    if (network === "bsc") return bnbIcon;
    if (network === "polygon") return polygonIcon;
    return ethereumIcon;
  }
  if (driverId === "chain/ton" || network === "ton") return tonIcon;
  if (driverId === "chain/tron" || network === "tron") return tronIcon;
  if (driverId === "exchange/binance" || network === "binance") return binanceIcon;
  if (driverId === "exchange/okx" || network === "okx") return okxIcon;
  if (driverId === "exchange/huobi" || network === "huobi") return huobiIcon;
  if (driverId === "wallet/okpay" || network === "okpay") return okpayIcon;
  return "";
}

function paymentIconLabel(driverId: string, network?: string) {
  if (network === "bsc") return "BNB Chain";
  if (network === "polygon") return "Polygon";
  if (network === "ton" || driverId === "chain/ton") return "TON";
  if (driverId === "chain/evm") return "Ethereum";
  if (driverId === "chain/tron" || network === "tron") return "TRON 波场";
  if (driverId === "exchange/binance" || network === "binance") return "Binance 币安";
  if (driverId === "exchange/okx" || network === "okx") return "OKX 欧易";
  if (driverId === "exchange/huobi" || network === "huobi") return "Huobi 火币";
  if (driverId === "wallet/okpay" || network === "okpay") return "Okpay";
  return "Payment network";
}

function driverChoiceNetwork(driver: any) {
  if (driver.id === "chain/evm" && paymentForm.value.driver === driver.id) return currentNetwork.value;
  return driver.networks?.[0];
}

function shortText(value: unknown, start = 12, end = 8) {
  const text = String(value || "");
  return text.length > start + end + 3 ? `${text.slice(0, start)}...${text.slice(-end)}` : text;
}

function normalizeMerchant(item: any) {
  return {
    callback_url: item?.callback_url ?? "",
    name: item?.name ?? "",
    status: item?.status ?? "active",
    type: item?.type ?? "website",
  };
}

function evmSelectionFromPayment(item: any) {
  if (item.driver !== "chain/evm") return {};
  const network = item.fields?.network || "eth";
  const coins = parseCoins(item.fields?.currencies);
  return { [network]: coins.length ? coins : [...supportedCoins({ id: "chain/evm" }, network)] };
}

function syncFormsFromRoute() {
  if (tab.value === "payments") {
    if (paymentRoute.value.mode === "new") {
      resetPaymentForm();
    } else if (paymentRoute.value.mode === "edit" && currentPayment.value) {
      editPaymentWithoutRoute(currentPayment.value);
    }
  }
  if (tab.value === "merchants") {
    if (merchantRoute.value.mode === "new") {
      resetMerchantForm();
    } else if (merchantRoute.value.mode === "edit" && currentMerchant.value) {
      editMerchantWithoutRoute(currentMerchant.value);
    }
  }
}

function editPaymentWithoutRoute(item: any) {
  paymentEditingId.value = item.id;
  paymentKind.value = driverKind(item.driver);
  evmSelection.value = evmSelectionFromPayment(item);
  paymentForm.value = {
    driver: item.driver,
    enabled: Boolean(item.enabled),
    fields: {
      account: item.fields?.account ?? "",
      address: item.fields?.address ?? "",
      currencies: item.fields?.currencies ?? "",
      memo: item.fields?.memo ?? "",
      network: item.fields?.network ?? defaultNetwork(item.driver),
    },
    name: item.name,
  };
}

function editMerchantWithoutRoute(item: any) {
  merchantEditingId.value = item.id;
  merchantForm.value = normalizeMerchant(item);
}

async function saveSettings() {
  await api("/api/admin/settings", {
    body: JSON.stringify({
      currency: settings.value.currency,
      domain: settings.value.domain,
      fast_confirm: settings.value.fast_confirm,
      rate_adjust: settings.value.rate_adjust,
      timeout: settings.value.timeout,
    }),
    method: "PUT",
  });
  message.success("设置已保存");
  await loadAll();
}

async function refreshRatePreview() {
  if (!settings.value.currency) return;
  const query = new URLSearchParams({
    currency: String(settings.value.currency || "CNY"),
    rate_adjust: String(settings.value.rate_adjust || "0"),
  });
  settings.value.rate_preview = await api(`/api/admin/settings/preview?${query.toString()}`).catch(() => settings.value.rate_preview);
}

function formatRate(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "--";
  if (amount >= 1000) return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 2 });
  return amount.toLocaleString("en-US", { maximumFractionDigits: 6, minimumFractionDigits: 4 });
}

function previewRate(currency: string) {
  return settings.value.rate_preview?.items?.find((item: any) => item.currency === currency);
}

async function loadBanner() {
  await api<{ exists: boolean; url: string }>("/api/admin/banner").catch(() => ({ exists: true, url: "" }));
  bannerVersion.value = Date.now();
}

async function uploadBanner(options: { file: { file?: File | null }; onError?: () => void; onFinish?: () => void }) {
  const file = options.file.file;
  if (!file) return;
  bannerUploading.value = true;
  try {
    const banner = await imageToWebp(file);
    await api("/api/admin/banner", { body: await banner.arrayBuffer(), headers: { "content-type": "image/webp" }, method: "PUT" });
    message.success("Banner 已保存");
    await loadBanner();
    options.onFinish?.();
  } catch (error) {
    message.error(error instanceof Error ? error.message : "Banner 上传失败");
    options.onError?.();
  } finally {
    bannerUploading.value = false;
  }
}

async function restoreBanner() {
  bannerRestoring.value = true;
  try {
    await api("/api/admin/banner/default", { method: "POST" });
    bannerVersion.value = Date.now();
    message.success("已恢复默认 Banner");
  } finally {
    bannerRestoring.value = false;
  }
}

async function imageToWebp(file: File) {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const ratio = Math.max(width / height, height / width);
  if (width < bannerLimits.minWidth || height < bannerLimits.minHeight) {
    bitmap.close();
    throw new Error(`Banner 最低尺寸为 ${bannerLimits.minWidth} x ${bannerLimits.minHeight}`);
  }
  if (width + height > bannerLimits.maxDimensionSum || ratio > bannerLimits.maxRatio) {
    bitmap.close();
    throw new Error("图片尺寸不符合 Telegram 发送要求");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理图片");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("图片转换失败");
  if (blob.size > bannerLimits.maxBytes) throw new Error("Banner 文件大小不能超过 10 MB");
  return blob;
}

async function checkSelectedOrders() {
  const ids = selectableSelectedOrderIds();
  if (!ids.length) return;
  ordersLoading.value = true;
  try {
    await Promise.all(ids.map((id) => api(`/api/admin/orders/${id}/check`, { method: "POST" }).catch(() => null)));
    message.success("批量检查完成");
    await Promise.all([loadOrders(), refreshDashboard()]);
  } finally {
    ordersLoading.value = false;
  }
}

async function deleteSelectedOrders() {
  const ids = [...orderSelectedIds.value];
  if (!ids.length) return;
  ordersLoading.value = true;
  try {
    await Promise.all(ids.map((id) => api(`/api/admin/orders/${id}`, { method: "DELETE" }).catch(() => null)));
    message.success("已删除所选订单");
    orderSelectedIds.value = orderSelectedIds.value.filter((id) => !ids.includes(id));
    await Promise.all([loadOrders(), refreshDashboard()]);
  } finally {
    ordersLoading.value = false;
  }
}

function selectableSelectedOrderIds() {
  const pending = new Set(orders.value.filter((order) => order.status === "pending").map((order) => String(order.id)));
  return orderSelectedIds.value.filter((id) => pending.has(id));
}

function setOrderStatus(value: string) {
  if (orderStatus.value === value) return;
  orderPage.value = 1;
  orderStatus.value = value;
}

function toggleCurrentPageOrders(checked: boolean) {
  const current = new Set(currentPageOrderIds.value);
  const selected = new Set(orderSelectedIds.value);
  if (checked) {
    for (const id of current) selected.add(id);
  } else {
    for (const id of current) selected.delete(id);
  }
  orderSelectedIds.value = Array.from(selected);
}

function toggleOrderSelection(id: string, checked: boolean) {
  const selected = new Set(orderSelectedIds.value);
  if (checked) selected.add(id);
  else selected.delete(id);
  orderSelectedIds.value = Array.from(selected);
}

async function copyOrderId(id: string) {
  if (await copyText(id)) message.success("已复制订单号");
}

async function copyMerchantId(id: string) {
  if (await copyText(id)) message.success("已复制商户 ID");
}

async function openOrderDetail(id: string) {
  orderDetailVisible.value = true;
  orderDetailLoading.value = true;
  try {
    orderDetail.value = await api(`/api/admin/orders/${encodeURIComponent(id)}`);
  } finally {
    orderDetailLoading.value = false;
  }
}

async function refreshOrderDetail() {
  const id = orderDetail.value?.order?.id;
  if (!id) return;
  orderDetail.value = await api(`/api/admin/orders/${encodeURIComponent(id)}`);
}

async function runOrderDetailAction(action: string, fn: () => Promise<void>) {
  orderDetailAction.value = action;
  try {
    await fn();
  } catch (error) {
    message.error(error instanceof Error ? error.message : "操作失败");
  } finally {
    orderDetailAction.value = "";
  }
}

function orderDetailPending() {
  return orderDetail.value?.order?.status === "pending";
}

function orderDetailPaid() {
  return orderDetail.value?.order?.status === "paid";
}

async function checkDetailOrderPayment() {
  const id = orderDetail.value?.order?.id;
  if (!id) return;
  await runOrderDetailAction("check", async () => {
    await api(`/api/admin/orders/${id}/check`, { method: "POST" });
    message.success("检查完成");
    await Promise.all([refreshOrderDetail(), loadOrders(), refreshDashboard()]);
  });
}

async function confirmDetailOrderPayment() {
  const id = orderDetail.value?.order?.id;
  if (!id) return;
  await runOrderDetailAction("confirm", async () => {
    await api(`/api/admin/orders/${id}/confirm`, { body: JSON.stringify({}), method: "POST" });
    message.success("订单已确认付款");
    await Promise.all([refreshOrderDetail(), loadOrders(), refreshDashboard()]);
  });
}

async function resendDetailOrderNotify() {
  const id = orderDetail.value?.order?.id;
  if (!id) return;
  await runOrderDetailAction("notify", async () => {
    await api(`/api/admin/orders/${id}/notify`, { method: "POST" });
    message.success("通知已重新发送");
    await Promise.all([refreshOrderDetail(), refreshDashboard()]);
  });
}

async function deleteDetailOrder() {
  const id = orderDetail.value?.order?.id;
  if (!id) return;
  await runOrderDetailAction("delete", async () => {
    await api(`/api/admin/orders/${id}`, { method: "DELETE" });
    message.success("订单已删除");
    orderDetailVisible.value = false;
    orderDetail.value = null;
    orderSelectedIds.value = orderSelectedIds.value.filter((item) => item !== id);
    await Promise.all([loadOrders(), refreshDashboard()]);
  });
}

function orderCustomerText(order: any) {
  if (order.source === "telegram_inline") return "Telegram 用户";
  return order.customer_ref || "--";
}

function orderConfirmTimeLabel(order: any) {
  return order.status === "expired" ? "过期时间" : "确认时间";
}

function orderConfirmTimeText(order: any) {
  if (order.status === "expired") return formatOrderTime(order.expire_at);
  return order.paid_at ? formatOrderTime(order.paid_at) : "--";
}

function orderConfirmMethodText(order: any) {
  if (!order?.payment?.tx?.confirmedBy) return "--";
  return order.payment.tx.confirmedBy === "admin" ? "手动确认" : "自动确认";
}

function orderStatusCount(key: string) {
  return Number(dashboard.value?.orderCounts?.[key] ?? 0);
}

function overviewGreeting() {
  const hour = new Date().getHours();
  if (hour < 9) return "早上好";
  if (hour < 12) return "上午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function overviewTrendPoints() {
  return dashboard.value?.trends?.[overviewTrendRange.value] ?? [];
}

function trendValues(field: "orderCount" | "paidAmount") {
  return overviewTrendPoints().map((item: any) => Number(item[field]) || 0);
}

function trendTotal(field: "orderCount" | "paidAmount") {
  return trendValues(field).reduce((sum: number, value: number) => sum + value, 0);
}

function trendPolyline(field: "orderCount" | "paidAmount") {
  const values = trendValues(field);
  const width = 320;
  const height = 116;
  const pad = 10;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values
    .map((value: number, index: number) => {
      const x = pad + step * index;
      const y = height - pad - (value / max) * (height - pad * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function trendPoint(field: "orderCount" | "paidAmount", index: number) {
  const values = trendValues(field);
  const width = 320;
  const height = 116;
  const pad = 10;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const value = values[index] ?? 0;
  return {
    label: overviewTrendPoints()[index]?.label ?? "",
    value,
    x: pad + step * index,
    y: height - pad - (value / max) * (height - pad * 2),
  };
}

function setTrendHover(event: MouseEvent, field: "orderCount" | "paidAmount") {
  const values = trendValues(field);
  if (!values.length) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  const index = Math.round(ratio * (values.length - 1));
  trendHover.value = { field, index };
}

function clearTrendHover() {
  trendHover.value = null;
}

function trendHoverPoint(field: "orderCount" | "paidAmount") {
  if (trendHover.value?.field !== field) return null;
  return trendPoint(field, trendHover.value.index);
}

function trendTooltipText(field: "orderCount" | "paidAmount") {
  const point = trendHoverPoint(field);
  if (!point) return "";
  const value = field === "paidAmount" ? `${formatOrderAmount(point.value)}${settings.value.currency || "USD"}` : `${point.value}个`;
  return `${point.label} ${value}`;
}

function trendPointStyle(field: "orderCount" | "paidAmount") {
  const point = trendHoverPoint(field);
  if (!point) return {};
  return {
    left: `${(point.x / 320) * 100}%`,
    top: `${(point.y / 116) * 100}%`,
  };
}

function trendArea(field: "orderCount" | "paidAmount") {
  const line = trendPolyline(field);
  if (!line) return "";
  return `10,106 ${line} 310,106`;
}

function trendRangeLabel() {
  const points = overviewTrendPoints();
  if (!points.length) return "";
  const start = points[0]?.label ?? "";
  const end = points[points.length - 1]?.label ?? "";
  if (!start || start === end) return start || end;
  return `${start} - ${end}`;
}

function systemHealthItems() {
  const health = dashboard.value?.paymentHealth ?? [];
  return health
    .filter((item: any) => item.status === "warn")
    .map((item: any) => ({
      details: item.details,
      label: `#${item.id} ${item.name}`,
      status: item.status,
    }));
}

function healthStatusText(status: string) {
  const labels: Record<string, string> = {
    off: "停用",
    ok: "正常",
    warn: "注意",
  };
  return labels[status] ?? status;
}

function healthStatusClass(status: string) {
  const classes: Record<string, string> = {
    off: "is-muted",
    ok: "is-success",
    warn: "is-warning",
  };
  return classes[status] ?? "";
}

function orderStatusText(status: string) {
  const labels: Record<string, string> = {
    expired: "已超时",
    invalid: "异常",
    paid: "已支付",
    pending: "待支付",
  };
  return labels[status] ?? status;
}

function orderStatusClass(status: string) {
  const classes: Record<string, string> = {
    expired: "is-muted",
    invalid: "is-error",
    paid: "is-success",
    pending: "is-warning",
  };
  return classes[status] ?? "";
}

function formatOrderAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return ceilDisplayAmount(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function ceilDisplayAmount(amount: number) {
  const next = Math.ceil((amount - Number.EPSILON) * 100) / 100;
  return Object.is(next, -0) ? 0 : next;
}

function formatOrderTime(value: unknown) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  const date = new Date(ts * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function orderPaywayLabel(order: any) {
  if (!order.payway) return "未选择";
  return order.payway_name || order.payment?.name || "已删除通道";
}

function orderPaymentTarget(order: any) {
  return order.payment?.address || order.payment?.account || order.payment?.memo || "";
}

function orderRateText(detail: any) {
  const rate = Number(detail?.rate?.rate);
  if (!Number.isFinite(rate) || rate <= 0) return "未选择收款方式";
  return `1 ${detail.rate.payment_currency} = ${formatOrderAmount(rate)} ${detail.rate.original_currency}`;
}

function txExplorerUrl(order: any) {
  const hash = String(order?.payment?.tx?.hash || "").trim();
  if (!hash) return "";
  if (order?.payment?.network === "tron") return `https://nile.tronscan.org/#/transaction/${encodeURIComponent(hash)}`;
  return "";
}

function notifyStatusText(status: string) {
  const labels: Record<string, string> = {
    done: "已完成",
    failed: "失败",
    pending: "等待中",
    retry: "重试中",
  };
  return labels[status] ?? status;
}

function openTab(key: string) {
  void router.push(key === "overview" ? "/admin" : `/admin/${key}`);
}

function openMobileTab(key: string) {
  mobileNavOpen.value = false;
  openTab(key);
}

watch(
  () => route.path,
  () => {
    if (ready.value && authenticated.value) syncFormsFromRoute();
    if (ready.value && authenticated.value && tab.value === "orders") void loadOrders();
  },
);

watch(
  () => [orderSearch.value, orderStatus.value],
  () => {
    if (!ready.value || !authenticated.value) return;
    if (orderFilterTimer) clearTimeout(orderFilterTimer);
    if (orderPage.value !== 1) {
      orderPage.value = 1;
      return;
    }
    orderFilterTimer = setTimeout(() => {
      void loadOrders();
    }, 250);
  },
);

watch(
  () => [orderPage.value, orderPageSize.value],
  () => {
    if (!ready.value || !authenticated.value || tab.value !== "orders") return;
    void loadOrders();
  },
);

watch(
  () => [settings.value.currency, settings.value.rate_adjust],
  () => {
    if (!authenticated.value || tab.value !== "settings") return;
    if (settingsPreviewTimer) clearTimeout(settingsPreviewTimer);
    settingsPreviewTimer = setTimeout(() => {
      void refreshRatePreview();
    }, 350);
  },
);

onMounted(loadAll);
onBeforeUnmount(() => {
  clearPinPolling();
  if (settingsPreviewTimer) clearTimeout(settingsPreviewTimer);
  if (orderFilterTimer) clearTimeout(orderFilterTimer);
});
</script>

<template>
  <n-layout class="shell">
    <n-layout-header class="topbar">
      <div class="topbar-brand">
        <n-button v-if="authenticated" circle quaternary size="small" class="mobile-menu-button" title="打开菜单" @click="mobileNavOpen = true">
          <template #icon>
            <span class="hamburger-icon" aria-hidden="true"></span>
          </template>
        </n-button>
        <div class="brand">HashPay</div>
      </div>
      <div v-if="authenticated" class="topbar-actions">
        <n-button v-if="telegramInitData()" size="small" @click="login">登录/刷新</n-button>
        <n-button size="small" secondary @click="logout">退出登录</n-button>
      </div>
    </n-layout-header>
    <n-layout-content v-if="!ready" class="page-layout" content-class="page">
      <section class="panel">正在加载</section>
    </n-layout-content>
    <n-layout-content v-else-if="!authenticated" class="page-layout" content-class="page">
      <section class="panel grid login-panel">
        <div class="section-title"><h2>欢迎</h2></div>
        <div v-if="telegramInitData()">
          <n-button type="primary" @click="login">登录/刷新</n-button>
        </div>
        <div v-else class="grid">
          <p class="muted">
            在
            <a v-if="state.botUsername" class="text-link" :href="botStartUrl" target="_blank" rel="noreferrer">@{{ state.botUsername }}</a>
            <span v-else>Telegram 机器人</span>
            中发送以下指令以完成登录。
          </p>
          <div ref="pinCommandWrap">
            <n-input-group>
              <n-input v-model:value="pinCommand" readonly />
              <n-button :disabled="!pinCommand" type="primary" @click="copyPin">复制</n-button>
            </n-input-group>
          </div>
          <p class="muted">{{ pinStatus }}</p>
          <div v-if="state.botUsername" class="login-divider"><span>或</span></div>
          <div v-if="state.botUsername" class="grid">
            <p class="muted">使用管理员 Telegram 账号</p>
            <a :href="botStartUrl" target="_blank" rel="noreferrer">
              <n-button block secondary type="primary">访问小程序</n-button>
            </a>
          </div>
        </div>
      </section>
    </n-layout-content>
    <n-layout-content v-else class="admin-page-layout" content-class="admin-page">
      <n-drawer v-model:show="mobileNavOpen" placement="left" :width="260">
        <n-drawer-content closable title="HashPay">
          <div class="mobile-drawer-nav">
            <n-menu :options="navOptions" :value="tab" @update:value="openMobileTab" />
            <div class="admin-release">
              <span>Version {{ releaseVersion }}</span>
              <span>Made with ❤️ by TGDash Team</span>
            </div>
          </div>
        </n-drawer-content>
      </n-drawer>
      <n-layout has-sider class="admin-layout">
        <n-layout-sider bordered :width="210">
          <div class="admin-sider-inner">
            <n-menu :options="navOptions" :value="tab" @update:value="openTab" />
            <div class="admin-release">
              <span>Version {{ releaseVersion }}</span>
              <span>Made with ❤️ by TGDash Team</span>
            </div>
          </div>
        </n-layout-sider>
        <n-layout-content class="admin-content">
          <div v-if="tab === 'overview'" class="overview-page grid">
            <div class="section-title overview-title">
              <div>
                <h2>{{ overviewGreeting() }}</h2>
                <p class="muted">欢迎使用 HashPay</p>
              </div>
              <n-button secondary type="primary" @click="refreshDashboard">刷新数据</n-button>
            </div>

            <section class="overview-summary">
              <div class="overview-data-panel">
                <div class="overview-data-head">
                  <div class="overview-range-tabs">
                    <button
                      v-for="item in overviewTrendOptions"
                      :key="item.value"
                      :class="{ 'is-active': overviewTrendRange === item.value }"
                      type="button"
                      @click="overviewTrendRange = item.value"
                    >
                      {{ item.label }}
                    </button>
                  </div>
                </div>
                <div class="trend-summary">
                  <div class="trend-summary-primary">
                    <span class="muted">收款金额</span>
                    <strong>{{ formatOrderAmount(trendTotal('paidAmount')) }} {{ settings.currency || 'USD' }}</strong>
                  </div>
                  <div>
                    <span class="muted">订单数量</span>
                    <strong>{{ trendTotal('orderCount') }}</strong>
                  </div>
                  <div>
                    <span class="muted">待支付订单</span>
                    <strong>{{ dashboard?.orderCounts?.pending ?? 0 }}</strong>
                  </div>
                </div>
                <div class="trend-charts">
                  <div class="trend-chart" @mouseleave="clearTrendHover" @mousemove="setTrendHover($event, 'paidAmount')">
                    <div class="trend-chart-head">
                      <span>收款金额</span>
                    </div>
                    <div class="trend-plot">
                      <svg viewBox="0 0 320 116" preserveAspectRatio="none" aria-hidden="true">
                        <polygon :points="trendArea('paidAmount')" class="trend-area trend-area-money" />
                        <polyline :points="trendPolyline('paidAmount')" class="trend-line trend-line-money" />
                        <template v-if="trendHoverPoint('paidAmount')">
                          <line
                            class="trend-marker-line"
                            :x1="trendHoverPoint('paidAmount')!.x"
                            :x2="trendHoverPoint('paidAmount')!.x"
                            y1="10"
                            y2="106"
                          />
                        </template>
                      </svg>
                      <span
                        v-if="trendHoverPoint('paidAmount')"
                        class="trend-marker trend-marker-money"
                        :style="trendPointStyle('paidAmount')"
                      />
                      <div v-if="trendHoverPoint('paidAmount')" class="trend-tooltip" :style="{ left: `${trendHoverPoint('paidAmount')!.x / 3.2}%` }">
                        {{ trendTooltipText('paidAmount') }}
                      </div>
                    </div>
                  </div>
                  <div class="trend-chart" @mouseleave="clearTrendHover" @mousemove="setTrendHover($event, 'orderCount')">
                    <div class="trend-chart-head">
                      <span>订单数量</span>
                    </div>
                    <div class="trend-plot">
                      <svg viewBox="0 0 320 116" preserveAspectRatio="none" aria-hidden="true">
                        <polygon :points="trendArea('orderCount')" class="trend-area trend-area-count" />
                        <polyline :points="trendPolyline('orderCount')" class="trend-line trend-line-count" />
                        <template v-if="trendHoverPoint('orderCount')">
                          <line
                            class="trend-marker-line"
                            :x1="trendHoverPoint('orderCount')!.x"
                            :x2="trendHoverPoint('orderCount')!.x"
                            y1="10"
                            y2="106"
                          />
                        </template>
                      </svg>
                      <span
                        v-if="trendHoverPoint('orderCount')"
                        class="trend-marker trend-marker-count"
                        :style="trendPointStyle('orderCount')"
                      />
                      <div v-if="trendHoverPoint('orderCount')" class="trend-tooltip" :style="{ left: `${trendHoverPoint('orderCount')!.x / 3.2}%` }">
                        {{ trendTooltipText('orderCount') }}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="trend-range-label">
                  {{ trendRangeLabel() }}
                </div>
              </div>
            </section>

            <div class="overview-columns">
              <section class="panel overview-panel">
                <div class="section-title">
                  <h2>需要操作</h2>
                </div>
                <n-empty class="overview-empty" description="暂无需要处理的事项" />
              </section>

              <section class="panel overview-panel">
                <div class="section-title">
                  <h2>系统健康</h2>
                  <n-button text type="primary" @click="refreshDashboard">重新检查</n-button>
                </div>
                <n-empty v-if="!systemHealthItems().length" class="overview-empty" description="暂无通道异常" />
                <div v-else class="overview-health-list">
                  <div v-for="item in systemHealthItems()" :key="item.label" class="overview-health-item">
                    <div>
                      <strong>{{ item.label }}</strong>
                      <small>{{ item.details }}</small>
                    </div>
                    <span class="order-status" :class="healthStatusClass(item.status)">{{ healthStatusText(item.status) }}</span>
                  </div>
                </div>
              </section>
            </div>

            <div class="overview-single-column">
              <section class="panel overview-panel">
                <div class="section-title">
                  <h2>最近订单</h2>
                  <n-button text type="primary" @click="openTab('orders')">查看全部</n-button>
                </div>
                <n-empty v-if="!dashboard?.recentOrders?.length" description="暂无最近订单" />
                <div v-else class="orders-table overview-orders-table">
                  <div class="orders-table-head order-row--plain">
                    <span>订单</span>
                    <span>状态</span>
                    <span>金额</span>
                    <span>收款方式</span>
                    <span>创建时间</span>
                  </div>
                  <AdminOrderRow
                    v-for="order in dashboard.recentOrders"
                    :key="order.id"
                    compact
                    :order="order"
                    @open="openOrderDetail"
                  />
                </div>
              </section>
            </div>

          </div>

          <div v-else-if="tab === 'orders'" class="orders-view grid">
            <div class="section-title">
              <h2>订单</h2>
              <div class="topbar-actions">
                <n-button :loading="orderTestLoading" type="primary" @click="createCheckoutTestOrder">生成测试订单</n-button>
                <n-button :loading="ordersLoading" @click="loadOrders">刷新</n-button>
              </div>
            </div>
            <section class="orders-workbench">
              <div class="orders-toolbar">
                <div class="order-status-tabs">
                  <button
                    v-for="item in orderStatusOptions"
                    :key="item.value"
                    :class="{ 'is-active': orderStatus === item.value }"
                    type="button"
                    @click="setOrderStatus(item.value)"
                  >
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value === 'all' ? orderStatusCount('total') : orderStatusCount(item.countKey) }}</strong>
                  </button>
                </div>
                <n-input v-model:value="orderSearch" clearable placeholder="搜索订单号/付款地址/交易哈希" />
              </div>
              <div class="orders-bulkbar">
                <span>{{ selectedOrderCount ? `已选择 ${selectedOrderCount} 个订单` : `共 ${orderTotal} 个订单` }}</span>
                <div v-if="selectedOrderCount" class="orders-bulk-actions">
                  <n-button :disabled="!selectedPendingCount" :loading="ordersLoading" size="small" @click="checkSelectedOrders">检查付款</n-button>
                  <n-popconfirm @positive-click="deleteSelectedOrders">
                    <template #trigger>
                      <n-button :loading="ordersLoading" size="small" tertiary type="error">删除所选</n-button>
                    </template>
                    删除后不可恢复，同时会删除相关回调记录。
                  </n-popconfirm>
                  <n-button size="small" quaternary @click="orderSelectedIds = []">清空选择</n-button>
                </div>
              </div>

              <div class="orders-table">
                <div class="orders-table-head">
                  <span>
                    <n-checkbox
                      :checked="allCurrentPageSelected"
                      :disabled="!orders.length"
                      :indeterminate="someCurrentPageSelected"
                      @update:checked="toggleCurrentPageOrders"
                    />
                  </span>
                  <span>订单</span>
                  <span>状态</span>
                  <span>金额</span>
                  <span>收款方式</span>
                  <span>创建时间</span>
                </div>
                <div v-if="ordersLoading" class="orders-empty">正在加载订单</div>
                <n-empty v-else-if="!orders.length" description="暂无订单" />
                <template v-else>
                  <AdminOrderRow
                    v-for="order in orders"
                    :key="order.id"
                    :order="order"
                    selectable
                    :selected="orderSelectedIds.includes(order.id)"
                    @open="openOrderDetail"
                    @select="(checked: boolean) => toggleOrderSelection(order.id, checked)"
                  />
                </template>
              </div>
              <div v-if="orderTotal" class="orders-pagination">
                <span>共 {{ orderTotal }} 个订单</span>
                <n-pagination
                  v-model:page="orderPage"
                  v-model:page-size="orderPageSize"
                  :item-count="orderTotal"
                  :page-sizes="[10, 20, 50, 100]"
                  show-size-picker
                />
              </div>
            </section>

            <n-modal v-model:show="orderDetailVisible">
              <n-card
                closable
                class="order-detail-modal"
                role="dialog"
                aria-modal="true"
                @close="orderDetailVisible = false"
              >
                <template #header>
                  <div class="order-detail-title">
                    <span>订单详细</span>
                    <n-tag v-if="orderDetail?.order" :class="orderStatusClass(orderDetail.order.status)" size="small">
                      {{ orderStatusText(orderDetail.order.status) }}
                    </n-tag>
                  </div>
                </template>
                <n-spin :show="orderDetailLoading">
                  <div v-if="orderDetail?.order" class="order-detail-body">
                    <div class="order-detail-tools">
                      <n-button
                        v-if="orderDetailPending()"
                        :loading="orderDetailAction === 'check'"
                        secondary
                        size="small"
                        @click="checkDetailOrderPayment"
                      >
                        <span class="tool-button-content">
                          <span class="tool-icon tool-icon-check"></span>
                          <span>检查付款</span>
                        </span>
                      </n-button>
                      <n-popconfirm
                        v-if="orderDetailPending()"
                        negative-text="取消"
                        positive-text="确认付款"
                        @positive-click="confirmDetailOrderPayment"
                      >
                        <template #trigger>
                          <n-button :loading="orderDetailAction === 'confirm'" secondary size="small" type="warning">
                            <span class="tool-button-content">
                              <span class="tool-icon tool-icon-confirm"></span>
                              <span>确认付款</span>
                            </span>
                          </n-button>
                        </template>
                        将直接认为此订单已支付，并执行相关通知。
                      </n-popconfirm>
                      <n-button
                        v-if="orderDetailPaid()"
                        :loading="orderDetailAction === 'notify'"
                        secondary
                        size="small"
                        @click="resendDetailOrderNotify"
                      >
                        <span class="tool-button-content">
                          <span class="tool-icon tool-icon-notify"></span>
                          <span>重发通知</span>
                        </span>
                      </n-button>
                      <n-button
                        :loading="orderDetailAction === 'delete'"
                        secondary
                        size="small"
                        type="error"
                        @click="deleteDetailOrder"
                      >
                        <span class="tool-button-content">
                          <span class="tool-icon tool-icon-delete"></span>
                          <span>删除订单</span>
                        </span>
                      </n-button>
                    </div>
                    <section class="order-detail-section">
                      <div class="detail-grid">
                        <div class="detail-item">
                          <span>订单号</span>
                          <div class="detail-copy-row">
                            <strong>{{ orderDetail.order.id }}</strong>
                            <n-button size="small" secondary @click="copyOrderId(orderDetail.order.id)">复制</n-button>
                          </div>
                        </div>
                        <div class="detail-item">
                          <span>商户</span>
                          <strong>{{ orderDetail.merchant?.name || orderDetail.order.merchant_id || '--' }}</strong>
                        </div>
                        <div class="detail-item detail-item-wide">
                          <span>订单信息</span>
                          <strong>{{ orderDetail.order.description || '--' }}</strong>
                        </div>
                        <div class="detail-item">
                          <span>客户信息</span>
                          <strong>{{ orderCustomerText(orderDetail.order) }}</strong>
                        </div>
                        <div class="detail-item">
                          <span>创建时间</span>
                          <strong>{{ formatOrderTime(orderDetail.order.created_at) }}</strong>
                        </div>
                      </div>
                    </section>

                    <section class="order-detail-section">
                      <h3>收款信息</h3>
                      <div class="detail-grid">
                        <div class="detail-item">
                          <span>订单金额</span>
                          <strong>{{ formatOrderAmount(orderDetail.order.amount) }} {{ currencyLabel(orderDetail.order.currency) }}</strong>
                        </div>
                        <div class="detail-item">
                          <span>应付金额</span>
                          <strong>{{ orderDetail.order.payment?.amount ? `${formatOrderAmount(orderDetail.order.payment.amount)} ${currencyLabel(orderDetail.order.payment.currency)}` : '--' }}</strong>
                        </div>
                        <div class="detail-item">
                          <span>汇率</span>
                          <strong>{{ orderRateText(orderDetail) }}</strong>
                        </div>
                        <div class="detail-item">
                          <span>收款通道</span>
                          <strong>{{ orderDetail.payway?.name || orderPaywayLabel(orderDetail.order) }}</strong>
                        </div>
                        <div class="detail-item detail-item-wide">
                          <span>收款地址</span>
                          <strong>{{ orderPaymentTarget(orderDetail.order) || '--' }}</strong>
                        </div>
                        <div v-if="orderDetailPaid()" class="detail-item detail-item-wide">
                          <span>交易哈希</span>
                          <a
                            v-if="txExplorerUrl(orderDetail.order)"
                            class="detail-link"
                            :href="txExplorerUrl(orderDetail.order)"
                            rel="noreferrer"
                            target="_blank"
                          >
                            {{ orderDetail.order.payment?.tx?.hash }}
                          </a>
                          <strong v-else>{{ orderDetail.order.payment?.tx?.hash || '--' }}</strong>
                        </div>
                        <div v-if="orderDetailPaid()" class="detail-item">
                          <span>确认方式</span>
                          <strong>{{ orderConfirmMethodText(orderDetail.order) }}</strong>
                        </div>
                        <div v-if="orderDetailPaid()" class="detail-item">
                          <span>{{ orderConfirmTimeLabel(orderDetail.order) }}</span>
                          <strong>{{ orderConfirmTimeText(orderDetail.order) }}</strong>
                        </div>
                      </div>
                    </section>

                    <section v-if="orderDetail.order.payment?.review" class="order-detail-section">
                      <h3>审核凭证</h3>
                      <div class="detail-grid">
                        <div class="detail-item">
                          <span>提交时间</span>
                          <strong>{{ formatOrderTime(orderDetail.order.payment.review.submittedAt) }}</strong>
                        </div>
                        <div class="detail-item">
                          <span>状态</span>
                          <strong>待审核</strong>
                        </div>
                        <div class="detail-item detail-item-wide">
                          <span>付款确认</span>
                          <strong class="detail-review-answer">{{ orderDetail.order.payment.review.answer }}</strong>
                        </div>
                        <div class="detail-item detail-item-wide">
                          <span>付款截图</span>
                          <img class="detail-review-image" :src="orderDetail.order.payment.review.image" alt="付款截图" />
                        </div>
                      </div>
                    </section>

                    <section class="order-detail-section">
                      <h3>通知记录</h3>
                      <n-empty v-if="!orderDetail.notify?.length" description="暂无通知记录" />
                      <div v-else class="notify-list">
                        <div v-for="item in orderDetail.notify" :key="item.id" class="notify-item">
                          <strong>{{ notifyStatusText(item.status) }}</strong>
                          <span>尝试 {{ item.attempts }} 次 / 下次 {{ formatOrderTime(item.next_run_at) }}</span>
                          <small v-if="item.last_error">{{ item.last_error }}</small>
                        </div>
                      </div>
                    </section>
                  </div>
                </n-spin>
              </n-card>
            </n-modal>
          </div>

          <div v-else-if="tab === 'payments'" class="grid">
            <div class="section-title">
              <div>
                <h2>收款通道</h2>
              </div>
              <n-button type="primary" @click="openPaymentForm">添加收款通道</n-button>
            </div>
            <section class="panel grid">
              <n-empty v-if="!payments.length" description="暂无收款通道" />
              <div v-for="item in payments" :key="item.id" class="list-card pay-card">
                <div class="pay-card-main">
                  <span v-if="paymentIcon(item.driver, item.fields?.network)" class="pay-icon">
                    <img :src="paymentIcon(item.driver, item.fields?.network)" :alt="paymentIconLabel(item.driver, item.fields?.network)" />
                  </span>
                  <div>
                    <strong>{{ item.name }} <span class="muted">#{{ item.id }}</span></strong>
                    <p>{{ networkName(item.fields?.network || item.driver) }} / {{ item.enabled ? '已启用' : '已禁用' }}</p>
                    <div class="chip-row readonly">
                      <span v-for="coin in parseCoins(item.fields?.currencies)" :key="`${item.id}-${coin}`">{{ currencyLabel(coin) }}</span>
                      <span v-if="!parseCoins(item.fields?.currencies).length">--</span>
                    </div>
                    <p>{{ item.fields?.address || item.fields?.account || '--' }}</p>
                  </div>
                </div>
                <div class="form-actions">
                  <n-button size="small" @click="editPayment(item)">编辑</n-button>
                  <n-button size="small" tertiary type="error" @click="removePayment(item.id)">删除</n-button>
                </div>
              </div>
            </section>

            <n-modal
              :show="paymentModalVisible"
              @update:show="(show: boolean) => !show && closePaymentModal()"
            >
              <n-card
                :title="paymentIsEdit ? '编辑收款通道' : '新增收款通道'"
                closable
                class="payment-modal-card"
                role="dialog"
                aria-modal="true"
                @close="closePaymentModal"
              >
                <div class="payment-modal-body grid">
                  <div class="form-section grid">
                    <h3>通道名称</h3>
                    <n-input v-model:value="paymentForm.name" placeholder="用于识别此收款通道" />
                    <div v-if="paymentIsEdit" class="switch-line">
                      <span>是否启用</span>
                      <n-switch v-model:value="paymentForm.enabled" />
                    </div>
                  </div>

                  <div v-if="paymentIsEdit && selectedDriver" class="form-section">
                    <h3>通道</h3>
                    <div class="readonly-channel">
                      <span v-if="paymentIcon(paymentForm.driver, currentNetwork)" class="pay-icon">
                        <img :src="paymentIcon(paymentForm.driver, currentNetwork)" :alt="paymentIconLabel(paymentForm.driver, currentNetwork)" />
                      </span>
                      <div>
                        <strong>{{ selectedDriver.name }}</strong>
                        <p>{{ paymentKindName(paymentKind) }}</p>
                      </div>
                    </div>
                  </div>

                  <div v-if="!paymentIsEdit" class="form-section">
                    <h3>类型</h3>
                    <div class="choice-grid">
                      <button
                        v-for="item in paymentKinds"
                        :key="item.key"
                        :class="{ 'is-active': paymentKind === item.key }"
                        type="button"
                        @click="selectPaymentKind(item.key)"
                      >
                        <strong>{{ item.label }}</strong>
                      </button>
                    </div>
                  </div>

                  <div v-if="!paymentIsEdit" class="form-section">
                    <h3>收款网络/平台</h3>
                    <n-empty v-if="!visibleDrivers.length" :description="paymentKind === 'wallet' ? '当前还没有第三方钱包驱动。' : '当前类型下没有可用驱动。'" />
                    <div v-else class="network-choice-grid">
                      <button
                        v-for="driver in visibleDrivers"
                        :key="driver.id"
                        :class="{ 'is-active': paymentForm.driver === driver.id }"
                        type="button"
                        @click="selectPaymentDriver(driver.id)"
                      >
                        <span class="choice-driver-title">
                          <img
                            v-if="paymentIcon(driver.id, driverChoiceNetwork(driver))"
                            class="choice-driver-icon"
                            :src="paymentIcon(driver.id, driverChoiceNetwork(driver))"
                            :alt="paymentIconLabel(driver.id, driverChoiceNetwork(driver))"
                          />
                          <strong>{{ driver.name }}</strong>
                        </span>
                      </button>
                    </div>
                    <div v-if="!paymentIsEdit && selectedDriver?.id === 'chain/evm'" class="grid">
                      <div class="chip-row">
                        <button
                          v-for="network in selectedDriver.networks"
                          :key="network"
                          :class="{ 'is-active': evmNetworks.includes(network) }"
                          type="button"
                          @click="toggleEvmNetwork(network)"
                        >
                          <img v-if="paymentIcon('chain/evm', network)" class="chip-icon" :src="paymentIcon('chain/evm', network)" :alt="paymentIconLabel('chain/evm', network)" />
                          {{ networkName(network) }}
                        </button>
                      </div>
                      <p class="muted">一个地址支持接收多个EVM网络的资产，如需单独指定地址，需单独新增。</p>
                    </div>
                  </div>

                  <div v-if="selectedDriver" class="form-section grid">
                    <h3>币种</h3>
                    <template v-if="!paymentIsEdit && selectedDriver.id === 'chain/evm'">
                      <div v-for="network in evmNetworks" :key="network" class="form-field-block">
                        <strong>{{ networkName(network) }} 币种</strong>
                        <div class="chip-row">
                          <button
                            v-for="coin in supportedCoins(selectedDriver, network)"
                            :key="`${network}-${coin}`"
                            :class="{ 'is-active': evmSelection[network]?.includes(coin) }"
                            type="button"
                            @click="toggleEvmCoin(network, coin)"
                          >
                            {{ currencyLabel(coin) }}
                          </button>
                        </div>
                      </div>
                    </template>
                    <div v-else-if="coinOptions.length">
                      <div class="chip-row">
                        <button v-for="coin in coinOptions" :key="coin" :class="{ 'is-active': selectedCoins.includes(coin) }" type="button" @click="toggleCoin(coin)">
                          {{ currencyLabel(coin) }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-if="selectedDriver" class="form-section grid">
                    <h3>收款信息</h3>
                    <template v-for="field in editablePaymentFields" :key="field.key">
                      <div class="form-field-block">
                        <n-form-item
                          :rule="paymentFieldRule(field)"
                          :show-feedback="Boolean(paymentFieldRule(field))"
                          :show-label="false"
                          class="field-form-item"
                        >
                          <n-select
                            v-if="field.options?.length"
                            v-model:value="(paymentForm.fields as any)[field.key]"
                            :options="field.options.map((item:string) => ({ label: item, value: item }))"
                            :placeholder="field.label"
                          />
                          <n-input
                            v-else
                            v-model:value="(paymentForm.fields as any)[field.key]"
                            :placeholder="field.label"
                            :type="field.type === 'textarea' ? 'textarea' : 'text'"
                          />
                        </n-form-item>
                        <small v-if="field.help" class="field-help">{{ field.help }}</small>
                      </div>
                    </template>
                  </div>
                </div>

                <template #footer>
                  <div class="modal-actions">
                    <n-button secondary @click="closePaymentModal">取消</n-button>
                    <n-button type="primary" :loading="paymentLoading" @click="savePayment">{{ paymentIsEdit ? '保存' : '新增' }}</n-button>
                  </div>
                </template>
              </n-card>
            </n-modal>

            <n-modal :show="Boolean(paymentDeleteTarget)" @update:show="(show: boolean) => !show && cancelRemovePayment()">
              <n-card
                title="删除收款通道"
                class="payment-modal-card"
                role="dialog"
                aria-modal="true"
                closable
                @close="cancelRemovePayment"
              >
                <div class="grid">
                  <p>确定删除 <strong>{{ paymentDeleteTarget?.name }}</strong> 吗？</p>
                  <p class="muted">删除后，可能影响未付款的订单，并且历史订单可能会出现信息异常的问题。</p>
                </div>
                <template #footer>
                  <div class="modal-actions">
                    <n-button secondary @click="cancelRemovePayment">取消</n-button>
                    <n-button type="error" @click="confirmRemovePayment">删除</n-button>
                  </div>
                </template>
              </n-card>
            </n-modal>
          </div>

          <div v-else-if="tab === 'merchants'" class="grid">
            <div class="section-title">
              <div>
                <h2>商户列表</h2>
              </div>
              <n-button type="primary" @click="openMerchantForm">新增商户</n-button>
            </div>
            <section class="panel grid">
              <n-empty v-if="!merchants.length" description="暂无商户" />
              <div v-for="item in merchants" :key="item.id" class="list-card merchant-card is-clickable" @click="editMerchant(item)">
                <div class="merchant-card-main">
                  <div class="merchant-card-title">
                    <strong>{{ item.name }}</strong>
                    <span class="merchant-type-tag">{{ item.type === 'telegram' ? 'Telegram 机器人' : '网站' }}</span>
                  </div>
                  <p>最近下单：{{ item.last_used_at ? formatOrderTime(item.last_used_at) : '暂无订单' }}</p>
                  <p>回调 URL：{{ item.callback_url || '未配置' }}</p>
                </div>
                <div class="merchant-card-actions" @click.stop>
                  <n-button size="small" quaternary @click="editMerchant(item)">编辑</n-button>
                  <div class="merchant-status-control">
                    <span>{{ item.status === 'active' ? '启用' : '停用' }}</span>
                    <n-switch
                      :value="item.status"
                      checked-value="active"
                      unchecked-value="paused"
                      @update:value="(value: string) => toggleMerchantStatus(item, value)"
                    />
                  </div>
                </div>
              </div>
            </section>

            <n-modal :show="merchantModalVisible" @update:show="(show: boolean) => !show && closeMerchantModal()">
              <n-card
                :title="merchantIsEdit ? '编辑商户' : '新增商户'"
                closable
                class="payment-modal-card"
                role="dialog"
                aria-modal="true"
                @close="closeMerchantModal"
              >
                <div class="payment-modal-body grid">
                  <div class="form-section grid">
                    <h3>商户名称</h3>
                    <n-input v-model:value="merchantForm.name" placeholder="用于标识商户" />
                    <div v-if="merchantIsEdit" class="switch-line">
                      <span>是否启用</span>
                      <n-switch v-model:value="merchantForm.status" checked-value="active" unchecked-value="paused" />
                    </div>
                  </div>

                  <div class="form-section">
                    <h3>商户类型</h3>
                    <div class="choice-grid">
                      <button
                        v-for="item in merchantTypes"
                        :key="item.key"
                        :class="{ 'is-active': merchantForm.type === item.key }"
                        type="button"
                        @click="merchantForm.type = item.key"
                      >
                        <strong>{{ item.label }}</strong>
                      </button>
                    </div>
                    <p class="muted">{{ merchantTypeDescription }}</p>
                  </div>

                  <div class="form-section grid">
                    <h3>回调 URL</h3>
                    <n-input v-model:value="merchantForm.callback_url" placeholder="https://merchant.example.com/callback" />
                    <p class="muted merchant-doc-help">
                      <span>在订单状态更新时，将会向此地址进行异步通知。你可以稍后修改这个参数。</span>
                      <a class="text-link" href="/docs/merchant-api" target="_blank" rel="noreferrer">开发文档</a>
                    </p>
                  </div>

                  <div class="form-section grid">
                    <div class="credential-title-row">
                      <h3>接入凭据</h3>
                      <n-popconfirm
                        v-if="merchantIsEdit"
                        negative-text="取消"
                        positive-text="重置"
                        @positive-click="resetMerchantKey"
                      >
                        <template #trigger>
                          <n-button :loading="merchantLoading" secondary size="small" type="warning">重置</n-button>
                        </template>
                        重置后，旧私钥签名将无法通过验签。系统会生成新的私钥，请立即保存。
                      </n-popconfirm>
                    </div>
                    <div class="credential-grid credential-grid-single">
                      <div v-if="currentMerchant" class="credential-field">
                        <span>商户 ID</span>
                        <div class="detail-copy-row">
                          <strong>{{ currentMerchant.id }}</strong>
                          <n-button secondary size="small" @click="copyMerchantId(currentMerchant.id)">复制</n-button>
                        </div>
                      </div>
                      <div v-if="currentMerchant" class="form-field-block">
                        <span class="field-label">公钥</span>
                        <n-input
                          :value="currentMerchant.public_key || ''"
                          :input-props="{ style: { overflowWrap: 'normal', whiteSpace: 'pre' }, wrap: 'off' }"
                          readonly
                          placeholder="暂无公钥"
                          type="textarea"
                          :autosize="{ minRows: 5, maxRows: 10 }"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <template #footer>
                  <div class="modal-actions">
                    <n-button v-if="merchantIsEdit && currentMerchant" secondary type="error" @click="removeMerchant(currentMerchant.id)">删除商户</n-button>
                    <span class="modal-actions-spacer"></span>
                    <n-button secondary @click="closeMerchantModal">取消</n-button>
                    <n-button :loading="merchantLoading" type="primary" @click="saveMerchant">{{ merchantIsEdit ? '保存' : '新增' }}</n-button>
                  </div>
                </template>
              </n-card>
            </n-modal>

            <n-modal :show="Boolean(merchantCredential)" @update:show="(show: boolean) => !show && closeMerchantCredential()">
              <n-card
                title="接入凭据"
                closable
                class="payment-modal-card"
                role="dialog"
                aria-modal="true"
                @close="closeMerchantCredential"
              >
                <div class="payment-modal-body grid">
                  <div class="credential-field">
                    <span>商户 ID</span>
                    <strong>{{ merchantCredential?.merchantId }}</strong>
                  </div>
                  <div class="form-field-block">
                    <div class="credential-title-row">
                      <span class="field-label">私钥</span>
                    </div>
                    <n-input
                      :value="merchantCredential?.privateKey || ''"
                      readonly
                      placeholder="-----BEGIN PRIVATE KEY-----"
                      type="textarea"
                      :autosize="{ minRows: 8, maxRows: 14 }"
                    />
                    <small class="field-help">私钥用于请求签名，仅显示一次，请妥善保存。</small>
                  </div>
                </div>

                <template #footer>
                  <div class="modal-actions">
                    <n-button secondary @click="closeMerchantCredential">关闭</n-button>
                    <n-button type="primary" @click="copyMerchantPrivateKey">复制私钥</n-button>
                  </div>
                </template>
              </n-card>
            </n-modal>
          </div>

          <div v-else class="grid">
            <div class="section-title"><h2>设置</h2></div>
            <div class="panel grid">
              <div class="section-title"><h2>站点</h2></div>
              <div class="form-grid two">
                <label class="field-stack">
                  <span>站点地址</span>
                  <n-input v-model:value="settings.domain" placeholder="https://hashpay.example.com" />
                </label>
              </div>
            </div>
            <div class="panel grid">
              <div class="section-title"><h2>货币</h2></div>
              <div class="form-grid two">
                <label class="field-stack">
                  <span>基础货币</span>
                  <n-select v-model:value="settings.currency" :options="currencyOptions" />
                  <small>系统基础货币，作为换算、统计及下单的默认货币</small>
                </label>
                <label class="field-stack">
                  <span>汇率微调</span>
                  <n-input-number v-model:value="settings.rate_adjust" :max="200" :min="-99" placeholder="如 1 或 -0.5" :step="0.1">
                    <template #suffix>%</template>
                  </n-input-number>
                  <small>调整法币与目标币种的汇率。值越大，兑换比例越大。</small>
                </label>
              </div>
              <div class="rate-preview-box">
                <div>
                  <span class="muted">汇率预览</span>
                  <strong>{{ formatRate(previewRate('USDT')?.effective_rate) }} {{ settings.currency || 'CNY' }} ≈ 1 USDT</strong>
                </div>
                <p v-if="Number(settings.rate_adjust || 0)" class="muted">
                  原始汇率 {{ formatRate(previewRate('USDT')?.market_rate) }} {{ settings.currency || 'CNY' }} ≈ 1 USDT
                </p>
                <p v-if="settings.rate_preview?.message" class="muted">{{ settings.rate_preview.message }}</p>
              </div>
            </div>
            <div class="panel grid">
              <div class="section-title"><h2>交易检测</h2></div>
              <n-form class="settings-form" label-placement="top" :model="settings" :show-require-mark="false">
                <n-grid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="12">
                  <n-form-item-gi label="订单超时" path="timeout" :show-feedback="false">
                    <div class="setting-form-control">
                      <n-input-number v-model:value="settings.timeout" :max="30" :min="1" placeholder="30">
                        <template #suffix>分钟</template>
                      </n-input-number>
                      <small>有效范围 1 - 30 分钟。</small>
                    </div>
                  </n-form-item-gi>
                  <n-form-item-gi label="快速确认" path="fast_confirm" :show-feedback="false">
                    <div class="setting-form-control">
                      <div class="setting-switch-control">
                        <n-switch v-model:value="settings.fast_confirm" checked-value="true" unchecked-value="false" />
                      </div>
                      <small>不等待目标网络交易确认区块数达到安全值。可提升交易确认速度，风险性较低。</small>
                    </div>
                  </n-form-item-gi>
                </n-grid>
              </n-form>
              <n-button type="primary" @click="saveSettings">保存设置</n-button>
            </div>
            <div class="panel grid">
              <div class="section-title"><h2>Banner</h2></div>
              <n-upload accept="image/*" :custom-request="uploadBanner" :max="1" :show-file-list="false">
                <div class="banner-upload-frame">
                  <img class="banner-preview" :src="bannerPreviewUrl" alt="HashPay banner" />
                  <div class="banner-upload-overlay">
                    <n-button :loading="bannerUploading" type="primary">{{ bannerUploading ? '正在上传' : '上传图片' }}</n-button>
                    <span>点击或拖拽图片到这里</span>
                  </div>
                </div>
              </n-upload>
              <p class="banner-guideline">推荐比例 2:1，建议 1080 x 540，最低 600 x 300。图片会用于 Telegram 收款消息。</p>
              <div class="form-actions">
                <n-button :loading="bannerRestoring" secondary @click="restoreBanner">恢复默认</n-button>
              </div>
            </div>
          </div>
        </n-layout-content>
      </n-layout>
    </n-layout-content>
  </n-layout>
</template>
