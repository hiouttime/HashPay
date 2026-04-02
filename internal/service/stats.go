package service

import (
	"errors"
	"sort"
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

type OverviewRange struct {
	Key           string
	Start         time.Time
	End           time.Time
	PreviousStart time.Time
	PreviousEnd   time.Time
}

type MethodStat struct {
	Method string
	Amount float64
	Count  int
}

type SiteStat struct {
	SiteID string
	Amount float64
}

type TrendPoint struct {
	Label          string
	CurrentOrders  int
	PreviousOrders int
	CurrentAmount  float64
	PreviousAmount float64
}

type Overview struct {
	Range   OverviewRange
	Current struct {
		OrderCount int
		PaidAmount float64
	}
	Previous struct {
		OrderCount int
		PaidAmount float64
	}
	MethodStats []MethodStat
	SiteStats   []SiteStat
	Trend       []TrendPoint
}

type overviewTimeline struct {
	CurrentStart  time.Time
	PreviousStart time.Time
	Step          time.Duration
	Size          int
	Labels        []string
}

func (s *StatsService) Get() (*Stats, error) {
	now := time.Now()
	todayStart := dayStart(now)

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

func (s *StatsService) GetOverview(rangeKey string) (*Overview, error) {
	rng, err := buildOverviewRange(rangeKey, time.Now())
	if err != nil {
		return nil, err
	}

	timeline := buildOverviewTimeline(rng)

	orders, err := s.orders.GetAll()
	if err != nil {
		return nil, err
	}

	out := &Overview{Range: rng}
	out.Trend = make([]TrendPoint, timeline.Size)
	for i := 0; i < timeline.Size; i++ {
		out.Trend[i].Label = timeline.Labels[i]
	}

	methodMap := map[string]*MethodStat{}
	siteMap := map[string]float64{}

	for _, o := range orders {
		if inRange(o.CreatedAt, rng.Start, rng.End) {
			out.Current.OrderCount++

			if idx := trendIndex(o.CreatedAt, timeline.CurrentStart, timeline.Step, timeline.Size); idx >= 0 {
				out.Trend[idx].CurrentOrders++
			}

			if o.Status == model.OrderPaid {
				out.Current.PaidAmount += o.Amount

				if idx := trendIndex(o.CreatedAt, timeline.CurrentStart, timeline.Step, timeline.Size); idx >= 0 {
					out.Trend[idx].CurrentAmount += o.Amount
				}

				method := buildMethodKey(o.PayChain, o.PayCurrency)
				stat, ok := methodMap[method]
				if !ok {
					stat = &MethodStat{Method: method}
					methodMap[method] = stat
				}
				stat.Amount += o.Amount
				stat.Count++

				if o.SiteID != "" {
					siteMap[o.SiteID] += o.Amount
				}
			}
		}

		if inRange(o.CreatedAt, rng.PreviousStart, rng.PreviousEnd) {
			out.Previous.OrderCount++

			if idx := trendIndex(o.CreatedAt, timeline.PreviousStart, timeline.Step, timeline.Size); idx >= 0 {
				out.Trend[idx].PreviousOrders++
			}

			if o.Status == model.OrderPaid {
				out.Previous.PaidAmount += o.Amount
				if idx := trendIndex(o.CreatedAt, timeline.PreviousStart, timeline.Step, timeline.Size); idx >= 0 {
					out.Trend[idx].PreviousAmount += o.Amount
				}
			}
		}
	}

	out.MethodStats = make([]MethodStat, 0, len(methodMap))
	for _, stat := range methodMap {
		out.MethodStats = append(out.MethodStats, *stat)
	}
	sort.Slice(out.MethodStats, func(i, j int) bool {
		return out.MethodStats[i].Amount > out.MethodStats[j].Amount
	})

	out.SiteStats = make([]SiteStat, 0, len(siteMap))
	for siteID, amount := range siteMap {
		out.SiteStats = append(out.SiteStats, SiteStat{SiteID: siteID, Amount: amount})
	}
	sort.Slice(out.SiteStats, func(i, j int) bool {
		return out.SiteStats[i].Amount > out.SiteStats[j].Amount
	})

	return out, nil
}

func buildOverviewRange(key string, now time.Time) (OverviewRange, error) {
	if key == "" {
		key = "7d"
	}

	end := now
	var start time.Time
	switch key {
	case "today":
		start = dayStart(now)
	case "7d":
		start = dayStart(now.AddDate(0, 0, -6))
	case "30d":
		start = dayStart(now.AddDate(0, 0, -29))
	case "90d":
		start = dayStart(now.AddDate(0, 0, -89))
	default:
		return OverviewRange{}, errors.New("无效的时间范围")
	}

	duration := end.Sub(start)
	previousEnd := start
	previousStart := previousEnd.Add(-duration)

	return OverviewRange{
		Key:           key,
		Start:         start,
		End:           end,
		PreviousStart: previousStart,
		PreviousEnd:   previousEnd,
	}, nil
}

func buildOverviewTimeline(rng OverviewRange) overviewTimeline {
	if rng.Key == "today" {
		currentStart := rng.Start
		previousStart := currentStart.AddDate(0, 0, -1)
		step := time.Hour
		size := int(rng.End.Sub(currentStart)/step) + 1
		if size < 1 {
			size = 1
		}

		labels := make([]string, size)
		for i := 0; i < size; i++ {
			labels[i] = currentStart.Add(time.Duration(i) * step).Format("15:04")
		}

		return overviewTimeline{
			CurrentStart:  currentStart,
			PreviousStart: previousStart,
			Step:          step,
			Size:          size,
			Labels:        labels,
		}
	}

	currentStart := dayStart(rng.Start)
	step := 24 * time.Hour
	size := int(rng.End.Sub(currentStart)/step) + 1
	if size < 1 {
		size = 1
	}
	previousStart := currentStart.AddDate(0, 0, -size)

	labels := make([]string, size)
	for i := 0; i < size; i++ {
		labels[i] = currentStart.AddDate(0, 0, i).Format("01-02")
	}

	return overviewTimeline{
		CurrentStart:  currentStart,
		PreviousStart: previousStart,
		Step:          step,
		Size:          size,
		Labels:        labels,
	}
}

func trendIndex(t, start time.Time, step time.Duration, size int) int {
	if t.Before(start) {
		return -1
	}
	idx := int(t.Sub(start) / step)
	if idx < 0 || idx >= size {
		return -1
	}
	return idx
}

func dayStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

func inRange(t, start, end time.Time) bool {
	return (t.Equal(start) || t.After(start)) && t.Before(end)
}

func buildMethodKey(chain, currency string) string {
	if chain == "" && currency == "" {
		return "未选择支付方式"
	}
	if chain == "" {
		return currency
	}
	if currency == "" {
		return chain
	}
	return chain + " · " + currency
}
