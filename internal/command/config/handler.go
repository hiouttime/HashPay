package config

import (
	"hashpay/internal/command"
	"hashpay/internal/ui"

	tele "gopkg.in/telebot.v4"
)

type Handler struct {
	deps command.Dependencies
}

func New(deps command.Dependencies) *Handler {
	return &Handler{deps: deps}
}

func (h *Handler) Command() string {
	return "/config"
}

func (h *Handler) Handle(c tele.Context) error {
	user := c.Sender()
	ui.Debug("收到 /config 指令，用户 %d (@%s)", user.ID, user.Username)

	if h.deps.IsAdmin == nil || !h.deps.IsAdmin(user.ID) {
		return c.Send("此命令仅管理员可用")
	}

	return c.Send("⚙️ 系统配置", Menu())
}

// Menu 返回配置命令共用的内联菜单。
func Menu() *tele.ReplyMarkup {
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
	return menu
}
