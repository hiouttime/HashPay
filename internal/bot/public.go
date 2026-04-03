package bot

import tele "gopkg.in/telebot.v4"

func (b *Bot) handlePublicStart(c tele.Context) error {
	return c.Send("这个 Bot 主要用于收款订单与支付引导。")
}

func (b *Bot) handlePublicText(c tele.Context, _ string) error {
	return c.Send("请通过商户提供的订单页面完成付款。")
}
