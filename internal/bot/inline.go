package bot

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"hashpay/internal/pkg/log"
	"hashpay/internal/service"

	tele "gopkg.in/telebot.v4"
)

const inlineResultPrefix = "order"

func (b *Bot) handleInlineQuery(c tele.Context) error {
	query := c.Query()
	if query == nil || query.Sender == nil {
		return nil
	}
	if !b.isAdmin(query.Sender.ID) {
		return c.Answer(&tele.QueryResponse{
			IsPersonal: true,
			CacheTime:  1,
			Results: tele.Results{
				&tele.ArticleResult{
					Title:       "仅管理员可用",
					Description: "当前账号无权限创建订单",
					Text:        "当前账号无权限创建订单。",
				},
			},
		})
	}

	amount, currency, hasCurrency, ok := parseInlineInput(query.Text)
	if !ok {
		return c.Answer(&tele.QueryResponse{
			IsPersonal: true,
			CacheTime:  1,
			Results: tele.Results{
				&tele.ArticleResult{
					Title:       "输入金额创建收款订单",
					Description: "示例：20 / 20U / 20CNY / 20GBP",
					Text:        "请输入金额，支持 20、20U、20CNY、20GBP。",
				},
			},
		})
	}

	currencies := b.inlineCurrencies(currency, hasCurrency)
	log.Info("收到 inline 查询: uid=%d text=%q amount=%s has_currency=%v currencies=%v", query.Sender.ID, query.Text, formatAmount(amount), hasCurrency, currencies)
	results := make(tele.Results, 0, len(currencies))
	for _, curr := range currencies {
		markup := &tele.ReplyMarkup{}
		markup.Inline(
			markup.Row(markup.Data("创建中…", callbackPayPending, "hold")),
		)
		results = append(results, &tele.ArticleResult{
			ResultBase: tele.ResultBase{
				ID:          buildInlineResultID(amount, curr),
				ReplyMarkup: markup,
			},
			Title:       fmt.Sprintf("发起收款 %s %s", formatAmount(amount), normalizeInlineCurrency(curr)),
			Description: "发送后自动创建订单",
			Text:        fmt.Sprintf("⏳ 正在创建收款订单：%s %s", formatAmount(amount), curr),
		})
	}

	return c.Answer(&tele.QueryResponse{
		IsPersonal: true,
		CacheTime:  1,
		Results:    results,
	})
}

func (b *Bot) handleInlineResult(c tele.Context) error {
	result := c.InlineResult()
	if result == nil || result.Sender == nil {
		return nil
	}
	if !b.isAdmin(result.Sender.ID) {
		return nil
	}

	amount, currency, ok := parseInlineResultID(result.ResultID)
	if !ok {
		log.Warn("inline result id 解析失败: uid=%d result_id=%q", result.Sender.ID, result.ResultID)
		return nil
	}
	if b.orders == nil {
		log.Error("inline 创建订单失败: 订单服务未初始化")
		return nil
	}
	log.Info("收到 inline 订单创建请求: uid=%d amount=%s currency=%s", result.Sender.ID, formatAmount(amount), currency)

	order, err := b.orders.Create(service.CreateOrderRequest{
		Amount:   amount,
		Currency: currency,
	})
	if err != nil {
		log.Error("inline 创建订单失败: %v", err)
		if result.MessageID != "" {
			_ = c.Edit("❌ 创建订单失败，请重试。")
		}
		return nil
	}

	log.Success("inline 订单已创建: %s (%s %s)", order.ID, formatAmount(amount), currency)
	message, keyboard, err := b.renderCurrencyMenu(order, displayUserName(result.Sender))
	if err != nil {
		log.Error("加载币种列表失败: order=%s err=%v", order.ID, err)
		message = "✅ 收款订单已创建，但加载币种失败，请稍后重试。"
	}
	if result.MessageID != "" {
		b.storeOrderMessage(order.ID, tele.StoredMessage{MessageID: result.MessageID, ChatID: 0})
		if b.tryEditInlineMessage(c, result.MessageID, message, keyboard) {
			return nil
		}
		log.Error("inline 消息编辑失败: msg_id=%q order=%s", result.MessageID, order.ID)
		return nil
	}
	log.Warn("inline 结果缺少 message_id，无法编辑原消息: uid=%d result_id=%q", result.Sender.ID, result.ResultID)
	return nil
}

func (b *Bot) tryEditInlineMessage(c tele.Context, messageID, text string, keyboard *tele.ReplyMarkup) bool {
	const attempts = 4
	for i := 0; i < attempts; i++ {
		var err error
		if keyboard != nil {
			err = c.Edit(text, &tele.SendOptions{ReplyMarkup: keyboard})
		} else {
			err = c.Edit(text)
		}
		if isInlineEditSuccess(err) {
			return true
		}
		log.Warn("inline 编辑重试 %d/%d 失败: msg_id=%q err=%v", i+1, attempts, messageID, err)
		time.Sleep(time.Duration(i+1) * 250 * time.Millisecond)
	}
	return false
}

func isInlineEditSuccess(err error) bool {
	if err == nil {
		return true
	}
	if errors.Is(err, tele.ErrTrueResult) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "message is not modified")
}

func (b *Bot) inlineCurrencies(currency string, hasCurrency bool) []string {
	if hasCurrency {
		return []string{normalizeInlineCurrency(currency)}
	}
	defaultCurrency := b.defaultCurrency()
	if defaultCurrency == "USDT" {
		return []string{"USDT"}
	}
	return []string{defaultCurrency, "USDT"}
}

func (b *Bot) defaultCurrency() string {
	defaultCurrency := "CNY"
	if b.config != nil {
		defaultCurrency = strings.ToUpper(strings.TrimSpace(b.config.GetWithDefault("currency", defaultCurrency)))
	}
	if defaultCurrency == "" {
		return "CNY"
	}
	return defaultCurrency
}

func parseInlineInput(text string) (amount float64, currency string, hasCurrency bool, ok bool) {
	raw := strings.TrimSpace(text)
	if raw == "" {
		return 0, "", false, false
	}

	fields := strings.Fields(raw)
	if len(fields) > 2 {
		return 0, "", false, false
	}

	if len(fields) == 1 {
		s := fields[0]
		i := 0
		for i < len(s) {
			ch := s[i]
			if (ch >= '0' && ch <= '9') || ch == '.' {
				i++
				continue
			}
			break
		}
		numPart := strings.TrimSpace(s[:i])
		curPart := strings.TrimSpace(s[i:])
		amount, ok = parseAmount(numPart)
		if !ok {
			return 0, "", false, false
		}
		if curPart == "" {
			return amount, "", false, true
		}
		return amount, normalizeInlineCurrency(curPart), true, true
	}

	amount, ok = parseAmount(fields[0])
	if !ok {
		return 0, "", false, false
	}
	return amount, normalizeInlineCurrency(fields[1]), true, true
}

func parseAmount(raw string) (float64, bool) {
	amount, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || amount <= 0 {
		return 0, false
	}
	return amount, true
}

func normalizeInlineCurrency(raw string) string {
	cur := strings.ToUpper(strings.TrimSpace(raw))
	if cur == "U" {
		return "USDT"
	}
	return cur
}

func buildInlineResultID(amount float64, currency string) string {
	return inlineResultPrefix + "|" + formatAmount(amount) + "|" + normalizeInlineCurrency(currency)
}

func parseInlineResultID(raw string) (amount float64, currency string, ok bool) {
	parts := strings.Split(raw, "|")
	if len(parts) != 3 || parts[0] != inlineResultPrefix {
		return 0, "", false
	}
	amount, ok = parseAmount(parts[1])
	if !ok {
		return 0, "", false
	}
	currency = normalizeInlineCurrency(parts[2])
	if currency == "" {
		return 0, "", false
	}
	return amount, currency, true
}

func formatAmount(v float64) string {
	text := strconv.FormatFloat(v, 'f', 8, 64)
	text = strings.TrimRight(text, "0")
	text = strings.TrimRight(text, ".")
	if text == "" {
		return "0"
	}
	return text
}
