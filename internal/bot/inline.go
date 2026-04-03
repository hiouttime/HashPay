package bot

import (
	"bytes"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"hashpay/internal/service"
	"hashpay/internal/utils/log"

	"github.com/skip2/go-qrcode"
	tele "gopkg.in/telebot.v4"
)

func (b *Bot) handleInlineQuery(c tele.Context) error {
	query := c.Query()
	if query == nil || query.Sender == nil {
		return nil
	}
	log.Info("Bot inline query %s query=%q", senderText(query.Sender), strings.TrimSpace(query.Text))
	if !b.isAdmin(query.Sender.ID) {
		return c.Answer(&tele.QueryResponse{IsPersonal: true, Results: tele.Results{
			&tele.ArticleResult{Title: "仅管理员可用", Description: "当前账号无权创建订单", Text: "当前账号无权创建订单"},
		}})
	}
	amount, currency, ok := parseInlineAmount(query.Text)
	if !ok {
		return c.Answer(&tele.QueryResponse{IsPersonal: true, Results: tele.Results{
			&tele.ArticleResult{Title: "输入金额创建订单", Description: "示例：20 / 20U / 20CNY", Text: "请输入金额，如 20、20U、20CNY"},
		}})
	}
	app := b.getApp()
	if app == nil {
		return nil
	}
	methods, err := app.Methods()
	if err != nil {
		return nil
	}
	enabled := false
	for _, item := range methods {
		if item.Enabled {
			enabled = true
			break
		}
	}
	if !enabled {
		return nil
	}
	return c.Answer(&tele.QueryResponse{IsPersonal: true, CacheTime: 1, Results: tele.Results{
		&tele.ArticleResult{
			ResultBase:  tele.ResultBase{ID: fmt.Sprintf("%0.3f|%s", amount, currency)},
			Title:       fmt.Sprintf("创建收款 %0.2f %s", amount, currency),
			Description: "发送后选择收款方式",
			Text:        "正在创建订单…",
			ThumbURL:    b.getPublicURL() + RelativeURL(),
		},
	}})
}

func (b *Bot) handleInlineResult(c tele.Context) error {
	result := c.InlineResult()
	if result == nil || result.Sender == nil {
		return nil
	}
	log.Info("Bot inline result %s result=%q msg=%s", senderText(result.Sender), result.ResultID, result.MessageID)
	app := b.getApp()
	if app == nil {
		return nil
	}
	parts := strings.Split(result.ResultID, "|")
	if len(parts) != 2 {
		return nil
	}
	amount, _ := strconv.ParseFloat(parts[0], 64)
	currency := strings.TrimSpace(parts[1])
	order, err := app.InlineOrder(amount, currency, result.Sender.Username)
	if err != nil {
		return nil
	}
	checkout, err := app.BuildCheckout(order.ID)
	if err != nil {
		return nil
	}
	if len(checkout.Routes) == 0 {
		return nil
	}
	text, markup := b.inlineMenu(checkout)
	b.mu.Lock()
	b.orderMsg[order.ID] = tele.StoredMessage{MessageID: result.MessageID}
	b.mu.Unlock()
	return b.editInline(result, text, markup)
}

func (b *Bot) handleRoutePick(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}
	log.Info("Bot callback %s data=%q", senderText(cb.Sender), cb.Data)
	app := b.getApp()
	if app == nil {
		return nil
	}
	parts := strings.Split(cb.Data, "|")
	if len(parts) != 3 {
		return c.Respond()
	}
	methodID, _ := strconv.ParseInt(parts[1], 10, 64)
	route, err := app.SelectRoute(parts[0], methodID, parts[2])
	if err != nil {
		return c.Respond()
	}
	caption := fmt.Sprintf("请使用 %s 网络支付 %0.6f %s", strings.ToUpper(route.Network), route.Amount, route.Currency)
	markup := paymentDoneMarkup(route.Address)
	if route.Kind == "exchange" {
		caption += fmt.Sprintf("\n收款账户：%s", route.AccountName)
		if route.Memo != "" {
			caption += fmt.Sprintf("\n备注：%s", route.Memo)
		}
		if route.Instructions != "" {
			caption += "\n" + route.Instructions
		}
		if cb.Message != nil {
			_, _ = b.bot.EditCaption(cb.Message, caption, &tele.SendOptions{ReplyMarkup: markup})
		} else if cb.MessageID != "" {
			_, _ = b.bot.EditCaption(tele.StoredMessage{MessageID: cb.MessageID}, caption, &tele.SendOptions{ReplyMarkup: markup})
		}
		return c.Respond()
	}

	png, err := qrcode.Encode(route.QRValue, qrcode.Medium, 360)
	if err != nil {
		return c.Respond()
	}
	photo := &tele.Photo{
		File:    tele.FromReader(bytes.NewReader(png)),
		Caption: caption,
	}
	if cb.Message != nil {
		if _, err := b.bot.Edit(cb.Message, photo, &tele.SendOptions{ReplyMarkup: markup}); err == nil {
			b.mu.Lock()
			b.orderMsg[parts[0]] = tele.StoredMessage{MessageID: fmt.Sprintf("%d", cb.Message.ID), ChatID: cb.Message.Chat.ID}
			b.mu.Unlock()
		}
	} else if cb.MessageID != "" {
		if _, err := b.bot.Edit(tele.StoredMessage{MessageID: cb.MessageID}, photo, &tele.SendOptions{ReplyMarkup: markup}); err == nil {
			b.mu.Lock()
			b.orderMsg[parts[0]] = tele.StoredMessage{MessageID: cb.MessageID}
			b.mu.Unlock()
		}
	}
	return c.Respond()
}

func (b *Bot) inlineMenu(checkout *service.Checkout) (string, *tele.ReplyMarkup) {
	text := fmt.Sprintf("收款 %0.2f %s\n选择付款方式", checkout.Order.FiatAmount, checkout.Order.FiatCurrency)
	keys := make([]string, 0, len(checkout.Routes))
	for currency := range checkout.Routes {
		keys = append(keys, currency)
	}
	sort.Strings(keys)

	keyboard := &tele.ReplyMarkup{}
	rows := make([]tele.Row, 0, len(keys))
	for _, currency := range keys {
		items := checkout.Routes[currency]
		for _, item := range items {
			rows = append(rows, keyboard.Row(
				keyboard.Data(fmt.Sprintf("%s · %s", currency, item.Network), "pay", checkout.Order.ID, fmt.Sprintf("%d", item.MethodID), currency),
			))
		}
	}
	keyboard.Inline(rows...)
	return text, keyboard
}

func (b *Bot) editInline(target tele.Editable, text string, markup *tele.ReplyMarkup) error {
	if b.getPublicURL() == "" {
		_, err := b.bot.Edit(target, text, &tele.SendOptions{ReplyMarkup: markup})
		return err
	}
	_, err := b.bot.Edit(target, &tele.Photo{File: tele.FromURL(b.getPublicURL() + RelativeURL()), Caption: text}, &tele.SendOptions{ReplyMarkup: markup})
	return err
}

func paymentDoneMarkup(address string) *tele.ReplyMarkup {
	keyboard := &tele.ReplyMarkup{}
	if strings.TrimSpace(address) == "" {
		keyboard.Inline(keyboard.Row(keyboard.Data("已完成付款", "noop", "done")))
		return keyboard
	}
	keyboard.Inline(keyboard.Row(keyboard.Data("已完成付款", "noop", "done")))
	return keyboard
}

func parseInlineAmount(raw string) (float64, string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, "", false
	}
	if strings.HasSuffix(strings.ToUpper(raw), "U") {
		value, err := strconv.ParseFloat(strings.TrimSuffix(strings.ToUpper(raw), "U"), 64)
		return value, "USDT", err == nil && value > 0
	}
	var num strings.Builder
	var cur strings.Builder
	for _, ch := range raw {
		if (ch >= '0' && ch <= '9') || ch == '.' {
			num.WriteRune(ch)
			continue
		}
		cur.WriteRune(ch)
	}
	value, err := strconv.ParseFloat(num.String(), 64)
	if err != nil || value <= 0 {
		return 0, "", false
	}
	currency := strings.ToUpper(strings.TrimSpace(cur.String()))
	if currency == "" {
		currency = "CNY"
	}
	return value, currency, true
}
