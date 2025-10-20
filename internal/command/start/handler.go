package start

import (
	"hashpay/internal/command"
	"hashpay/internal/ui"

	tele "gopkg.in/telebot.v4"
)

const defaultMiniAppURL = "https://dc0j7pr9-8080.asse.devtunnels.ms/"

type Handler struct {
	deps command.Dependencies
}

func New(deps command.Dependencies) *Handler {
	return &Handler{deps: deps}
}

func (h *Handler) Command() string {
	return "/start"
}

func (h *Handler) Handle(c tele.Context) error {
	userID := c.Sender().ID
	ui.Debug("收到 /start 指令，用户 %d (@%s)", userID, c.Sender().Username)

	isAdmin := h.deps.IsAdmin != nil && h.deps.IsAdmin(userID)
	username := ""
	if h.deps.Username != nil {
		username = h.deps.Username()
	}

	if isAdmin {
		menu := &tele.ReplyMarkup{}
		miniAppURL := h.deps.MiniAppURL
		if miniAppURL == "" {
			miniAppURL = defaultMiniAppURL
		}
		btnMiniApp := menu.WebApp("打开管理后台", &tele.WebApp{
			URL: miniAppURL,
		})
		btnQuickPay := menu.Text("快速收款")
		btnOrders := menu.Text("订单管理")
		btnStats := menu.Text("统计数据")

		menu.Reply(
			menu.Row(btnMiniApp),
			menu.Row(btnQuickPay, btnOrders),
			menu.Row(btnStats),
		)

		return c.Send("欢迎回来，管理员!\n\n选择操作：", menu)
	}

	return c.Send("欢迎使用 HashPay 支付系统!\n\n您可以通过 @" + username + " 进行快速收款。")
}
