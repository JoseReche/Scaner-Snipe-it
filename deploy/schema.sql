CREATE DATABASE IF NOT EXISTS snipe_mobile
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'snipe_mobile'@'localhost'
  IDENTIFIED BY 'troque_esta_senha';

GRANT ALL PRIVILEGES ON snipe_mobile.* TO 'snipe_mobile'@'localhost';
FLUSH PRIVILEGES;

USE snipe_mobile;

CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'operator',
  active TINYINT(1) NOT NULL DEFAULT 1,
  snipe_it_url VARCHAR(500) NOT NULL,
  snipe_it_token TEXT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_events (
  id VARCHAR(64) PRIMARY KEY,
  created_at DATETIME NOT NULL,
  status VARCHAR(40) NOT NULL,
  payload JSON NOT NULL,
  INDEX idx_app_events_created_at (created_at),
  INDEX idx_app_events_status (status)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  id VARCHAR(80) PRIMARY KEY,
  payload JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
