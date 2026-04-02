package model

import "time"

type User struct {
	ID        int64
	TgID      int64
	Username  string
	IsAdmin   bool
	PrefPay   string
	CreatedAt time.Time
	UpdatedAt time.Time
}
