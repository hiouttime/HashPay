package orders

import (
	"fmt"
	"strings"
	"time"

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
	return "/orders"
}

func (h *Handler) Handle(c tele.Context) error {
	user := c.Sender()
	ui.Debug("收到 /orders 指令，用户 %d (@%s)", user.ID, user.Username)

	if h.deps.IsAdmin == nil || !h.deps.IsAdmin(user.ID) {
		return c.Send("此命令仅管理员可用")
	}
	if h.deps.DB == nil {
		return c.Send("数据库未就绪，暂时无法获取订单")
	}

	orders, err := h.deps.DB.GetPendingOrders()
	if err != nil {
		return c.Send("获取订单失败")
	}

	if len(orders) == 0 {
		return c.Send("暂无待支付订单")
	}

	var sb strings.Builder
	sb.WriteString("📋 待支付订单\n\n")

	limit := min(len(orders), 10)
	for i := 0; i < limit; i++ {
		order := orders[i]
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

	if len(orders) > limit {
		sb.WriteString(fmt.Sprintf("... 还有 %d 个订单", len(orders)-limit))
	}

	return c.Send(sb.String())
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
