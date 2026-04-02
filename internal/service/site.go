package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"hashpay/internal/model"
	"hashpay/internal/repository"
)

type SiteService struct {
	sites *repository.SiteRepo
}

func NewSiteService(sites *repository.SiteRepo) *SiteService {
	return &SiteService{sites: sites}
}

func (s *SiteService) GetAll() ([]model.Site, error) {
	return s.sites.GetAll()
}

func (s *SiteService) Create(name, callback, apiKey string) (*model.Site, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("商户名称不能为空")
	}

	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		generated, err := generateSiteToken("hp_", 16)
		if err != nil {
			return nil, err
		}
		apiKey = generated
	}

	siteID, err := generateSiteToken("site_", 8)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	site := &model.Site{
		ID:        siteID,
		Name:      name,
		APIKey:    apiKey,
		Callback:  strings.TrimSpace(callback),
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.sites.Create(site); err != nil {
		return nil, err
	}
	return site, nil
}

func (s *SiteService) Delete(id string) error {
	return s.sites.Delete(strings.TrimSpace(id))
}

func (s *SiteService) Update(id, name, callback, apiKey string) (*model.Site, error) {
	id = strings.TrimSpace(id)
	name = strings.TrimSpace(name)
	if id == "" {
		return nil, errors.New("商户 ID 不能为空")
	}
	if name == "" {
		return nil, errors.New("商户名称不能为空")
	}

	site, err := s.sites.GetByID(id)
	if err != nil {
		return nil, err
	}

	site.Name = name
	site.Callback = strings.TrimSpace(callback)
	if trimmedKey := strings.TrimSpace(apiKey); trimmedKey != "" {
		site.APIKey = trimmedKey
	}
	site.UpdatedAt = time.Now()

	if err := s.sites.Update(site); err != nil {
		return nil, err
	}
	return site, nil
}

func generateSiteToken(prefix string, size int) (string, error) {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(bytes), nil
}
