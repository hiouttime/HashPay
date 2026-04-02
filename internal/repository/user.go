package repository

import (
	"database/sql"
	"time"

	"hashpay/internal/model"
)

type UserRepo struct {
	db *DB
}

func NewUserRepo(db *DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) Create(u *model.User) error {
	query := `
		INSERT INTO users (tg_id, username, is_admin, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`

	isAdmin := 0
	if u.IsAdmin {
		isAdmin = 1
	}

	result, err := r.db.Exec(query,
		u.TgID, u.Username, isAdmin, u.CreatedAt.Unix(), u.UpdatedAt.Unix(),
	)
	if err != nil {
		return err
	}

	id, _ := result.LastInsertId()
	u.ID = id
	return nil
}

func (r *UserRepo) GetByTgID(tgID int64) (*model.User, error) {
	query := `
		SELECT id, tg_id, username, is_admin, pref_pay, created_at, updated_at
		FROM users WHERE tg_id = ?
	`

	var u model.User
	var username, prefPay sql.NullString
	var isAdmin int
	var createdAt, updatedAt int64

	err := r.db.QueryRow(query, tgID).Scan(
		&u.ID, &u.TgID, &username, &isAdmin, &prefPay,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}

	u.Username = username.String
	u.IsAdmin = isAdmin == 1
	u.PrefPay = prefPay.String
	u.CreatedAt = time.Unix(createdAt, 0)
	u.UpdatedAt = time.Unix(updatedAt, 0)

	return &u, nil
}

func (r *UserRepo) Update(u *model.User) error {
	query := `
		UPDATE users SET username = ?, is_admin = ?, pref_pay = ?, updated_at = ?
		WHERE id = ?
	`

	isAdmin := 0
	if u.IsAdmin {
		isAdmin = 1
	}

	_, err := r.db.Exec(query, u.Username, isAdmin, u.PrefPay, time.Now().Unix(), u.ID)
	return err
}

func (r *UserRepo) IsAdmin(tgID int64) bool {
	user, err := r.GetByTgID(tgID)
	if err != nil {
		return false
	}
	return user.IsAdmin
}
