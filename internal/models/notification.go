package models

import "time"

func (m *Models) QueueNotification(orderID string) error {
	ts := nowUnix()
	_, err := m.db.Exec(`
		INSERT INTO notification_tasks(order_id, status, attempts, last_error, next_run_at, created_at, updated_at)
		VALUES(?, ?, 0, '', ?, ?, ?)
	`, orderID, NotifyPending, ts, ts, ts)
	return err
}

func (m *Models) DueNotifications(limit int) ([]NotificationTask, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := m.db.Query(`
		SELECT id, order_id, status, attempts, last_error, next_run_at, created_at, updated_at
		FROM notification_tasks
		WHERE status IN (?, ?) AND next_run_at <= ?
		ORDER BY next_run_at ASC
		LIMIT ?
	`, NotifyPending, NotifyRetry, nowUnix(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []NotificationTask
	for rows.Next() {
		var item NotificationTask
		var nextRunAt, createdAt, updatedAt int64
		if err := rows.Scan(&item.ID, &item.OrderID, &item.Status, &item.Attempts, &item.LastError, &nextRunAt, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item.NextRunAt = timePtr(nextRunAt)
		item.CreatedAt = timePtr(createdAt)
		item.UpdatedAt = timePtr(updatedAt)
		list = append(list, item)
	}
	return list, rows.Err()
}

func (m *Models) MarkNotificationDone(id int64) error {
	_, err := m.db.Exec(`
		UPDATE notification_tasks SET status = ?, updated_at = ? WHERE id = ?
	`, NotifyDone, nowUnix(), id)
	return err
}

func (m *Models) MarkNotificationRetry(id int64, attempts int, errText string, next time.Time) error {
	status := NotifyRetry
	if attempts >= 5 {
		status = NotifyFailed
	}
	_, err := m.db.Exec(`
		UPDATE notification_tasks
		SET status = ?, attempts = ?, last_error = ?, next_run_at = ?, updated_at = ?
		WHERE id = ?
	`, status, attempts, errText, next.Unix(), nowUnix(), id)
	return err
}

func (m *Models) Cursor(key string) int64 {
	var value int64
	if err := m.db.QueryRow("SELECT cursor_value FROM job_cursors WHERE cursor_key = ?", key).Scan(&value); err != nil {
		return 0
	}
	return value
}

func (m *Models) SetCursor(key string, value int64) error {
	_, err := m.db.Exec(`
		INSERT INTO job_cursors(cursor_key, cursor_value, updated_at)
		VALUES(?, ?, ?)
		ON CONFLICT(cursor_key) DO UPDATE SET cursor_value = excluded.cursor_value, updated_at = excluded.updated_at
	`, key, value, nowUnix())
	return err
}
