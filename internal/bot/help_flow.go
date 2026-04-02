package bot

import (
	"fmt"
	"sort"
	"strings"

	"hashpay/internal/model"
	"hashpay/internal/pkg/log"

	tele "gopkg.in/telebot.v4"
)

const (
	helpTopicPaidDelay    = "paid_delay"
	helpTopicWrongNetwork = "wrong_network"
	helpTopicWrongToken   = "wrong_token"
	helpTopicWrongAmount  = "wrong_amount"
	helpTopicLookAround   = "look"
)

func (b *Bot) handleOrderHelpStart(c tele.Context, orderID string) error {
	order, err := b.orders.GetByID(strings.TrimSpace(orderID))
	if err != nil {
		return c.Send("订单不存在或已失效。")
	}

	msg := fmt.Sprintf("你想就订单 “%s\" 获取怎样的帮助？", strings.TrimSpace(order.ID))
	keyboard := &tele.ReplyMarkup{}
	keyboard.Inline(
		keyboard.Row(keyboard.Data("我已付款，但仍未到账", callbackHelpTopic, order.ID, helpTopicPaidDelay)),
		keyboard.Row(keyboard.Data("我可能使用了错误的网络", callbackHelpTopic, order.ID, helpTopicWrongNetwork)),
		keyboard.Row(keyboard.Data("我可能发送了错误的代币", callbackHelpTopic, order.ID, helpTopicWrongToken)),
		keyboard.Row(keyboard.Data("我可能发送了错误的金额", callbackHelpTopic, order.ID, helpTopicWrongAmount)),
		keyboard.Row(keyboard.Data("没什么，只是点进来看看", callbackHelpTopic, order.ID, helpTopicLookAround)),
	)
	b.setHelpState(c.Sender().ID, helpState{OrderID: order.ID, AwaitingPhoto: false})
	return c.Send(msg, &tele.SendOptions{ReplyMarkup: keyboard})
}

func (b *Bot) setHelpState(userID int64, state helpState) {
	b.helpStateMu.Lock()
	b.helpStates[userID] = state
	b.helpStateMu.Unlock()
}

func (b *Bot) clearHelpState(userID int64) {
	b.helpStateMu.Lock()
	delete(b.helpStates, userID)
	b.helpStateMu.Unlock()
}

func (b *Bot) getHelpState(userID int64) (helpState, bool) {
	b.helpStateMu.RLock()
	defer b.helpStateMu.RUnlock()
	v, ok := b.helpStates[userID]
	return v, ok
}

func parseHelpData(raw string, n int) ([]string, bool) {
	parts := strings.Split(strings.TrimSpace(raw), "|")
	if len(parts) != n {
		return nil, false
	}
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts, true
}

func (b *Bot) handleHelpTopic(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}
	parts, ok := parseHelpData(c.Data(), 2)
	if !ok {
		return c.RespondText("参数错误")
	}
	orderID, topic := parts[0], parts[1]
	order, err := b.orders.GetByID(orderID)
	if err != nil {
		return c.RespondText("订单不存在")
	}

	_ = c.Respond()
	switch topic {
	case helpTopicPaidDelay:
		return c.Edit(b.helpPaidNetworkText(order), &tele.SendOptions{ReplyMarkup: b.helpPaidNetworkMarkup(order)})
	case helpTopicWrongNetwork:
		b.setHelpState(cb.Sender.ID, helpState{OrderID: order.ID, AwaitingPhoto: true})
		return c.Edit(b.helpWrongNetworkText(order))
	case helpTopicWrongToken:
		b.setHelpState(cb.Sender.ID, helpState{OrderID: order.ID, AwaitingPhoto: false})
		return c.Edit(b.helpWrongTokenText(order))
	case helpTopicWrongAmount:
		b.setHelpState(cb.Sender.ID, helpState{OrderID: order.ID, AwaitingPhoto: true})
		return c.Edit(b.helpWrongAmountText())
	default:
		b.clearHelpState(cb.Sender.ID)
		return c.Edit("好的，如有需要可再次打开帮助入口。")
	}
}

func (b *Bot) handleHelpNetwork(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}
	parts, ok := parseHelpData(c.Data(), 2)
	if !ok {
		return c.RespondText("参数错误")
	}
	orderID, choice := parts[0], normalizeChain(parts[1])
	order, err := b.orders.GetByID(orderID)
	if err != nil {
		return c.RespondText("订单不存在")
	}

	_ = c.Respond()
	if choice == "" || choice == "none" || choice != normalizeChain(order.PayChain) {
		b.setHelpState(cb.Sender.ID, helpState{OrderID: order.ID, AwaitingPhoto: true})
		return c.Edit(b.helpWrongNetworkText(order))
	}

	b.setHelpState(cb.Sender.ID, helpState{OrderID: order.ID, AwaitingPhoto: false})
	return c.Edit("那你发送了何种代币？", &tele.SendOptions{ReplyMarkup: b.helpPaidTokenMarkup(order)})
}

func (b *Bot) handleHelpToken(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}
	parts, ok := parseHelpData(c.Data(), 2)
	if !ok {
		return c.RespondText("参数错误")
	}
	orderID, choice := parts[0], normalizeCurrency(parts[1])
	order, err := b.orders.GetByID(orderID)
	if err != nil {
		return c.RespondText("订单不存在")
	}

	_ = c.Respond()
	expected := normalizeCurrency(order.PayCurrency)
	if choice == "" || choice == "NONE" || choice != expected {
		b.setHelpState(cb.Sender.ID, helpState{OrderID: order.ID, AwaitingPhoto: false})
		return c.Edit(b.helpWrongTokenText(order))
	}

	b.setHelpState(cb.Sender.ID, helpState{OrderID: order.ID, AwaitingPhoto: false})
	msg := fmt.Sprintf("你发送的金额为 %s %s 吗？", formatAmount(order.PayAmount), expected)
	return c.Edit(msg, &tele.SendOptions{ReplyMarkup: b.helpPaidAmountMarkup(order)})
}

func (b *Bot) handleHelpAmount(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}
	parts, ok := parseHelpData(c.Data(), 2)
	if !ok {
		return c.RespondText("参数错误")
	}
	orderID, choice := parts[0], strings.TrimSpace(parts[1])
	order, err := b.orders.GetByID(orderID)
	if err != nil {
		return c.RespondText("订单不存在")
	}

	_ = c.Respond()
	if choice == "yes" {
		b.setHelpState(cb.Sender.ID, helpState{OrderID: order.ID, AwaitingPhoto: true})
		return c.Edit("这可能是区块链确认的时间比预期要长，如果你已经等了有一会了，可以发送一张带有付款详细信息的截图，由管理员进行审核帮助确认。")
	}

	b.setHelpState(cb.Sender.ID, helpState{OrderID: order.ID, AwaitingPhoto: true})
	return c.Edit(b.helpWrongAmountText())
}

func (b *Bot) handlePhoto(c tele.Context) error {
	msg := c.Message()
	if msg == nil || msg.Sender == nil || msg.Photo == nil {
		return nil
	}
	state, ok := b.getHelpState(msg.Sender.ID)
	if !ok || !state.AwaitingPhoto || strings.TrimSpace(state.OrderID) == "" {
		return nil
	}
	order, err := b.orders.GetByID(state.OrderID)
	if err != nil {
		return nil
	}

	admin := &tele.User{ID: b.adminID}
	orderCurrency := normalizeCurrency(order.Currency)
	payCurrency := normalizeCurrency(order.PayCurrency)
	if payCurrency == "" {
		payCurrency = orderCurrency
	}
	text := "ℹ️ 订单需确认\n"
	text += fmt.Sprintf("订单号：%s\n", order.ID)
	text += fmt.Sprintf("订单金额：%s%s\n", formatAmount(order.Amount), orderCurrency)
	text += fmt.Sprintf("应付金额：%s%s\n", formatAmount(order.PayAmount), payCurrency)
	text += fmt.Sprintf("收款地址：%s\n", strings.TrimSpace(order.PayAddr))
	text += "待审核截图："

	reviewMarkup := &tele.ReplyMarkup{}
	reviewMarkup.Inline(
		reviewMarkup.Row(
			reviewMarkup.Data("拒绝", callbackHelpReview, order.ID, "reject"),
			reviewMarkup.Data("批准", callbackHelpReview, order.ID, "approve"),
		),
	)
	if _, err := b.bot.Send(admin, text, &tele.SendOptions{ReplyMarkup: reviewMarkup}); err != nil {
		log.Warn("发送管理员审核提示失败: order=%s err=%v", order.ID, err)
		return nil
	}
	if _, err := b.bot.Send(admin, &tele.Photo{File: msg.Photo.File}); err != nil {
		log.Warn("发送管理员审核截图失败: order=%s err=%v", order.ID, err)
		return nil
	}

	b.clearHelpState(msg.Sender.ID)
	return c.Send("已收到截图，管理员会尽快审核。")
}

func (b *Bot) handleHelpReview(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}
	if !b.isAdmin(cb.Sender.ID) {
		return c.RespondText("仅管理员可操作")
	}

	parts, ok := parseHelpData(c.Data(), 2)
	if !ok {
		return c.RespondText("参数错误")
	}
	orderID := strings.TrimSpace(parts[0])
	action := strings.TrimSpace(parts[1])

	_ = c.Respond()
	switch action {
	case "approve":
		return c.Edit(fmt.Sprintf("✅ 审核结果：已批准\n订单号：%s", orderID))
	case "reject":
		return c.Edit(fmt.Sprintf("❌ 审核结果：已拒绝\n订单号：%s", orderID))
	default:
		return c.RespondText("参数错误")
	}
}

func (b *Bot) helpPaidNetworkText(order *model.Order) string {
	return "根据你的付款信息，你正在使用哪个网络？"
}

func (b *Bot) helpPaidNetworkMarkup(order *model.Order) *tele.ReplyMarkup {
	expected := normalizeChain(order.PayChain)
	options := pickNetworkOptions(expected)
	keyboard := &tele.ReplyMarkup{}
	rows := make([]tele.Row, 0, len(options)+1)
	for _, item := range options {
		rows = append(rows, keyboard.Row(
			keyboard.Data(networkLabel(item), callbackHelpNetwork, order.ID, item),
		))
	}
	rows = append(rows, keyboard.Row(
		keyboard.Data("以上都不是", callbackHelpNetwork, order.ID, "none"),
	))
	keyboard.Inline(rows...)
	return keyboard
}

func (b *Bot) helpPaidTokenMarkup(order *model.Order) *tele.ReplyMarkup {
	expected := normalizeCurrency(order.PayCurrency)
	options := pickTokenOptions(expected)
	keyboard := &tele.ReplyMarkup{}
	rows := make([]tele.Row, 0, len(options)+1)
	for _, item := range options {
		rows = append(rows, keyboard.Row(
			keyboard.Data(item, callbackHelpToken, order.ID, item),
		))
	}
	rows = append(rows, keyboard.Row(
		keyboard.Data("以上都不是", callbackHelpToken, order.ID, "none"),
	))
	keyboard.Inline(rows...)
	return keyboard
}

func (b *Bot) helpPaidAmountMarkup(order *model.Order) *tele.ReplyMarkup {
	keyboard := &tele.ReplyMarkup{}
	keyboard.Inline(
		keyboard.Row(keyboard.Data("是的", callbackHelpAmount, order.ID, "yes")),
		keyboard.Row(keyboard.Data("比这多一点", callbackHelpAmount, order.ID, "more")),
		keyboard.Row(keyboard.Data("比这少一点", callbackHelpAmount, order.ID, "less")),
	)
	return keyboard
}

func (b *Bot) helpWrongNetworkText(order *model.Order) string {
	return fmt.Sprintf("看起来你使用了错误的网络发送代币，你应使用 %s。\n这种情况，你的付款可能无法找回。\n不过，你可以发送一张带有付款详细信息的截图，由管理员进行审核决定。", networkLabel(order.PayChain))
}

func (b *Bot) helpWrongTokenText(order *model.Order) string {
	return fmt.Sprintf("看起来你发送了错误的代币，你应该发送 %s。\n这种情况，你的支付金额可能和系统要求有偏差。\n请您联系付款发起方来沟通进一步的方案。", normalizeCurrency(order.PayCurrency))
}

func (b *Bot) helpWrongAmountText() string {
	return "由于区块链的匿名性，系统仅能依靠金额区分订单，如果您没有按照系统的指示支付金额，则您的付款可能会确认到其他订单上。\n这种情况，您的付款很可能无效。\n不过，可以发送一张带有付款详细信息的截图，由管理员进行审核确认。"
}

func pickNetworkOptions(expected string) []string {
	all := []string{"tron", "eth", "bsc", "polygon", "solana", "ton"}
	exists := map[string]struct{}{}
	result := make([]string, 0, 4)

	if strings.TrimSpace(expected) != "" {
		result = append(result, expected)
		exists[expected] = struct{}{}
	}
	for _, item := range all {
		if _, ok := exists[item]; ok {
			continue
		}
		result = append(result, item)
		exists[item] = struct{}{}
		if len(result) == 4 {
			break
		}
	}
	sort.Strings(result)
	if strings.TrimSpace(expected) != "" {
		// 确保正确选项一定在列表中，且固定在首位便于一致性。
		rest := make([]string, 0, len(result))
		for _, item := range result {
			if item == expected {
				continue
			}
			rest = append(rest, item)
		}
		return append([]string{expected}, rest...)
	}
	return result
}

func pickTokenOptions(expected string) []string {
	all := []string{"USDT", "USDC", "TRX", "TON", "ETH", "BNB", "MATIC", "SOL"}
	exists := map[string]struct{}{}
	result := make([]string, 0, 4)
	expected = normalizeCurrency(expected)
	if expected != "" {
		result = append(result, expected)
		exists[expected] = struct{}{}
	}
	for _, item := range all {
		if _, ok := exists[item]; ok {
			continue
		}
		result = append(result, item)
		exists[item] = struct{}{}
		if len(result) == 4 {
			break
		}
	}
	if expected != "" {
		rest := make([]string, 0, len(result))
		for _, item := range result {
			if item == expected {
				continue
			}
			rest = append(rest, item)
		}
		return append([]string{expected}, rest...)
	}
	return result
}
