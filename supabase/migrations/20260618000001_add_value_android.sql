ALTER TABLE app_config ADD COLUMN IF NOT EXISTS value_android text;

-- Copy existing value into value_android for current row
UPDATE app_config SET value_android = value WHERE key = 'min_version' AND value_android IS NULL;
