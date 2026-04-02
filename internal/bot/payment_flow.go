package bot

import (
	"fmt"
	stdhtml "html"
	"net/url"
	"sort"
	"strings"
	"time"

	"hashpay/internal/model"
	"hashpay/internal/pkg/log"

	"github.com/shopspring/decimal"
	tele "gopkg.in/telebot.v4"
)

const (
	callbackPayCurrency   = "pay_currency"
	callbackPayNetwork    = "pay_network"
	callbackPayCurrencies = "pay_currencies"
	callbackPayPending    = "pay_pending"
	callbackHelpTopic     = "help_topic"
	callbackHelpNetwork   = "help_network"
	callbackHelpToken     = "help_token"
	callbackHelpAmount    = "help_amount"
	callbackHelpReview    = "help_review"
)

func normalizeCurrency(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func normalizeChain(chain string) string {
	return strings.ToLower(strings.TrimSpace(chain))
}

func networkLabel(chain string) string {
	switch normalizeChain(chain) {
	case "tron":
		return "TRON (TRC20)"
	case "eth":
		return "Ethereum (ERC20)"
	case "bsc":
		return "BNB Smart Chain (BEP20)"
	case "polygon":
		return "Polygon"
	case "solana":
		return "Solana"
	case "ton":
		return "TON"
	default:
		return strings.ToUpper(strings.TrimSpace(chain))
	}
}

func amountKey(v float64) string {
	return decimal.NewFromFloat(v).RoundCeil(3).StringFixed(3)
}

func normalizeAddress(chain, addr string) string {
	value := strings.TrimSpace(addr)
	if value == "" {
		return ""
	}
	switch normalizeChain(chain) {
	case "eth", "bsc", "polygon", "evm":
		return strings.ToLower(value)
	default:
		return value
	}
}

func payRequesterLabel(name string) string {
	value := strings.TrimSpace(name)
	if value == "" {
		return "有人"
	}
	return stdhtml.EscapeString(value)
}

func (b *Bot) renderCurrencyMenu(order *model.Order, requester string) (string, *tele.ReplyMarkup, error) {
	payments, err := b.payments.GetEnabled()
	if err != nil {
		return "", nil, err
	}

	msg := fmt.Sprintf("%s 向你收款 %s %s\n", payRequesterLabel(requester), formatAmount(order.Amount), normalizeCurrency(order.Currency))
	msg += "你想使用什么币种支付？"

	currencySet := map[string]struct{}{}
	for _, p := range payments {
		for _, curr := range paymentCoins(p) {
			currencySet[curr] = struct{}{}
		}
	}

	if len(currencySet) == 0 {
		return msg + "\n\n暂无可用收款币种。", nil, nil
	}

	currencies := make([]string, 0, len(currencySet))
	for curr := range currencySet {
		currencies = append(currencies, curr)
	}
	sort.Strings(currencies)

	keyboard := &tele.ReplyMarkup{}
	rows := make([]tele.Row, 0, len(currencies))
	for _, curr := range currencies {
		rows = append(rows, keyboard.Row(
			keyboard.Data(curr, callbackPayCurrency, order.ID, curr),
		))
	}
	keyboard.Inline(rows...)
	return msg, keyboard, nil
}

func (b *Bot) renderNetworkMenu(order *model.Order, currency, requester string) (string, *tele.ReplyMarkup, error) {
	payments, err := b.payments.GetEnabled()
	if err != nil {
		return "", nil, err
	}

	curr := normalizeCurrency(currency)
	convertAmount := b.rates.Convert(order.Amount, order.Currency, curr)
	chainSet := map[string]struct{}{}
	for _, p := range payments {
		if !paymentSupportsCurrency(p, curr) {
			continue
		}
		chain := normalizeChain(p.Chain)
		if chain == "" {
			continue
		}
		chainSet[chain] = struct{}{}
	}

	msg := fmt.Sprintf("%s 向你收款 %s %s\n", payRequesterLabel(requester), formatAmount(order.Amount), normalizeCurrency(order.Currency))
	msg += fmt.Sprintf("需支付 %s %s\n", convertAmount.StringFixed(3), curr)
	msg += "你想使用什么网络进行支付？"

	keyboard := &tele.ReplyMarkup{}
	if len(chainSet) == 0 {
		keyboard.Inline(keyboard.Row(
			keyboard.Data("重新选择币种", callbackPayCurrencies, order.ID),
		))
		return msg + "\n\n该币种暂无可用网络。", keyboard, nil
	}

	chains := make([]string, 0, len(chainSet))
	for chain := range chainSet {
		chains = append(chains, chain)
	}
	sort.Slice(chains, func(i, j int) bool {
		return networkLabel(chains[i]) < networkLabel(chains[j])
	})

	rows := make([]tele.Row, 0, len(chains)+1)
	for _, chain := range chains {
		rows = append(rows, keyboard.Row(
			keyboard.Data(networkLabel(chain), callbackPayNetwork, order.ID, curr, chain),
		))
	}
	rows = append(rows, keyboard.Row(
		keyboard.Data("重新选择币种", callbackPayCurrencies, order.ID),
	))
	keyboard.Inline(rows...)
	return msg, keyboard, nil
}

func (b *Bot) selectPaymentForNetwork(order *model.Order, currency, chain string) (*model.Payment, float64, float64, error) {
	payments, err := b.payments.GetEnabled()
	if err != nil {
		return nil, 0, 0, err
	}

	targetCurrency := normalizeCurrency(currency)
	targetChain := normalizeChain(chain)

	candidates := make([]model.Payment, 0)
	for _, p := range payments {
		if !paymentSupportsCurrency(p, targetCurrency) {
			continue
		}
		if normalizeChain(p.Chain) != targetChain {
			continue
		}
		if strings.TrimSpace(p.Address) == "" {
			continue
		}
		candidates = append(candidates, p)
	}
	if len(candidates) == 0 {
		return nil, 0, 0, fmt.Errorf("无可用地址")
	}

	pendingOrders, err := b.orders.GetPending()
	if err != nil {
		return nil, 0, 0, err
	}

	addrLoad := map[string]int{}
	addrAmounts := map[string]map[string]struct{}{}
	for _, item := range pendingOrders {
		if normalizeCurrency(item.PayCurrency) != targetCurrency {
			continue
		}
		if normalizeChain(item.PayChain) != targetChain {
			continue
		}
		addrKey := normalizeAddress(targetChain, item.PayAddr)
		if addrKey == "" {
			continue
		}
		addrLoad[addrKey]++
		if addrAmounts[addrKey] == nil {
			addrAmounts[addrKey] = map[string]struct{}{}
		}
		if item.PayAmount > 0 {
			addrAmounts[addrKey][amountKey(item.PayAmount)] = struct{}{}
		}
	}

	selected := candidates[0]
	selectedKey := normalizeAddress(targetChain, selected.Address)
	minLoad := addrLoad[selectedKey]
	for _, p := range candidates[1:] {
		key := normalizeAddress(targetChain, p.Address)
		load := addrLoad[key]
		if load < minLoad {
			selected = p
			selectedKey = key
			minLoad = load
		}
	}

	baseAmount := b.rates.Convert(order.Amount, order.Currency, targetCurrency)
	finalAmount := baseAmount
	step := decimal.RequireFromString("0.001")
	used := addrAmounts[selectedKey]
	for used != nil {
		key := finalAmount.StringFixed(3)
		if _, exists := used[key]; !exists {
			break
		}
		finalAmount = finalAmount.Add(step)
	}

	return &selected, baseAmount.InexactFloat64(), finalAmount.InexactFloat64(), nil
}

func (b *Bot) buildSelectedPaymentCaption(order *model.Order, payment *model.Payment, baseAmount, finalAmount float64) string {
	_ = baseAmount
	network := stdhtml.EscapeString(networkLabel(payment.Chain))
	currencyCode := strings.ToUpper(strings.TrimSpace(order.PayCurrency))
	if currencyCode == "" {
		currencyCode = strings.ToUpper(strings.TrimSpace(payment.Currency))
	}
	currency := stdhtml.EscapeString(currencyCode)
	address := stdhtml.EscapeString(order.PayAddr)
	orderID := stdhtml.EscapeString(order.ID)
	amount := stdhtml.EscapeString(decimal.NewFromFloat(finalAmount).RoundCeil(3).StringFixed(3))
	expireAt := stdhtml.EscapeString(order.ExpireAt.Local().Format("2006-01-02 15:04:05"))

	msg := fmt.Sprintf("<b>请通过 %s 网络，转账 %s</b>\n", network, currency)
	msg += "网络或币种不符将无法确认充值，且可能会丢失资金。\n\n"
	msg += "<b>接受地址，可使用App扫码：</b>\n"
	msg += fmt.Sprintf("<pre>%s</pre>\n", address)
	msg += "<b>付款金额；必须完全一致，请勿多付：</b>\n"
	msg += fmt.Sprintf("<pre>%s</pre>\n", amount)
	msg += "<b>遇到问题？您可提供此订单号：</b>\n"
	msg += fmt.Sprintf("<pre>%s</pre>\n", orderID)
	msg += "<b>在此时间前完成支付，超时请勿继续付款：</b>\n"
	msg += fmt.Sprintf("<pre>%s</pre>", expireAt)
	return msg
}

func (b *Bot) buildSelectedPaymentMarkup(order *model.Order) *tele.ReplyMarkup {
	return b.buildSelectedPaymentMarkupWithHelp(order, false)
}

func (b *Bot) buildSelectedPaymentMarkupWithHelp(order *model.Order, withHelp bool) *tele.ReplyMarkup {
	keyboard := &tele.ReplyMarkup{}
	rows := []tele.Row{
		keyboard.Row(
			keyboard.Data("更换币种", callbackPayCurrencies, order.ID),
		),
	}
	if withHelp {
		link := b.orderHelpLink(order.ID)
		if link != "" {
			rows = append(rows, keyboard.Row(
				keyboard.URL("需要帮助？", link),
			))
		}
	}
	keyboard.Inline(rows...)
	return keyboard
}

func (b *Bot) buildSelectedPaymentPhoto(order *model.Order, payment *model.Payment, baseAmount, finalAmount float64) (*tele.Photo, *tele.ReplyMarkup) {
	qrURL := "https://quickchart.io/qr?size=360&text=" + url.QueryEscape(strings.TrimSpace(order.PayAddr))
	caption := b.buildSelectedPaymentCaption(order, payment, baseAmount, finalAmount)
	return &tele.Photo{
		File:    tele.FromURL(qrURL),
		Caption: caption,
	}, b.buildSelectedPaymentMarkup(order)
}

func (b *Bot) handlePayCurrency(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}

	parts := strings.Split(strings.TrimSpace(c.Data()), "|")
	if len(parts) != 2 {
		return c.RespondText("参数错误")
	}
	orderID := strings.TrimSpace(parts[0])
	currency := normalizeCurrency(parts[1])

	order, err := b.orders.GetByID(orderID)
	if err != nil {
		return c.RespondText("订单不存在")
	}
	if order.Status != model.OrderPending || time.Now().After(order.ExpireAt) {
		return c.RespondText("订单已失效")
	}
	if expireAt, err := b.orders.RefreshExpire(order.ID); err != nil {
		log.Error("重置订单超时失败: order=%s err=%v", order.ID, err)
		return c.RespondText("操作失败，请重试")
	} else {
		order.ExpireAt = expireAt
	}

	text, keyboard, err := b.renderNetworkMenu(order, currency, displayUserName(cb.Sender))
	if err != nil {
		log.Error("加载网络列表失败: order=%s currency=%s err=%v", order.ID, currency, err)
		return c.RespondText("加载网络失败")
	}
	_ = c.Respond()
	if keyboard == nil {
		return c.Edit(text)
	}
	return c.Edit(text, &tele.SendOptions{ReplyMarkup: keyboard})
}

func (b *Bot) handlePayNetwork(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}

	parts := strings.Split(strings.TrimSpace(c.Data()), "|")
	if len(parts) != 3 {
		return c.RespondText("参数错误")
	}
	orderID := strings.TrimSpace(parts[0])
	currency := normalizeCurrency(parts[1])
	chain := normalizeChain(parts[2])

	order, err := b.orders.GetByID(orderID)
	if err != nil {
		return c.RespondText("订单不存在")
	}
	if order.Status != model.OrderPending || time.Now().After(order.ExpireAt) {
		return c.RespondText("订单已失效")
	}
	if expireAt, err := b.orders.RefreshExpire(order.ID); err != nil {
		log.Error("重置订单超时失败: order=%s err=%v", order.ID, err)
		return c.RespondText("操作失败，请重试")
	} else {
		order.ExpireAt = expireAt
	}

	payment, baseAmount, finalAmount, err := b.selectPaymentForNetwork(order, currency, chain)
	if err != nil {
		log.Error("分配收款地址失败: order=%s currency=%s chain=%s err=%v", order.ID, currency, chain, err)
		return c.RespondText("当前网络不可用")
	}

	if err := b.orders.SetPayment(order.ID, payment.Chain, currency, payment.Address, finalAmount); err != nil {
		log.Error("更新订单支付方式失败: order=%s chain=%s err=%v", order.ID, payment.Chain, err)
		return c.RespondText("更新订单失败")
	}

	order.PayAddr = payment.Address
	order.PayAmount = finalAmount
	order.PayCurrency = currency
	order.PayChain = payment.Chain
	b.storeOrderCallback(order.ID, cb)
	b.scheduleHelpPrompt(order)

	photo, keyboard := b.buildSelectedPaymentPhoto(order, payment, baseAmount, finalAmount)
	text := b.buildSelectedPaymentCaption(order, payment, baseAmount, finalAmount)
	_ = c.Respond()
	if _, err := b.bot.Edit(c.Callback(), photo, &tele.SendOptions{ReplyMarkup: keyboard, ParseMode: tele.ModeHTML}); err != nil {
		if isBenignBotError(err) {
			return nil
		}
		log.Warn("编辑二维码消息失败，回退文本: order=%s err=%v", order.ID, err)
		if keyboard == nil {
			return c.Edit(text, tele.ModeHTML)
		}
		return c.Edit(text, &tele.SendOptions{ReplyMarkup: keyboard, ParseMode: tele.ModeHTML})
	}
	return nil
}

func (b *Bot) handlePayCurrencies(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}

	orderID := strings.TrimSpace(c.Data())
	b.cancelHelpPrompt(orderID)
	order, err := b.orders.GetByID(orderID)
	if err != nil {
		return c.RespondText("订单不存在")
	}
	if order.Status != model.OrderPending || time.Now().After(order.ExpireAt) {
		return c.RespondText("订单已失效")
	}
	if expireAt, err := b.orders.RefreshExpire(order.ID); err != nil {
		log.Error("重置订单超时失败: order=%s err=%v", order.ID, err)
		return c.RespondText("操作失败，请重试")
	} else {
		order.ExpireAt = expireAt
	}
	if strings.TrimSpace(order.PayChain) != "" || strings.TrimSpace(order.PayAddr) != "" || order.PayAmount > 0 {
		if err := b.orders.ClearPayment(order.ID); err != nil {
			log.Error("清理订单收款参数失败: order=%s err=%v", order.ID, err)
			return c.RespondText("切换失败，请重试")
		}
		log.Info("订单监听已取消，等待重新选择: order=%s", order.ID)
		order.PayChain = ""
		order.PayCurrency = ""
		order.PayAddr = ""
		order.PayAmount = 0
	}

	text, keyboard, err := b.renderCurrencyMenu(order, displayUserName(cb.Sender))
	if err != nil {
		log.Error("加载币种列表失败: order=%s err=%v", order.ID, err)
		return c.RespondText("加载币种失败")
	}
	_ = c.Respond()

	// 订单消息可能已被编辑为二维码图片，这里优先替换为非二维码占位图。
	placeholder := &tele.Photo{
		File:    tele.FromURL("https://upload.wikimedia.org/wikipedia/commons/c/ce/Transparent.gif"),
		Caption: text,
	}
	if _, err := b.bot.Edit(c.Callback(), placeholder, &tele.SendOptions{ReplyMarkup: keyboard, ParseMode: tele.ModeHTML}); err == nil || isBenignBotError(err) {
		return nil
	}

	if keyboard == nil {
		return c.Edit(text, tele.ModeHTML)
	}
	return c.Edit(text, &tele.SendOptions{ReplyMarkup: keyboard, ParseMode: tele.ModeHTML})
}

func (b *Bot) handlePayPending(c tele.Context) error {
	return c.RespondText("订单创建中，请稍候…")
}
