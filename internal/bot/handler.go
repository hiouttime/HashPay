package bot

import (
	"fmt"
	"strings"

	"hashpay/internal/pkg/log"

	tele "gopkg.in/telebot.v4"
)

func inlineExample(username, query string) string {
	name := strings.TrimSpace(username)
	if name == "" {
		name = "机器人用户名"
	}
	return "@" + name + " " + strings.TrimSpace(query)
}

func (b *Bot) handleStart(c tele.Context) error {
	if c.Sender() == nil {
		return nil
	}
	log.Info("收到 /start: uid=%d", c.Sender().ID)
	if c.Message() != nil {
		payload := strings.TrimSpace(c.Message().Payload)
		if strings.HasPrefix(payload, "help_") {
			orderID := strings.TrimSpace(strings.TrimPrefix(payload, "help_"))
			if orderID != "" {
				return b.handleOrderHelpStart(c, orderID)
			}
		}
	}
	if !b.isAdmin(c.Sender().ID) {
		return c.Send("👋 欢迎使用 HashPay！\n\n此 Bot 仅供管理员使用。")
	}

	msg := "🎉 *欢迎回来，管理员！*\n\n"
	msg += "HashPay 正在运行中。\n\n"
	msg += "可用命令：\n"
	msg += "/stats - 查看统计数据\n"
	msg += "/help - 帮助信息\n\n"
	msg += fmt.Sprintf("Inline 收款：在任意对话输入 `%s`", inlineExample(b.Username(), "20"))

	return c.Send(msg, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
}

func (b *Bot) handleHelp(c tele.Context) error {
	log.Info("收到 /help: uid=%d", c.Sender().ID)
	msg := "📖 *HashPay 帮助*\n\n"
	msg += "*管理员命令*\n"
	msg += "/stats - 查看收款统计\n"
	msg += "/help - 显示此帮助\n\n"
	msg += "*Mini App*\n"
	msg += "点击菜单按钮打开管理面板，可进行：\n"
	msg += "• 支付方式管理\n"
	msg += "• 订单查看\n"
	msg += "• 系统设置\n\n"
	msg += "*Inline 收款*\n"
	msg += "在任意对话输入：\n"
	msg += fmt.Sprintf("• `%s`\n", inlineExample(b.Username(), "20"))
	msg += fmt.Sprintf("• `%s`\n", inlineExample(b.Username(), "20U"))
	msg += fmt.Sprintf("• `%s`", inlineExample(b.Username(), "20CNY"))

	return c.Send(msg, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
}

func (b *Bot) handleStats(c tele.Context) error {
	log.Info("收到 /stats: uid=%d", c.Sender().ID)
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

func (b *Bot) handleText(c tele.Context) error {
	if c.Message() == nil || c.Sender() == nil {
		return nil
	}
	text := strings.TrimSpace(c.Text())
	if text == "" {
		return nil
	}
	via := ""
	if c.Message().Via != nil {
		via = c.Message().Via.Username
	}
	log.Info("收到文本消息: uid=%d via=%q text=%q", c.Sender().ID, via, text)
	return nil
}

func displayUserName(user *tele.User) string {
	if user == nil {
		return ""
	}
	name := strings.TrimSpace(strings.TrimSpace(user.FirstName + " " + user.LastName))
	if name != "" {
		return name
	}
	if strings.TrimSpace(user.Username) != "" {
		return "@" + strings.TrimSpace(user.Username)
	}
	return "管理员"
}
