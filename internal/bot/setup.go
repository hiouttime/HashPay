package bot

import (
	"strings"

	tele "gopkg.in/telebot.v4"
)

func (b *Bot) handleStart(c tele.Context) error {
	if c.Sender() == nil {
		return nil
	}
	if b.setupMode() {
		return b.handleSetupText(c, "")
	}
	if b.isAdmin(c.Sender().ID) {
		return b.handleAdminStart(c)
	}
	return b.handlePublicStart(c)
}

func (b *Bot) handleText(c tele.Context) error {
	if c.Sender() == nil {
		return nil
	}
	text := strings.TrimSpace(c.Text())
	if b.setupMode() {
		return b.handleSetupText(c, text)
	}
	if b.isAdmin(c.Sender().ID) {
		return b.handleAdminText(c, text)
	}
	return b.handlePublicText(c, text)
}

func (b *Bot) handleSetupText(c tele.Context, text string) error {
	if strings.TrimSpace(text) == "" {
		return c.Send("请向机器人发送验证码完成管理员绑定。")
	}
	if text != b.pin {
		return c.Send("验证码不正确，请确认后台展示的验证码后重新发送。")
	}
	if b.onVerify != nil {
		if err := b.onVerify(c.Sender().ID); err != nil {
			return c.Send("验证成功，但运行时激活失败，请检查日志。")
		}
	}
	return c.Send("管理员绑定成功，系统已就绪。")
}
