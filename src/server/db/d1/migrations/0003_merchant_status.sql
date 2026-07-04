UPDATE merchants SET status = 'enabled' WHERE status = 'active';
UPDATE merchants SET status = 'disabled' WHERE status = 'paused';
