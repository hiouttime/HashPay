package bot

import (
	"fmt"

	tele "gopkg.in/telebot.v4"
)

func (b *Bot) handleStart(c tele.Context) error {
	if !b.isAdmin(c.Sender().ID) {
		return c.Send("👋 欢迎使用 HashPay！\n\n此 Bot 仅供管理员使用。")
	}

	msg := "🎉 *欢迎回来，管理员！*\n\n"
	msg += "HashPay 正在运行中。\n\n"
	msg += "可用命令：\n"
	msg += "/stats - 查看统计数据\n"
	msg += "/help - 帮助信息"

	return c.Send(msg, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
}

func (b *Bot) handleHelp(c tele.Context) error {
	msg := "📖 *HashPay 帮助*\n\n"
	msg += "*管理员命令*\n"
	msg += "/stats - 查看收款统计\n"
	msg += "/help - 显示此帮助\n\n"
	msg += "*Mini App*\n"
	msg += "点击菜单按钮打开管理面板，可进行：\n"
	msg += "• 支付方式管理\n"
	msg += "• 订单查看\n"
	msg += "• 系统设置"

	return c.Send(msg, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
}

func (b *Bot) handleStats(c tele.Context) error {
	if !b.isAdmin(c.Sender().ID) {
		return c.Send("⛔ 此命令仅管理员可用")
	}

	stats, err := b.stats.Get()
	if err != nil {
		return c.Send("❌ 获取统计数据失败")
	}

	msg := "📊 *收款统计*\n\n"
	msg += fmt.Sprintf("*今日*\n")
	msg += fmt.Sprintf("• 收款笔数: %d\n", stats.TodayCount)
	msg += fmt.Sprintf("• 收款金额: %.2f\n\n", stats.TodayAmount)
	msg += fmt.Sprintf("*总计*\n")
	msg += fmt.Sprintf("• 收款笔数: %d\n", stats.TotalCount)
	msg += fmt.Sprintf("• 收款金额: %.2f", stats.TotalAmount)

	return c.Send(msg, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
}
