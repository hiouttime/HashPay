package service

import (
	"time"

	"hashpay/internal/model"
	"hashpay/internal/repository"
)

type StatsService struct {
	orders *repository.OrderRepo
}

func NewStatsService(orders *repository.OrderRepo) *StatsService {
	return &StatsService{orders: orders}
}

type Stats struct {
	TodayAmount float64
	TodayCount  int
	TotalAmount float64
	TotalCount  int
}

func (s *StatsService) Get() (*Stats, error) {
	// 获取今日开始时间
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	todayOrders, err := s.orders.GetAfter(todayStart)
	if err != nil {
		return nil, err
	}

	allOrders, err := s.orders.GetAll()
	if err != nil {
		return nil, err
	}

	stats := &Stats{}

	for _, o := range todayOrders {
		if o.Status == model.OrderPaid {
			stats.TodayAmount += o.Amount
			stats.TodayCount++
		}
	}

	for _, o := range allOrders {
		if o.Status == model.OrderPaid {
			stats.TotalAmount += o.Amount
			stats.TotalCount++
		}
	}

	return stats, nil
}

// GetOrdersByDate 按日期获取订单统计
func (s *StatsService) GetOrdersByDate(start, end time.Time) ([]model.Order, error) {
	orders, err := s.orders.GetAfter(start)
	if err != nil {
		return nil, err
	}

	var result []model.Order
	for _, o := range orders {
		if o.CreatedAt.Before(end) {
			result = append(result, o)
		}
	}
	return result, nil
}
