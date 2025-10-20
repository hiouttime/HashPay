package help

import (
	"fmt"

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
	return "/help"
}

func (h *Handler) Handle(c tele.Context) error {
	user := c.Sender()
	ui.Debug("收到 /help 指令，用户 %d (@%s)", user.ID, user.Username)

	username := ""
	if h.deps.Username != nil {
		username = h.deps.Username()
	}

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

	return c.Send(fmt.Sprintf(helpText, username, username, username))
}
