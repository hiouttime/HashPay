<script setup lang="ts">
import { ref } from "vue";
import { useRoute } from "vue-router";
import { useMessage } from "naive-ui";
import PaymentDetails from "@/app/components/PaymentDetails.vue";
import PaymentSelector from "@/app/components/PaymentSelector.vue";
import ReviewModal from "@/app/components/ReviewModal.vue";
import {
  isExpired,
  isPaid,
  isPending,
  remainingPercentage,
  remainingText,
  returnUrl,
  shouldAskPaymentReview,
  statusText,
  statusType,
  timeText,
  txUrl,
  useCheckout,
} from "@/app/pages/pay";
import * as pay from "@/app/payments";
import { formatDisplayAmount as formatAmount } from "@/app/utils/amount-format";
import { copyText } from "@/app/utils/clipboard";

const route = useRoute();
const message = useMessage();
const orderId = String(route.params.id);
const reviewVisible = ref(false);
const {
  changePayment,
  changingPayment,
  checkout,
  load,
  nowMs,
  paidReturnSeconds,
  paymentOptions,
  returnToMerchant,
  selectPayment,
} = useCheckout(orderId, message);

function shortText(value: unknown, start = 10, end = 8) {
  const text = String(value || "");
  return text.length > start + end + 3 ? `${text.slice(0, start)}...${text.slice(-end)}` : text;
}
</script>

<template>
  <n-layout class="checkout-shell">
    <n-layout-header class="checkout-topbar">
      <div class="checkout-topbar-inner">
        <div class="checkout-brand">
          <strong>HashPay</strong>
          <span>收银台</span>
        </div>
      </div>
    </n-layout-header>

    <n-layout-content v-if="checkout" class="checkout-content" content-class="checkout-page">
      <section class="checkout-receipt">
        <div class="checkout-receipt-head">
          <div>
            <span>商户</span>
            <strong>{{ checkout.merchant.name || 'HashPay' }}</strong>
          </div>
          <n-tag :type="statusType(checkout.order, nowMs)">{{ statusText(checkout.order, nowMs) }}</n-tag>
        </div>
        <div class="checkout-amount-block">
          <span>订单金额</span>
          <strong>{{ formatAmount(checkout.order.amount) }} {{ pay.assetName(checkout.order.currency) }}</strong>
        </div>
        <div v-if="isPending(checkout.order) && !isExpired(checkout.order, nowMs)" class="checkout-countdown">
          <n-progress
            type="circle"
            :percentage="remainingPercentage(checkout.order, nowMs)"
            :stroke-width="6"
            color="#16a34a"
            rail-color="#e5e7eb"
          >
            <div class="checkout-countdown-content">
              <span>剩余付款时间</span>
              <strong>{{ remainingText(checkout.order, nowMs) }}</strong>
            </div>
          </n-progress>
        </div>
        <dl class="checkout-receipt-meta">
          <div>
            <dt>订单号</dt>
            <dd>
              <code>{{ checkout.order.id }}</code>
              <n-button size="tiny" text type="primary" @click="copyText(checkout.order.id, { message })">复制</n-button>
            </dd>
          </div>
          <div>
            <dt>订单信息</dt>
            <dd>{{ checkout.order.description || '网页收银台订单' }}</dd>
          </div>
          <div>
            <dt>最后付款时间</dt>
            <dd>{{ timeText(checkout.order.expireAt) }}</dd>
          </div>
        </dl>
      </section>

      <section class="checkout-flow" :class="{ 'checkout-flow--paid': isPaid(checkout.order) }">
        <template v-if="isPaid(checkout.order)">
          <div class="checkout-paid-state">
            <div class="checkout-paid-mark">✓</div>
            <div>
              <strong>谢谢</strong>
              <span>你的付款已被确认。</span>
            </div>
          </div>
          <dl class="checkout-paid-meta">
            <div>
              <dt>收款方式</dt>
              <dd>{{ checkout.order.payment.networkName || pay.networkName(checkout.order.payment.network) }} / {{ checkout.order.payment.currencyName || pay.assetName(checkout.order.payment.currency) }}</dd>
            </div>
            <div>
              <dt>到账金额</dt>
              <dd>{{ formatAmount(checkout.order.payment.amount) }} {{ checkout.order.payment.currencyName || pay.assetName(checkout.order.payment.currency) }}</dd>
            </div>
            <div v-if="checkout.order.payment.tx?.txid">
              <dt>交易记录</dt>
              <dd>
                <a v-if="txUrl(checkout.order.payment)" :href="txUrl(checkout.order.payment)" target="_blank" rel="noreferrer">查看交易</a>
                <span v-else>{{ shortText(checkout.order.payment.tx.txid, 10, 8) }}</span>
              </dd>
            </div>
          </dl>
          <div v-if="returnUrl(checkout.order)" class="checkout-return-actions">
            <n-button block type="primary" @click="returnToMerchant">返回商户</n-button>
            <span>{{ paidReturnSeconds }} 秒后返回商户</span>
          </div>
          <p v-else class="checkout-return-hint">请返回商户页面继续</p>
        </template>

        <template v-else-if="isExpired(checkout.order, nowMs)">
          <div class="checkout-expired-state">
            <strong>订单已过期</strong>
            <span>请勿继续付款，继续付款可能会导致您的财产损失。</span>
            <span>如您需要继续付款，请返回商户重新下单。</span>
          </div>
          <n-button v-if="returnUrl(checkout.order)" block type="primary" @click="returnToMerchant">返回商户</n-button>
          <n-button block secondary type="warning" @click="reviewVisible = true">已付款，仍未到账</n-button>
        </template>

        <template v-else-if="checkout.order.payment.driver && !changingPayment">
          <PaymentDetails
            :payment="checkout.order.payment"
            :show-review="shouldAskPaymentReview(checkout.order, nowMs)"
            @change="changePayment"
            @review="reviewVisible = true"
          />
        </template>

        <template v-else>
          <PaymentSelector
            :disabled="isExpired(checkout.order, nowMs)"
            :options="paymentOptions"
            @select="selectPayment"
          />
        </template>
      </section>
    </n-layout-content>

    <n-layout-content v-else class="checkout-content" content-class="checkout-page">
      <section class="checkout-receipt checkout-skeleton-card">
        <div class="checkout-skeleton-head">
          <div>
            <span class="skeleton-line skeleton-text"></span>
            <span class="skeleton-line skeleton-title"></span>
          </div>
          <span class="skeleton-line checkout-skeleton-tag"></span>
        </div>
        <div class="checkout-skeleton-amount">
          <span class="skeleton-line skeleton-text"></span>
          <span class="skeleton-line"></span>
        </div>
        <div class="checkout-skeleton-countdown">
          <span class="checkout-skeleton-circle"></span>
        </div>
        <div class="checkout-skeleton-meta">
          <span class="skeleton-line"></span>
          <span class="skeleton-line"></span>
        </div>
      </section>

      <section class="checkout-flow checkout-skeleton-card">
        <div class="checkout-flow-head">
          <span class="skeleton-line skeleton-text"></span>
          <span class="skeleton-line skeleton-title"></span>
        </div>
        <div class="checkout-skeleton-step-back">
          <span class="skeleton-line skeleton-text"></span>
          <span class="skeleton-line skeleton-title"></span>
        </div>
        <div class="checkout-skeleton-network-list">
          <div class="checkout-skeleton-network-option">
            <span class="checkout-skeleton-icon"></span>
            <span class="skeleton-line"></span>
          </div>
          <div class="checkout-skeleton-network-option">
            <span class="checkout-skeleton-icon"></span>
            <span class="skeleton-line"></span>
          </div>
          <div class="checkout-skeleton-network-option">
            <span class="checkout-skeleton-icon"></span>
            <span class="skeleton-line"></span>
          </div>
        </div>
      </section>
    </n-layout-content>

    <ReviewModal
      v-model:show="reviewVisible"
      v-if="checkout"
      :order="checkout.order"
      :order-id="orderId"
      :payment="checkout.order.payment"
      @submitted="load"
    />
  </n-layout>
</template>
