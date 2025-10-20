package command

import (
	"hashpay/internal/database"

	tele "gopkg.in/telebot.v4"
)

// Dependencies 汇总命令处理所需的共享资源。
type Dependencies struct {
	DB         *database.DB
	IsAdmin    func(int64) bool
	Username   func() string
	MiniAppURL string
}

// Handler 描述一个可注册的命令处理器。
type Handler interface {
	Command() string
	Handle(tele.Context) error
}
