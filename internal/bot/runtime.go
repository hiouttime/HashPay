package bot

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"hashpay/internal/pkg/banner"
	"hashpay/internal/pkg/log"
	"hashpay/internal/usecase"

	tele "gopkg.in/telebot.v4"
)

type RuntimeConfig struct {
	Token     string
	PublicURL string
	AdminID   int64
	PIN       string
	OnVerify  func(userID int64, username string) error
}

type Runtime struct {
	bot       *tele.Bot
	publicURL string
	adminID   int64
	pin       string
	onVerify  func(userID int64, username string) error

	mu       sync.RWMutex
	app      *usecase.App
	orderMsg map[string]tele.StoredMessage
}

func NewRuntime(cfg *RuntimeConfig) (*Runtime, error) {
	b, err := tele.NewBot(tele.Settings{
		Token:  cfg.Token,
		Poller: &tele.LongPoller{Timeout: 10},
		OnError: func(err error, c tele.Context) {
			log.Error("bot error: %v", err)
		},
	})
	if err != nil {
		return nil, err
	}
	rt := &Runtime{
		bot:       b,
		publicURL: strings.TrimRight(strings.TrimSpace(cfg.PublicURL), "/"),
		adminID:   cfg.AdminID,
		pin:       strings.TrimSpace(cfg.PIN),
		onVerify:  cfg.OnVerify,
		orderMsg:  map[string]tele.StoredMessage{},
	}
	rt.routes()
	return rt, nil
}

func (r *Runtime) SetApp(app *usecase.App) {
	r.mu.Lock()
	r.app = app
	r.mu.Unlock()
}

func (r *Runtime) Start() {
	log.Info("Telegram Bot 已启动: @%s", r.bot.Me.Username)
	r.bot.Start()
}

func (r *Runtime) Stop() {
	r.bot.Stop()
}

func (r *Runtime) NotifyPaid(orderID string) {
	r.updateOrder(orderID, "✅ 订单已支付", nil)
}

func (r *Runtime) NotifyExpired(orderID string) {
	r.updateOrder(orderID, "⚠️ 订单已过期", nil)
}

func (r *Runtime) updateOrder(orderID, caption string, markup *tele.ReplyMarkup) {
	r.mu.Lock()
	msg, ok := r.orderMsg[orderID]
	if ok {
		delete(r.orderMsg, orderID)
	}
	r.mu.Unlock()
	if !ok {
		return
	}
	_, _ = r.bot.EditCaption(msg, caption, &tele.SendOptions{ReplyMarkup: markup})
}

func (r *Runtime) routes() {
	r.bot.Handle("/start", r.handleStart)
	r.bot.Handle("/stats", r.handleStats)
	r.bot.Handle(tele.OnText, r.handleText)
	r.bot.Handle(tele.OnQuery, r.handleInlineQuery)
	r.bot.Handle(tele.OnInlineResult, r.handleInlineResult)
	r.bot.Handle(&tele.Btn{Unique: "route_pick"}, r.handleRoutePick)
}

func (r *Runtime) handleStart(c tele.Context) error {
	if c.Sender() == nil {
		return nil
	}
	if r.setupMode() {
		return c.Send("请发送验证码完成管理员绑定。")
	}
	if !r.isAdmin(c.Sender().ID) {
		return c.Send("这个 Bot 主要用于收款订单与支付引导。")
	}
	keyboard := &tele.ReplyMarkup{}
	if r.publicURL != "" {
		keyboard.Inline(keyboard.Row(
			keyboard.WebApp("打开管理后台", &tele.WebApp{URL: r.publicURL + "/app"}),
		))
	}
	return r.sendText(c.Chat(), "HashPay 管理已就绪。\n可直接打开 Mini App 或使用 inline 创建订单。", keyboard)
}

func (r *Runtime) handleStats(c tele.Context) error {
	if c.Sender() == nil || !r.isAdmin(c.Sender().ID) {
		return c.Send("无权限")
	}
	app := r.getApp()
	if app == nil {
		return c.Send("系统尚未完成初始化")
	}
	data, err := app.Dashboard()
	if err != nil {
		return c.Send("读取统计失败")
	}
	return c.Send(fmt.Sprintf("今日已支付 %d 笔，金额 %.2f\n待处理订单 %d\n通知异常 %d", data.TodayCount, data.TodayAmount, data.PendingCount, data.FailedNotifyCount))
}

func (r *Runtime) handleText(c tele.Context) error {
	if c.Sender() == nil {
		return nil
	}
	text := strings.TrimSpace(c.Text())
	if r.setupMode() && text == r.pin {
		if r.onVerify != nil {
			if err := r.onVerify(c.Sender().ID, c.Sender().Username); err != nil {
				return c.Send("验证成功，但激活运行时失败，请检查日志。")
			}
			r.adminID = c.Sender().ID
			return c.Send("管理员绑定成功，系统已就绪。")
		}
	}
	if r.isAdmin(c.Sender().ID) {
		return c.Send("管理员消息已收到。可使用 inline 发起订单，例如：@机器人 20")
	}
	return c.Send("请通过商户提供的订单页面完成付款。")
}

func (r *Runtime) handleInlineQuery(c tele.Context) error {
	query := c.Query()
	if query == nil || query.Sender == nil {
		return nil
	}
	if !r.isAdmin(query.Sender.ID) {
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
	return c.Answer(&tele.QueryResponse{IsPersonal: true, CacheTime: 1, Results: tele.Results{
		&tele.ArticleResult{
			ResultBase:  tele.ResultBase{ID: fmt.Sprintf("%0.3f|%s", amount, currency)},
			Title:       fmt.Sprintf("创建收款 %0.2f %s", amount, currency),
			Description: "发送后选择收款方式",
			Text:        "正在创建订单…",
			ThumbURL:    r.publicURL + banner.RelativeURL(),
		},
	}})
}

func (r *Runtime) handleInlineResult(c tele.Context) error {
	result := c.InlineResult()
	if result == nil || result.Sender == nil {
		return nil
	}
	app := r.getApp()
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
	msg, markup := r.inlineMenu(checkout)
	r.mu.Lock()
	r.orderMsg[order.ID] = tele.StoredMessage{MessageID: result.MessageID}
	r.mu.Unlock()
	return r.editInline(result, msg, markup)
}

func (r *Runtime) handleRoutePick(c tele.Context) error {
	cb := c.Callback()
	if cb == nil || cb.Sender == nil {
		return nil
	}
	app := r.getApp()
	if app == nil {
		return nil
	}
	parts := strings.Split(cb.Data, "|")
	if len(parts) != 3 {
		return nil
	}
	methodID, _ := strconv.ParseInt(parts[1], 10, 64)
	route, err := app.SelectRoute(parts[0], methodID, parts[2])
	if err != nil {
		return c.Respond()
	}
	caption := fmt.Sprintf("请使用 %s 网络支付 %0.6f %s", strings.ToUpper(route.Network), route.Amount, route.Currency)
	if route.Kind == "exchange" {
		caption += fmt.Sprintf("\n收款账户：%s", route.AccountName)
		if route.Memo != "" {
			caption += fmt.Sprintf("\n备注：%s", route.Memo)
		}
		return c.Edit(caption)
	}
	photo := &tele.Photo{File: tele.FromURL("https://quickchart.io/qr?size=360&text=" + url.QueryEscape(route.QRValue)), Caption: caption}
	_, err = r.bot.Edit(cb.Message, photo, &tele.SendOptions{ReplyMarkup: paymentDoneMarkup(route.Address)})
	if err == nil {
		r.mu.Lock()
		r.orderMsg[parts[0]] = tele.StoredMessage{MessageID: fmt.Sprintf("%d", cb.Message.ID), ChatID: cb.Message.Chat.ID}
		r.mu.Unlock()
	}
	return c.Respond()
}

func (r *Runtime) inlineMenu(checkout *usecase.Checkout) (string, *tele.ReplyMarkup) {
	msg := fmt.Sprintf("收款 %0.2f %s\n选择付款方式", checkout.Order.FiatAmount, checkout.Order.FiatCurrency)
	keyboard := &tele.ReplyMarkup{}
	var rows []tele.Row
	for currency, items := range checkout.Routes {
		for _, item := range items {
			rows = append(rows, keyboard.Row(keyboard.Data(fmt.Sprintf("%s · %s", currency, item.Network), "route_pick", checkout.Order.ID, fmt.Sprintf("%d", item.MethodID), currency)))
		}
	}
	keyboard.Inline(rows...)
	return msg, keyboard
}

func (r *Runtime) editInline(target tele.Editable, text string, markup *tele.ReplyMarkup) error {
	if r.publicURL == "" {
		_, err := r.bot.Edit(target, text, &tele.SendOptions{ReplyMarkup: markup})
		return err
	}
	_, err := r.bot.Edit(target, &tele.Photo{File: tele.FromURL(r.publicURL + banner.RelativeURL()), Caption: text}, &tele.SendOptions{ReplyMarkup: markup})
	return err
}

func paymentDoneMarkup(address string) *tele.ReplyMarkup {
	if strings.TrimSpace(address) == "" {
		return nil
	}
	keyboard := &tele.ReplyMarkup{}
	keyboard.Inline(keyboard.Row(keyboard.Data("已完成付款", "noop", "done")))
	return keyboard
}

func (r *Runtime) sendText(to tele.Recipient, text string, markup *tele.ReplyMarkup) error {
	_, err := r.bot.Send(to, text, &tele.SendOptions{ReplyMarkup: markup})
	return err
}

func (r *Runtime) isAdmin(userID int64) bool {
	return r.adminID > 0 && userID == r.adminID
}

func (r *Runtime) setupMode() bool {
	return r.adminID == 0 && strings.TrimSpace(r.pin) != ""
}

func (r *Runtime) getApp() *usecase.App {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.app
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
