package bot

import (
	"fmt"
	"strings"

	configcmd "hashpay/internal/command/config"
	"hashpay/internal/ui"

	tele "gopkg.in/telebot.v4"
)

func (b *Bot) handleText(c tele.Context) error {
	text := c.Text()
	userID := c.Sender().ID
	ui.Debug("收到文本消息，用户 %d (@%s): %s", userID, c.Sender().Username, text)
	return nil
}

func (b *Bot) handleInlineQuery(c tele.Context) error {
	query := c.Query().Text
	ui.Debug("收到内联查询，用户 %d: %s", c.Sender().ID, query)

	results := make(tele.Results, 0)

	amounts := []string{"50", "100", "200", "500", "1000"}
	if query != "" {
		amounts = []string{query}
	}

	for i, amount := range amounts {
		result := &tele.ArticleResult{
			Title:       fmt.Sprintf("收款 %s CNY", amount),
			Description: "点击发起收款",
			Text:        fmt.Sprintf("💰 收款金额：%s CNY\n\n请选择支付方式完成支付", amount),
		}
		result.SetResultID(fmt.Sprintf("%d", i))

		menu := &tele.ReplyMarkup{}
		btnPay := menu.URL("立即支付", fmt.Sprintf("https://pay.example.com/pay?amount=%s", amount))
		menu.Inline(menu.Row(btnPay))
		result.SetReplyMarkup(menu)

		results = append(results, result)
	}

	return c.Answer(&tele.QueryResponse{
		Results:   results,
		CacheTime: 60,
	})
}

func (b *Bot) handleInlineResult(c tele.Context) error {
	resultID := c.InlineResult().ResultID
	ui.Debug("内联结果被选择: %s，用户 %d", resultID, c.Sender().ID)
	return nil
}

func (b *Bot) handleCallback(c tele.Context) error {
	data := c.Callback().Data
	ui.Debug("收到回调，用户 %d: %s", c.Sender().ID, data)

	switch {
	case strings.HasPrefix(data, "cfg_"):
		return b.handleConfigCallback(c, data)
	case data == "back":
		return c.Edit("⚙️ 系统配置", configcmd.Menu())
	default:
		return c.Respond(&tele.CallbackResponse{
			Text: "未知操作",
		})
	}
}

func (b *Bot) handleConfigCallback(c tele.Context, data string) error {
	configType := strings.TrimPrefix(data, "cfg_")

	var text string
	switch configType {
	case "currency":
		text = "当前基础货币：CNY\n\n可选：CNY, USD, EUR, GBP, TWD"
	case "timeout":
		text = "当前订单超时：30 分钟\n\n可设置范围：5-120 分钟"
	case "rate":
		text = "汇率模式：自动获取\n\n可选：自动获取、固定汇率"
	case "payment":
		text = "已配置支付方式：\n\n- TRON (USDT)\n- BSC (USDT)\n- OKX 交易所"
	case "notify":
		text = "通知设置：\n\n- 管理员通知：已开启\n- 群组通知：未配置"
	default:
		text = "未知配置项"
	}

	return c.Edit(text, &tele.ReplyMarkup{
		InlineKeyboard: [][]tele.InlineButton{
			{{Text: "« 返回", Data: "back"}},
		},
	})
}
