package bot

import tele "gopkg.in/telebot.v4"

func (b *Bot) NotifyPaid(orderID string) {
	b.updateOrder(orderID, "✅ 订单已支付", paymentDoneMarkup(""))
}

func (b *Bot) NotifyExpired(orderID string) {
	b.updateOrder(orderID, "⚠️ 订单已过期", nil)
}

func (b *Bot) updateOrder(orderID, caption string, markup *tele.ReplyMarkup) {
	b.mu.Lock()
	msg, ok := b.orderMsg[orderID]
	b.mu.Unlock()
	if !ok {
		return
	}
	_, _ = b.bot.EditCaption(msg, caption, &tele.SendOptions{ReplyMarkup: markup})
}
