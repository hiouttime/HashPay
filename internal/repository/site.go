package repository

import (
	"database/sql"
	"time"

	"hashpay/internal/model"
)

type SiteRepo struct {
	db *DB
}

func NewSiteRepo(db *DB) *SiteRepo {
	return &SiteRepo{db: db}
}

func (r *SiteRepo) Create(s *model.Site) error {
	query := `
		INSERT INTO sites (id, name, api_key, callback, notify, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	_, err := r.db.Exec(query,
		s.ID, s.Name, s.APIKey, s.Callback, s.Notify,
		s.CreatedAt.Unix(), s.UpdatedAt.Unix(),
	)
	return err
}

func (r *SiteRepo) GetByAPIKey(apiKey string) (*model.Site, error) {
	query := `
		SELECT id, name, api_key, callback, notify, created_at, updated_at
		FROM sites WHERE api_key = ?
	`

	var s model.Site
	var callback, notify sql.NullString
	var createdAt, updatedAt int64

	err := r.db.QueryRow(query, apiKey).Scan(
		&s.ID, &s.Name, &s.APIKey, &callback, &notify,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}

	s.Callback = callback.String
	s.Notify = notify.String
	s.CreatedAt = time.Unix(createdAt, 0)
	s.UpdatedAt = time.Unix(updatedAt, 0)

	return &s, nil
}

func (r *SiteRepo) GetByID(id string) (*model.Site, error) {
	query := `
		SELECT id, name, api_key, callback, notify, created_at, updated_at
		FROM sites WHERE id = ?
	`

	var s model.Site
	var callback, notify sql.NullString
	var createdAt, updatedAt int64

	err := r.db.QueryRow(query, id).Scan(
		&s.ID, &s.Name, &s.APIKey, &callback, &notify,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}

	s.Callback = callback.String
	s.Notify = notify.String
	s.CreatedAt = time.Unix(createdAt, 0)
	s.UpdatedAt = time.Unix(updatedAt, 0)

	return &s, nil
}

func (r *SiteRepo) GetAll() ([]model.Site, error) {
	query := `
		SELECT id, name, api_key, callback, notify, created_at, updated_at
		FROM sites
	`

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sites []model.Site
	for rows.Next() {
		var s model.Site
		var callback, notify sql.NullString
		var createdAt, updatedAt int64

		err := rows.Scan(
			&s.ID, &s.Name, &s.APIKey, &callback, &notify,
			&createdAt, &updatedAt,
		)
		if err != nil {
			return nil, err
		}

		s.Callback = callback.String
		s.Notify = notify.String
		s.CreatedAt = time.Unix(createdAt, 0)
		s.UpdatedAt = time.Unix(updatedAt, 0)
		sites = append(sites, s)
	}

	return sites, nil
}

func (r *SiteRepo) Update(s *model.Site) error {
	query := `
		UPDATE sites SET name = ?, callback = ?, notify = ?, updated_at = ?
		WHERE id = ?
	`
	_, err := r.db.Exec(query, s.Name, s.Callback, s.Notify, time.Now().Unix(), s.ID)
	return err
}

func (r *SiteRepo) Delete(id string) error {
	_, err := r.db.Exec("DELETE FROM sites WHERE id = ?", id)
	return err
}
