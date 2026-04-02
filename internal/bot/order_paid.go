package bot

import (
	"fmt"
	"strings"

	"hashpay/internal/pkg/log"

	tele "gopkg.in/telebot.v4"
)

func (b *Bot) storeOrderMessage(orderID string, msg tele.StoredMessage) {
	id := strings.TrimSpace(orderID)
	if id == "" || strings.TrimSpace(msg.MessageID) == "" {
		return
	}
	b.orderMsgMu.Lock()
	b.orderMsg[id] = msg
	b.orderMsgMu.Unlock()
}

func (b *Bot) storeOrderCallback(orderID string, cb *tele.Callback) {
	if cb == nil {
		return
	}
	messageID, chatID := cb.MessageSig()
	b.storeOrderMessage(orderID, tele.StoredMessage{
		MessageID: messageID,
		ChatID:    chatID,
	})
}

func (b *Bot) popOrderMessage(orderID string) (tele.StoredMessage, bool) {
	id := strings.TrimSpace(orderID)
	if id == "" {
		return tele.StoredMessage{}, false
	}
	b.orderMsgMu.Lock()
	defer b.orderMsgMu.Unlock()
	msg, ok := b.orderMsg[id]
	if ok {
		delete(b.orderMsg, id)
	}
	return msg, ok
}

func (b *Bot) NotifyOrderPaid(orderID, txHash string) {
	_ = txHash
	b.cancelHelpPrompt(orderID)
	if b.orders == nil {
		return
	}
	order, err := b.orders.GetByID(orderID)
	if err != nil {
		log.Warn("订单确认后读取订单失败: order=%s err=%v", orderID, err)
		return
	}

	amount := formatAmount(order.PayAmount)
	currency := normalizeCurrency(order.PayCurrency)
	if currency == "" {
		currency = normalizeCurrency(order.Currency)
	}
	text := fmt.Sprintf("谢谢，系统已确认你的付款。\n已收到 %s %s", amount, currency)

	if msg, ok := b.popOrderMessage(orderID); ok {
		placeholder := &tele.Photo{
			File:    tele.FromURL("https://upload.wikimedia.org/wikipedia/commons/c/ce/Transparent.gif"),
			Caption: text,
		}
		if _, err := b.bot.Edit(msg, placeholder, &tele.SendOptions{ParseMode: tele.ModeHTML}); err == nil || isBenignBotError(err) {
			b.clearOrderMarkup(msg)
			return
		}
		if _, err := b.bot.EditCaption(msg, text); err == nil || isBenignBotError(err) {
			b.clearOrderMarkup(msg)
			return
		}
		if _, err := b.bot.Edit(msg, text); err == nil || isBenignBotError(err) {
			b.clearOrderMarkup(msg)
			return
		}
		log.Warn("订单确认消息更新失败: order=%s msg_id=%s", orderID, msg.MessageID)
	}
}

func (b *Bot) clearOrderMarkup(msg tele.StoredMessage) {
	if _, err := b.bot.EditReplyMarkup(msg, &tele.ReplyMarkup{}); err != nil && !isBenignBotError(err) {
		log.Warn("清理订单消息按钮失败: msg_id=%s err=%v", msg.MessageID, err)
	}
}
