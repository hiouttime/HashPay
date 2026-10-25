<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useMessage } from "naive-ui";
import type { UploadFileInfo } from "naive-ui";
import * as pay from "@/app/payments";
import { api, type Order } from "@/app/api";
import { useI18n } from "@/app/i18n";
import { prepareReviewImage } from "@/app/utils/images";
import {
  ceilDisplayAmount,
  formatExactDisplayAmount as formatExactAmount,
  formatIntegerDisplayAmount as formatIntegerAmount,
} from "@/app/utils/format";

const props = defineProps<{
  order: Order;
  show: boolean;
}>();

const emit = defineEmits<{
  submitted: [];
  "update:show": [show: boolean];
}>();

const message = useMessage();
const { t } = useI18n();
const answers = ref<Record<string, string>>({});
const image = shallowRef<{ name: string; blob: Blob } | null>(null);
const imageTask = shallowRef<Promise<Blob> | null>(null);
const imageProcessing = computed(() => imageTask.value !== null);
const loading = ref(false);
const returnStep = ref(0);
const step = ref(0);
const txid = ref("");

const visible = computed({
  get: () => props.show,
  set: (show) => emit("update:show", show),
});
const questions = computed(() => {
  const asset = pay.assetKey(props.order.payment.currency ?? "usdt");
  const network = pay.networkKey(props.order.payment.driver ?? "trc20");
  const amount = props.order.payment.amount ?? props.order.amount;
  const networkCorrect = pay.networkName(network);
  const assetCorrect = pay.assetName(asset);
  const amountCorrect = `${formatExactAmount(amount)} ${assetCorrect}`;
  return [
    {
      correct: networkCorrect,
      id: "network",
      options: options(networkCorrect, pay.reviewNetworkOptions()),
      risk: t("review.network_risk", { network: networkCorrect }),
      title: t("review.network_question"),
    },
    {
      correct: assetCorrect,
      id: "asset",
      options: options(assetCorrect, pay.reviewAssetOptions()),
      risk: t("review.asset_risk", { asset: assetCorrect }),
      title: t("review.asset_question"),
    },
    {
      correct: amountCorrect,
      id: "amount",
      options: amountOptions(amount, assetCorrect, amountCorrect),
      risk: t("review.amount_risk"),
      title: t("review.amount_question"),
    },
  ];
});
const question = computed(() => questions.value[step.value]);
const credentialStep = computed(() => step.value >= questions.value.length);
const finalRisk = computed(() => {
  const wrong = questions.value.find((item) => answers.value[item.id] && answers.value[item.id] !== item.correct);
  return `${wrong?.risk ?? t("review.network_issue")}\n\n${t("review.upload_help_suffix")}`;
});
const canNext = computed(() => Boolean(question.value && answers.value[question.value.id]));
const canSubmit = computed(() => credentialStep.value && !imageProcessing.value && Boolean(txid.value.trim()) && Boolean(image.value));

watch(() => props.show, (show) => {
  imageTask.value = null;
  if (show) reset();
});

onBeforeUnmount(() => { imageTask.value = null; });

function reset() {
  answers.value = {};
  image.value = null;
  returnStep.value = 0;
  step.value = 0;
  txid.value = "";
}

function next() {
  const item = question.value!;
  returnStep.value = step.value;
  if (answers.value[item.id] !== item.correct || step.value >= questions.value.length - 1) {
    step.value = questions.value.length;
    return;
  }
  step.value += 1;
}

function previous() {
  if (credentialStep.value) {
    step.value = returnStep.value;
    return;
  }
  step.value = Math.max(0, step.value - 1);
}

async function selectImage(options: { file: UploadFileInfo }): Promise<false> {
  const file = options.file.file;
  if (!file) return false;
  const task = prepareReviewImage(file);
  imageTask.value = task;
  try {
    const blob = await task;
    if (imageTask.value === task) image.value = { name: file.name, blob };
  } catch {
    if (imageTask.value === task) message.warning(t("review.image_process_failed"));
  } finally {
    if (imageTask.value === task) imageTask.value = null;
  }
  return false;
}

async function submit() {
  if (!canSubmit.value || loading.value) return;
  loading.value = true;
  try {
    await api.checkout.review(props.order.id, {
      answer: answerText(),
      image: image.value!.blob,
    });
    visible.value = false;
    emit("submitted");
    message.success(t("review.submitted"));
  } finally {
    loading.value = false;
  }
}

function answerText() {
  return [
    ...questions.value.map((item) => `${item.title}\n${answers.value[item.id] || t("review.not_asked")}`),
    `${t("review.tx_label")}\n${txid.value.trim()}`,
  ].join("\n\n");
}

function options(correct: string, candidates: string[]) {
  const distractors = shuffle(candidates.filter((item) => item !== correct)).slice(0, 3);
  return shuffle([correct, ...distractors]);
}

function amountOptions(amount: number, asset: string, correct: string) {
  const wrong = Number.isInteger(ceilDisplayAmount(amount))
    ? [
        `${formatExactAmount(amount + 1)} ${asset}`,
        `${formatExactAmount(amount - 1.5)} ${asset}`,
        `${formatExactAmount(amount - 0.2)} ${asset}`,
      ]
    : [
        `${formatIntegerAmount(amount)} ${asset}`,
        `${formatExactAmount(amount - 1.5)} ${asset}`,
        `${formatExactAmount(amount - 0.2)} ${asset}`,
      ];
  return shuffle([correct, ...wrong]);
}

function shuffle(items: string[]) {
  return [...new Set(items)].sort((left, right) => score(left) - score(right));
}

function score(value: string) {
  let out = props.order.id.length;
  for (let index = 0; index < value.length; index += 1) {
    out = (out * 31 + value.charCodeAt(index)) % 997;
  }
  return out;
}
</script>

<template>
  <n-modal v-model:show="visible">
    <n-card
      closable
      class="checkout-review-modal"
      :title="t('review.title')"
      role="dialog"
      aria-modal="true"
      @close="visible = false"
    >
      <div class="checkout-review-form">
        <template v-if="!credentialStep && question">
          <div class="checkout-review-question">
            <strong>{{ question.title }}</strong>
            <div class="checkout-review-options">
              <button
                v-for="option in question.options"
                :key="option"
                :class="{ 'is-active': answers[question.id] === option }"
                type="button"
                @click="answers[question.id] = option"
              >
                {{ option }}
              </button>
            </div>
          </div>
        </template>
        <template v-else>
          <div v-if="finalRisk" class="checkout-review-help">
            <p>{{ finalRisk }}</p>
          </div>
          <n-input
            v-model:value="txid"
            :placeholder="t('review.tx_label')"
          />
          <n-upload
            accept="image/*"
            :default-upload="false"
            :disabled="imageProcessing || loading"
            :on-before-upload="selectImage"
            directory-dnd
            :max="1"
            :show-file-list="false"
          >
            <n-upload-dragger>
              <div class="checkout-upload-dragger" aria-live="polite" :aria-busy="imageProcessing">
                <strong>{{ imageProcessing ? t('review.image_processing') : image?.name || t('review.upload_screenshot') }}</strong>
                <span>{{ imageProcessing ? t('review.image_wait') : image ? t('review.image_replace') : t('review.screenshot_help') }}</span>
              </div>
            </n-upload-dragger>
          </n-upload>
        </template>
      </div>
      <template #footer>
        <div class="modal-actions">
          <n-button v-if="step === 0" @click="visible = false">{{ t('common.cancel') }}</n-button>
          <n-button v-else @click="previous">{{ t('review.previous') }}</n-button>
          <n-button v-if="!credentialStep" :disabled="!canNext" type="primary" @click="next">{{ t('review.next') }}</n-button>
          <n-button v-else :disabled="!canSubmit" :loading="loading" type="primary" @click="submit">{{ t('review.submit_review') }}</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>
