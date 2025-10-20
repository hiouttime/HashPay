package stats

import (
	"fmt"
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
	return "/stats"
}

func (h *Handler) Handle(c tele.Context) error {
	user := c.Sender()
	ui.Debug("收到 /stats 指令，用户 %d (@%s)", user.ID, user.Username)

	if h.deps.IsAdmin == nil || !h.deps.IsAdmin(user.ID) {
		return c.Send("此命令仅管理员可用")
	}

	if h.deps.DB == nil {
		return c.Send("数据库未就绪，暂时无法获取统计数据")
	}

	todayStart := time.Now().Truncate(24 * time.Hour).Unix()

	orders, err := h.deps.DB.GetPendingOrders()
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
