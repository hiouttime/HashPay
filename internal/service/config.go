package service

import "hashpay/internal/repository"

type ConfigService struct {
	config *repository.ConfigRepo
}

func NewConfigService(config *repository.ConfigRepo) *ConfigService {
	return &ConfigService{config: config}
}

func (s *ConfigService) Get(key string) (string, error) {
	return s.config.Get(key)
}

func (s *ConfigService) Set(key, value string) error {
	return s.config.Set(key, value)
}

func (s *ConfigService) GetAll() (map[string]string, error) {
	return s.config.GetAll()
}

func (s *ConfigService) Delete(key string) error {
	return s.config.Delete(key)
}

// GetWithDefault 获取配置，若不存在则返回默认值
func (s *ConfigService) GetWithDefault(key, defaultValue string) string {
	val, err := s.config.Get(key)
	if err != nil || val == "" {
		return defaultValue
	}
	return val
}
