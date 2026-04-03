package bot

import (
	"strings"

	tele "gopkg.in/telebot.v4"
)

func (b *Bot) handleStart(c tele.Context) error {
	if c.Sender() == nil {
		return nil
	}
	if b.admin() <= 0 {
		return b.setup(c, "")
	}
	if b.isAdmin(c.Sender().ID) {
		return b.handleAdminStart(c)
	}
	return nil // 非管理员不响应
}

func (b *Bot) handleText(c tele.Context) error {
	if c.Sender() == nil {
		return nil
	}
	if b.admin() == 0 && strings.TrimSpace(b.pin) != "" {
		return b.setup(c, c.Text())
	}
	return nil
}

func (b *Bot) setup(c tele.Context, text string) error {
	if text == "" {
		c.Send("🎉")
		return c.Send("欢迎使用 HashPay！\n\n要完成管理员绑定，请发送验证码。")
	}
	if text != b.pin {
		return c.Send("❌验证码错误，请核实日志内显示的验证码。")
	}
	if b.setAdmin != nil {
		if err := b.setAdmin(c.Sender().ID); err != nil {
			return c.Send("配置管理员时发生错误，请检查日志。")
		}
	}
	return b.sendText(c.Chat(), "✅ 验证成功！已绑定管理员。\n\n接下来，请打开管理后台以继续完成配置：", b.adminMarkup())
}
