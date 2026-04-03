package bot

import (
	"fmt"

	tele "gopkg.in/telebot.v4"
)

func (b *Bot) handleAdminStart(c tele.Context) error {
	keyboard := &tele.ReplyMarkup{}
	if url := b.currentPublicURL(); url != "" {
		keyboard.Inline(keyboard.Row(
			keyboard.WebApp("打开管理后台", &tele.WebApp{URL: url + "/app"}),
		))
	}
	return b.sendText(c.Chat(), "HashPay 管理已就绪。\n可直接打开 Mini App，或使用 inline 创建订单。", keyboard)
}

func (b *Bot) handleStats(c tele.Context) error {
	if c.Sender() == nil || !b.isAdmin(c.Sender().ID) {
		return c.Send("无权限")
	}
	app := b.getApp()
	if app == nil {
		return c.Send("系统尚未完成初始化")
	}
	data, err := app.Dashboard()
	if err != nil {
		return c.Send("读取统计失败")
	}
	return c.Send(fmt.Sprintf("今日已支付 %d 笔，金额 %.2f\n待处理订单 %d\n通知异常 %d", data.TodayCount, data.TodayAmount, data.PendingCount, data.FailedNotifyCount))
}

func (b *Bot) handleAdminText(c tele.Context, _ string) error {
	return c.Send("管理员消息已收到。可使用 inline 发起订单，例如：@机器人 20")
}
