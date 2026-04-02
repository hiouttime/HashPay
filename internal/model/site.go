package model

import "time"

type Site struct {
	ID        string
	Name      string
	APIKey    string
	Callback  string
	Notify    string
	CreatedAt time.Time
	UpdatedAt time.Time
}
