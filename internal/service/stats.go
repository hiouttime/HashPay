package service

import (
	"context"
	"fmt"
	"hashpay/internal/database/sqlc"
	"time"

	"github.com/shopspring/decimal"
)

type StatsService struct {
	db     db.Querier
	orders *OrderService
}

type Stats struct {
	TodayAmount     decimal.Decimal `json:"today_amount"`
	TodayOrders     int            `json:"today_orders"`
	TodaySuccess    int            `json:"today_success"`
	WeekAmount      decimal.Decimal `json:"week_amount"`
	WeekOrders      int            `json:"week_orders"`
	MonthAmount     decimal.Decimal `json:"month_amount"`
	MonthOrders     int            `json:"month_orders"`
	TotalAmount     decimal.Decimal `json:"total_amount"`
	TotalOrders     int            `json:"total_orders"`
	SuccessRate     float64        `json:"success_rate"`
	PendingOrders   int            `json:"pending_orders"`
	PopularPayment  string         `json:"popular_payment"`
	PopularCurrency string         `json:"popular_currency"`
	AverageAmount   decimal.Decimal `json:"average_amount"`
}

type DailyStats struct {
	Date         string          `json:"date"`
	OrderCount   int            `json:"order_count"`
	SuccessCount int            `json:"success_count"`
	Amount       decimal.Decimal `json:"amount"`
	SuccessRate  float64        `json:"success_rate"`
}

type PaymentStats struct {
	Method      string          `json:"method"`
	Chain       string          `json:"chain"`
	Currency    string          `json:"currency"`
	OrderCount  int            `json:"order_count"`
	TotalAmount decimal.Decimal `json:"total_amount"`
	Percentage  float64        `json:"percentage"`
}

func NewStatsService(database db.Querier, orders *OrderService) *StatsService {
	return &StatsService{
		db:     database,
		orders: orders,
	}
}

func (s *StatsService) GetOverviewStats(ctx context.Context) (*Stats, error) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	weekStart := now.AddDate(0, 0, -7).Unix()
	monthStart := now.AddDate(0, -1, 0).Unix()
	
	stats := &Stats{
		TodayAmount:  decimal.Zero,
		WeekAmount:   decimal.Zero,
		MonthAmount:  decimal.Zero,
		TotalAmount:  decimal.Zero,
	}
	
	// 获取所有订单进行统计
	allOrders, err := s.getAllOrders(ctx)
	if err != nil {
		return nil, err
	}
	
	paymentCount := make(map[string]int)
	currencyCount := make(map[string]int)
	
	for _, order := range allOrders {
		// 总计
		stats.TotalOrders++
		if order.Status == 1 {
			stats.TotalAmount = stats.TotalAmount.Add(decimal.NewFromFloat(order.Amount))
		}
		
		// 今日
		if order.CreatedAt >= todayStart {
			stats.TodayOrders++
			if order.Status == 1 {
				stats.TodaySuccess++
				stats.TodayAmount = stats.TodayAmount.Add(decimal.NewFromFloat(order.Amount))
			}
		}
		
		// 本周
		if order.CreatedAt >= weekStart {
			stats.WeekOrders++
			if order.Status == 1 {
				stats.WeekAmount = stats.WeekAmount.Add(decimal.NewFromFloat(order.Amount))
			}
		}
		
		// 本月
		if order.CreatedAt >= monthStart {
			stats.MonthOrders++
			if order.Status == 1 {
				stats.MonthAmount = stats.MonthAmount.Add(decimal.NewFromFloat(order.Amount))
			}
		}
		
		// 待支付
		if order.Status == 0 && order.ExpireAt > now.Unix() {
			stats.PendingOrders++
		}
		
		// 支付方式统计
		if order.PayMethod.Valid {
			paymentCount[order.PayMethod.String]++
		}
		
		// 货币统计
		if order.PayCurrency.Valid {
			currencyCount[order.PayCurrency.String]++
		}
	}
	
	// 计算成功率
	if stats.TodayOrders > 0 {
		stats.SuccessRate = float64(stats.TodaySuccess) / float64(stats.TodayOrders) * 100
	}
	
	// 计算平均订单金额
	if stats.TotalOrders > 0 {
		stats.AverageAmount = stats.TotalAmount.Div(decimal.NewFromInt(int64(stats.TotalOrders)))
	}
	
	// 最受欢迎的支付方式
	maxPayment := 0
	for method, count := range paymentCount {
		if count > maxPayment {
			maxPayment = count
			stats.PopularPayment = method
		}
	}
	
	// 最受欢迎的货币
	maxCurrency := 0
	for currency, count := range currencyCount {
		if count > maxCurrency {
			maxCurrency = count
			stats.PopularCurrency = currency
		}
	}
	
	return stats, nil
}

func (s *StatsService) GetDailyStats(ctx context.Context, days int) ([]DailyStats, error) {
	now := time.Now()
	stats := make([]DailyStats, days)
	
	allOrders, err := s.getAllOrders(ctx)
	if err != nil {
		return nil, err
	}
	
	for i := 0; i < days; i++ {
		date := now.AddDate(0, 0, -i)
		dayStart := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location()).Unix()
		dayEnd := dayStart + 86400
		
		daily := DailyStats{
			Date:   date.Format("2006-01-02"),
			Amount: decimal.Zero,
		}
		
		for _, order := range allOrders {
			if order.CreatedAt >= dayStart && order.CreatedAt < dayEnd {
				daily.OrderCount++
				if order.Status == 1 {
					daily.SuccessCount++
					daily.Amount = daily.Amount.Add(decimal.NewFromFloat(order.Amount))
				}
			}
		}
		
		if daily.OrderCount > 0 {
			daily.SuccessRate = float64(daily.SuccessCount) / float64(daily.OrderCount) * 100
		}
		
		stats[i] = daily
	}
	
	// 反转数组，让最早的日期在前
	for i, j := 0, len(stats)-1; i < j; i, j = i+1, j-1 {
		stats[i], stats[j] = stats[j], stats[i]
	}
	
	return stats, nil
}

func (s *StatsService) GetPaymentStats(ctx context.Context) ([]PaymentStats, error) {
	allOrders, err := s.getAllOrders(ctx)
	if err != nil {
		return nil, err
	}
	
	statsMap := make(map[string]*PaymentStats)
	totalOrders := 0
	
	for _, order := range allOrders {
		if order.Status != 1 {
			continue
		}
		
		totalOrders++
		
		key := ""
		if order.PayMethod.Valid && order.PayChain.Valid && order.PayCurrency.Valid {
			key = fmt.Sprintf("%s_%s_%s", order.PayMethod.String, order.PayChain.String, order.PayCurrency.String)
		} else {
			continue
		}
		
		if _, exists := statsMap[key]; !exists {
			statsMap[key] = &PaymentStats{
				Method:      order.PayMethod.String,
				Chain:       order.PayChain.String,
				Currency:    order.PayCurrency.String,
				TotalAmount: decimal.Zero,
			}
		}
		
		statsMap[key].OrderCount++
		statsMap[key].TotalAmount = statsMap[key].TotalAmount.Add(decimal.NewFromFloat(order.Amount))
	}
	
	var results []PaymentStats
	for _, stat := range statsMap {
		if totalOrders > 0 {
			stat.Percentage = float64(stat.OrderCount) / float64(totalOrders) * 100
		}
		results = append(results, *stat)
	}
	
	return results, nil
}

func (s *StatsService) GetHourlyStats(ctx context.Context) (map[int]int, error) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	
	hourlyStats := make(map[int]int)
	for i := 0; i < 24; i++ {
		hourlyStats[i] = 0
	}
	
	allOrders, err := s.getAllOrders(ctx)
	if err != nil {
		return nil, err
	}
	
	for _, order := range allOrders {
		if order.CreatedAt >= todayStart && order.Status == 1 {
			hour := time.Unix(order.CreatedAt, 0).Hour()
			hourlyStats[hour]++
		}
	}
	
	return hourlyStats, nil
}

func (s *StatsService) GetTopMerchants(ctx context.Context, limit int) ([]MerchantStats, error) {
	allOrders, err := s.getAllOrders(ctx)
	if err != nil {
		return nil, err
	}
	
	merchantMap := make(map[string]*MerchantStats)
	
	for _, order := range allOrders {
		if !order.SiteID.Valid || order.Status != 1 {
			continue
		}
		
		siteID := order.SiteID.String
		if _, exists := merchantMap[siteID]; !exists {
			site, _ := s.db.GetSite(ctx, siteID)
			merchantMap[siteID] = &MerchantStats{
				SiteID:      siteID,
				SiteName:    site.Name,
				TotalAmount: decimal.Zero,
			}
		}
		
		merchantMap[siteID].OrderCount++
		merchantMap[siteID].TotalAmount = merchantMap[siteID].TotalAmount.Add(decimal.NewFromFloat(order.Amount))
	}
	
	// 转换为切片并排序
	var merchants []MerchantStats
	for _, stat := range merchantMap {
		merchants = append(merchants, *stat)
	}
	
	// 按金额排序
	for i := 0; i < len(merchants); i++ {
		for j := i + 1; j < len(merchants); j++ {
			if merchants[j].TotalAmount.GreaterThan(merchants[i].TotalAmount) {
				merchants[i], merchants[j] = merchants[j], merchants[i]
			}
		}
	}
	
	if len(merchants) > limit {
		merchants = merchants[:limit]
	}
	
	return merchants, nil
}

type MerchantStats struct {
	SiteID      string          `json:"site_id"`
	SiteName    string          `json:"site_name"`
	OrderCount  int            `json:"order_count"`
	TotalAmount decimal.Decimal `json:"total_amount"`
}

func (s *StatsService) getAllOrders(ctx context.Context) ([]db.Order, error) {
	// 这里应该实现一个获取所有订单的查询
	// 暂时使用 GetPendingOrders 作为示例
	futureTime := time.Now().Add(365 * 24 * time.Hour).Unix()
	return s.db.GetPendingOrders(ctx, futureTime)
}

func (s *StatsService) ExportReport(ctx context.Context, startDate, endDate time.Time) ([]byte, error) {
	// TODO: 实现导出报表功能
	// 可以生成 CSV 或 Excel 文件
	return nil, nil
}