package service

import (
	"time"

	"hashpay/internal/model"
	"hashpay/internal/repository"
)

type UserService struct {
	users *repository.UserRepo
}

func NewUserService(users *repository.UserRepo) *UserService {
	return &UserService{users: users}
}

func (s *UserService) GetByTgID(tgID int64) (*model.User, error) {
	return s.users.GetByTgID(tgID)
}

func (s *UserService) CreateAdmin(tgID int64, username string) (*model.User, error) {
	now := time.Now()
	user := &model.User{
		TgID:      tgID,
		Username:  username,
		IsAdmin:   true,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.users.Create(user); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *UserService) IsAdmin(tgID int64) bool {
	return s.users.IsAdmin(tgID)
}

func (s *UserService) Update(u *model.User) error {
	return s.users.Update(u)
}
