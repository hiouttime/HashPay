package bot

import (
	"fmt"
	"log"
	"strings"
	"time"

	tele "gopkg.in/telebot.v4"
)

func (h *Handlers) handleStart(c tele.Context) error {
	userID := c.Sender().ID
	log.Printf("[BOT] /start command from user %d (@%s)", userID, c.Sender().Username)
	
	// 正常运行模式，不处理初始化
	// 初始化在独立的流程中完成
	
	if h.bot.isAdmin(userID) {
		menu := &tele.ReplyMarkup{}
		btnMiniApp := menu.WebApp("打开管理后台", &tele.WebApp{
			URL: "https://testapp.timetl.com", // 开发环境URL
		})
		btnQuickPay := menu.Text("快速收款")
		btnOrders := menu.Text("订单管理")
		btnStats := menu.Text("统计数据")
		
		menu.Reply(
			menu.Row(btnMiniApp),
			menu.Row(btnQuickPay, btnOrders),
			menu.Row(btnStats),
		)
		
		return c.Send("欢迎回来，管理员!\n\n" +
			"选择操作：", menu)
	}
	
	return c.Send("欢迎使用 HashPay 支付系统!\n\n" +
		"您可以通过 @" + h.bot.bot.Me.Username + " 进行快速收款。")
}

func (h *Handlers) handleHelp(c tele.Context) error {
	log.Printf("[BOT] /help command from user %d (@%s)", c.Sender().ID, c.Sender().Username)
	helpText := `HashPay 帮助

管理员命令：
/start - 开始使用
/stats - 查看统计
/orders - 订单管理
/config - 系统配置
/help - 显示帮助

快速收款：
在任意聊天中输入 @%s 金额 即可发起收款

示例：
@%s 100
@%s 50 CNY
`
	botUsername := h.bot.bot.Me.Username
	return c.Send(fmt.Sprintf(helpText, botUsername, botUsername, botUsername))
}

func (h *Handlers) handleStats(c tele.Context) error {
	log.Printf("[BOT] /stats command from user %d (@%s)", c.Sender().ID, c.Sender().Username)
	if !h.bot.isAdmin(c.Sender().ID) {
		return c.Send("此命令仅管理员可用")
	}
	
	todayStart := time.Now().Truncate(24 * time.Hour).Unix()
	
	orders, err := h.bot.db.GetPendingOrders()
	if err != nil {
		return c.Send("获取统计数据失败")
	}
	
	var todayOrders, totalPending int
	var todayAmount float64
	
	for _, order := range orders {
		if order.CreatedAt >= todayStart {
			todayOrders++
			todayAmount += order.Amount
		}
		if !order.Status.Valid || order.Status.Int64 == 0 {
			totalPending++
		}
	}
	
	stats := fmt.Sprintf(`📊 统计数据

今日订单：%d 笔
今日金额：%.2f CNY
待支付订单：%d 笔

更新时间：%s`,
		todayOrders,
		todayAmount,
		totalPending,
		time.Now().Format("15:04:05"),
	)
	
	return c.Send(stats)
}

func (h *Handlers) handleOrders(c tele.Context) error {
	log.Printf("[BOT] /orders command from user %d (@%s)", c.Sender().ID, c.Sender().Username)
	if !h.bot.isAdmin(c.Sender().ID) {
		return c.Send("此命令仅管理员可用")
	}
	
	orders, err := h.bot.db.GetPendingOrders()
	if err != nil {
		return c.Send("获取订单失败")
	}
	
	if len(orders) == 0 {
		return c.Send("暂无待支付订单")
	}
	
	var sb strings.Builder
	sb.WriteString("📋 待支付订单\n\n")
	
	for i, order := range orders[:min(10, len(orders))] {
		status := "待支付"
		if order.Status.Valid && order.Status.Int64 == 1 {
			status = "已支付"
		} else if order.Status.Valid && order.Status.Int64 == 2 {
			status = "已过期"
		}
		
		sb.WriteString(fmt.Sprintf("%d. 订单 %s\n", i+1, order.ID))
		sb.WriteString(fmt.Sprintf("   金额: %.2f %s\n", order.Amount, order.Currency))
		sb.WriteString(fmt.Sprintf("   状态: %s\n", status))
		sb.WriteString(fmt.Sprintf("   创建: %s\n\n", 
			time.Unix(order.CreatedAt, 0).Format("01-02 15:04")))
	}
	
	if len(orders) > 10 {
		sb.WriteString(fmt.Sprintf("... 还有 %d 个订单", len(orders)-10))
	}
	
	return c.Send(sb.String())
}

func (h *Handlers) handleConfig(c tele.Context) error {
	log.Printf("[BOT] /config command from user %d (@%s)", c.Sender().ID, c.Sender().Username)
	if !h.bot.isAdmin(c.Sender().ID) {
		return c.Send("此命令仅管理员可用")
	}
	
	menu := &tele.ReplyMarkup{}
	btnCurrency := menu.Data("基础货币", "cfg_currency")
	btnTimeout := menu.Data("订单超时", "cfg_timeout")
	btnRate := menu.Data("汇率设置", "cfg_rate")
	btnPayment := menu.Data("支付方式", "cfg_payment")
	btnNotify := menu.Data("通知设置", "cfg_notify")
	btnBack := menu.Data("« 返回", "back")
	
	menu.Inline(
		menu.Row(btnCurrency, btnTimeout),
		menu.Row(btnRate, btnPayment),
		menu.Row(btnNotify),
		menu.Row(btnBack),
	)
	
	return c.Send("⚙️ 系统配置", menu)
}

func (h *Handlers) handleText(c tele.Context) error {
	text := c.Text()
	userID := c.Sender().ID
	log.Printf("[BOT] Text message from user %d (@%s): %s", userID, c.Sender().Username, text)
	
	// 正常运行模式下不处理PIN验证
	// PIN验证只在初始化流程的临时Bot中处理
	
	return nil
}

func (h *Handlers) handleInlineQuery(c tele.Context) error {
	query := c.Query().Text
	log.Printf("[BOT] Inline query from user %d: %s", c.Sender().ID, query)
	
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

func (h *Handlers) handleInlineResult(c tele.Context) error {
	// telebot v4 中改为 InlineResult
	resultID := c.InlineResult().ResultID
	log.Printf("Inline result chosen: %s by user %d", resultID, c.Sender().ID)
	return nil
}

func (h *Handlers) handleCallback(c tele.Context) error {
	data := c.Callback().Data
	log.Printf("[BOT] Callback from user %d: %s", c.Sender().ID, data)
	
	switch {
	case strings.HasPrefix(data, "cfg_"):
		return h.handleConfigCallback(c, data)
	case data == "back":
		return h.handleConfig(c)
	default:
		return c.Respond(&tele.CallbackResponse{
			Text: "未知操作",
		})
	}
}

func (h *Handlers) handleConfigCallback(c tele.Context, data string) error {
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}