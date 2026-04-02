package service

import (
	"time"

	"hashpay/internal/model"
	"hashpay/internal/repository"
)

type PaymentService struct {
	payments *repository.PaymentRepo
}

func NewPaymentService(payments *repository.PaymentRepo) *PaymentService {
	return &PaymentService{payments: payments}
}

type AddPaymentRequest struct {
	Type      model.PaymentType
	Chain     string
	Currency  string
	Address   string
	APIKey    string
	APISecret string
	Config    string
	Enabled   bool
}

func (s *PaymentService) Add(req AddPaymentRequest) (*model.Payment, error) {
	now := time.Now()
	payment := &model.Payment{
		Type:      req.Type,
		Chain:     req.Chain,
		Currency:  req.Currency,
		Address:   req.Address,
		APIKey:    req.APIKey,
		APISecret: req.APISecret,
		Config:    req.Config,
		Enabled:   req.Enabled,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.payments.Create(payment); err != nil {
		return nil, err
	}
	return payment, nil
}

func (s *PaymentService) GetByID(id int64) (*model.Payment, error) {
	return s.payments.GetByID(id)
}

func (s *PaymentService) GetAll() ([]model.Payment, error) {
	return s.payments.GetAll()
}

func (s *PaymentService) GetEnabled() ([]model.Payment, error) {
	return s.payments.GetEnabled()
}

func (s *PaymentService) Update(p *model.Payment) error {
	return s.payments.Update(p)
}

func (s *PaymentService) Delete(id int64) error {
	return s.payments.Delete(id)
}

func (s *PaymentService) Toggle(id int64, enabled bool) error {
	p, err := s.payments.GetByID(id)
	if err != nil {
		return err
	}
	p.Enabled = enabled
	return s.payments.Update(p)
}

// GetBlockchainPayments 获取所有区块链支付方式
func (s *PaymentService) GetBlockchainPayments() ([]model.Payment, error) {
	all, err := s.payments.GetEnabled()
	if err != nil {
		return nil, err
	}

	var result []model.Payment
	for _, p := range all {
		if p.IsBlockchain() {
			result = append(result, p)
		}
	}
	return result, nil
}
