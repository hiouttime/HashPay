package database

import (
	_ "embed"
)

//go:embed migrations/init.sql
var EmbeddedInitSQL string
