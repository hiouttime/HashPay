package bot

import (
	"strings"
	"time"

	"hashpay/internal/model"
	"hashpay/internal/pkg/log"

	tele "gopkg.in/telebot.v4"
)

func (b *Bot) orderHelpLink(orderID string) string {
	name := strings.TrimSpace(b.Username())
	if name == "" {
		return ""
	}
	return "https://t.me/" + name + "?start=help_" + strings.TrimSpace(orderID)
}

func (b *Bot) getOrderMessage(orderID string) (tele.StoredMessage, bool) {
	id := strings.TrimSpace(orderID)
	if id == "" {
		return tele.StoredMessage{}, false
	}
	b.orderMsgMu.RLock()
	defer b.orderMsgMu.RUnlock()
	msg, ok := b.orderMsg[id]
	return msg, ok
}

func (b *Bot) cancelHelpPrompt(orderID string) {
	id := strings.TrimSpace(orderID)
	if id == "" {
		return
	}
	b.helpTimerMu.Lock()
	timer := b.helpTimers[id]
	if timer != nil {
		timer.Stop()
		delete(b.helpTimers, id)
	}
	b.helpTimerMu.Unlock()
}

func (b *Bot) scheduleHelpPrompt(order *model.Order) {
	if order == nil {
		return
	}
	orderID := strings.TrimSpace(order.ID)
	if orderID == "" {
		return
	}
	duration := order.ExpireAt.Sub(order.CreatedAt)
	if duration <= 0 {
		return
	}
	target := order.CreatedAt.Add(duration / 3)
	delay := time.Until(target)
	if delay < 0 {
		delay = 0
	}

	b.cancelHelpPrompt(orderID)
	b.helpTimerMu.Lock()
	b.helpTimers[orderID] = time.AfterFunc(delay, func() {
		b.applyHelpPrompt(orderID)
		b.helpTimerMu.Lock()
		delete(b.helpTimers, orderID)
		b.helpTimerMu.Unlock()
	})
	b.helpTimerMu.Unlock()
}

func (b *Bot) applyHelpPrompt(orderID string) {
	order, err := b.orders.GetByID(orderID)
	if err != nil {
		return
	}
	if order.Status != model.OrderPending || time.Now().After(order.ExpireAt) {
		return
	}
	if strings.TrimSpace(order.PayChain) == "" || strings.TrimSpace(order.PayCurrency) == "" || strings.TrimSpace(order.PayAddr) == "" || order.PayAmount <= 0 {
		return
	}
	msg, ok := b.getOrderMessage(orderID)
	if !ok {
		return
	}
	markup := b.buildSelectedPaymentMarkupWithHelp(order, true)
	if _, err := b.bot.EditReplyMarkup(msg, markup); err != nil && !isBenignBotError(err) {
		log.Warn("订单帮助按钮更新失败: order=%s msg_id=%s err=%v", orderID, msg.MessageID, err)
	}
}
