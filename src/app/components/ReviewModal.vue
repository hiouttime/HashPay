<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import * as pay from "@/app/payments";
import { api } from "@/app/api";
import {
  ceilDisplayAmount,
  formatExactDisplayAmount as formatExactAmount,
  formatIntegerDisplayAmount as formatIntegerAmount,
} from "@/app/utils/amount-format";

const props = defineProps<{
  order: any;
  orderId: string;
  payment: any;
  selectedAsset?: string;
  selectedNetwork?: string;
  selectedOption?: pay.CheckoutOption;
  show: boolean;
}>();

const emit = defineEmits<{
  submitted: [];
  "update:show": [show: boolean];
}>();

const message = useMessage();
const answers = ref<Record<string, string>>({});
const image = ref("");
const imageName = ref("");
const loading = ref(false);
const returnStep = ref(0);
const step = ref(0);
const txid = ref("");

const visible = computed({
  get: () => props.show,
  set: (show) => emit("update:show", show),
});
const questions = computed(() => {
  const asset = pay.assetKey(props.payment?.currency || props.selectedAsset || "usdt");
  const network = pay.networkKey(props.payment?.network || props.selectedNetwork || "trc20");
  const amount = Number(props.payment?.amount || props.selectedOption?.amount || props.order?.amount || 0);
  const networkCorrect = props.payment?.networkName || pay.networkName(network);
  const assetCorrect = pay.assetName(asset);
  const amountCorrect = `${formatExactAmount(amount)} ${assetCorrect}`;
  return [
    {
      correct: networkCorrect,
      id: "network",
      options: options(networkCorrect, pay.reviewNetworkOptions()),
      risk: `看起来你使用了错误的网络发送代币，你应使用 ${networkCorrect}。\n这种情况，你的付款可能存在丢失风险。`,
      title: "你通过哪种网络完成付款？",
    },
    {
      correct: assetCorrect,
      id: "asset",
      options: options(assetCorrect, pay.reviewAssetOptions()),
      risk: `看起来你支付了错误的币种，你应支付 ${assetCorrect}。\n这种情况，你的付款可能存在丢失风险。`,
      title: "你支付了哪种币种？",
    },
    {
      correct: amountCorrect,
      id: "amount",
      options: amountOptions(amount, assetCorrect, amountCorrect),
      risk: "由于区块链的匿名性，系统仅能依靠金额区分订单，如果您没有按照系统的指示支付金额，则您的付款可能会确认到其他订单上。\n这种情况，您的付款很可能无效。",
      title: "提现时，最终到账金额是多少？",
    },
  ];
});
const question = computed(() => questions.value[step.value]);
const credentialStep = computed(() => step.value >= questions.value.length);
const finalRisk = computed(() => {
  const wrong = questions.value.find((item) => answers.value[item.id] && answers.value[item.id] !== item.correct);
  return `${wrong?.risk ?? "这可能是交易网络存在一些问题导致无法确认，非常抱歉给您带来不便。"}\n\n不过，你可以上传付款信息来让我们帮你核实。`;
});
const canNext = computed(() => Boolean(question.value && answers.value[question.value.id]));
const canSubmit = computed(() => credentialStep.value && Boolean(txid.value.trim()) && Boolean(image.value));

watch(() => props.show, (show) => {
  if (show) reset();
});

function reset() {
  answers.value = {};
  image.value = "";
  imageName.value = "";
  returnStep.value = 0;
  step.value = 0;
  txid.value = "";
}

function choose(questionId: string, answer: string) {
  answers.value = { ...answers.value, [questionId]: answer };
}

function next() {
  const item = question.value;
  if (!item || !answers.value[item.id]) {
    message.warning("请先选择一个答案");
    return;
  }
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

async function upload(options: { file: { file?: File | null }; onError?: () => void; onFinish?: () => void }) {
  const file = options.file.file;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    message.warning("请上传图片");
    options.onError?.();
    return;
  }
  if (file.size > 2_000_000) {
    message.warning("图片不能超过 2MB");
    options.onError?.();
    return;
  }
  try {
    imageName.value = file.name;
    image.value = await fileToDataUrl(file);
    options.onFinish?.();
  } catch {
    options.onError?.();
  }
}

async function submit() {
  if (!txid.value.trim()) {
    message.warning("请填写交易编号");
    return;
  }
  if (!image.value) {
    message.warning("请上传付款截图");
    return;
  }
  loading.value = true;
  try {
    await api.checkout.review(props.orderId, {
      answer: answerText(),
      image: image.value,
    });
    visible.value = false;
    emit("submitted");
    message.success("已提交，等待管理员审核");
  } finally {
    loading.value = false;
  }
}

function answerText() {
  return [
    ...questions.value.map((item) => `${item.title}\n${answers.value[item.id] || "未继续询问"}`),
    `交易哈希/TXID/交易编号/转账ID\n${txid.value.trim()}`,
  ].join("\n\n");
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
  let out = props.orderId.length;
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
      title="检查付款信息"
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
                @click="choose(question.id, option)"
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
            placeholder="交易哈希/TXID/交易编号/转账ID"
          />
          <n-upload
            accept="image/*"
            :custom-request="upload"
            directory-dnd
            :max="1"
            :show-file-list="false"
          >
            <n-upload-dragger>
              <div class="checkout-upload-dragger">
                <strong>{{ imageName || '上传付款截图' }}</strong>
                <span>请上传钱包/交易所或支付平台中的付款信息截图。</span>
              </div>
            </n-upload-dragger>
          </n-upload>
        </template>
      </div>
      <template #footer>
        <div class="modal-actions">
          <n-button v-if="step === 0" @click="visible = false">取消</n-button>
          <n-button v-else @click="previous">上一步</n-button>
          <n-button v-if="!credentialStep" :disabled="!canNext" type="primary" @click="next">下一步</n-button>
          <n-button v-else :disabled="!canSubmit" :loading="loading" type="primary" @click="submit">提交审核</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>
