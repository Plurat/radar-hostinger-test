CREATE TABLE IF NOT EXISTS investigations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  objective TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_investigations_status (status),
  KEY idx_investigations_created_at (created_at),
  KEY idx_investigations_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS research_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  investigation_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  job_type VARCHAR(64) NOT NULL DEFAULT 'research',
  payload JSON NULL,
  created_at DATETIME NOT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  error_message TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_jobs_investigation (investigation_id),
  CONSTRAINT fk_jobs_investigation FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  investigation_id BIGINT UNSIGNED NULL,
  title TEXT NOT NULL, url TEXT NOT NULL, domain VARCHAR(255) NULL, source_type VARCHAR(64) NULL, published_at DATETIME NULL, summary TEXT NULL, relevance_score DECIMAL(6,3) NULL, quality_score DECIMAL(6,3) NULL, authority_score DECIMAL(6,3) NULL, raw_data JSON NULL, created_at DATETIME NOT NULL,
  PRIMARY KEY (id), KEY idx_sources_investigation (investigation_id), CONSTRAINT fk_sources_investigation FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_relations (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, source_id BIGINT UNSIGNED NOT NULL, related_source_id BIGINT UNSIGNED NOT NULL, relation_type VARCHAR(64) NOT NULL, score DECIMAL(6,3) NULL, PRIMARY KEY (id), UNIQUE KEY uq_source_relation (source_id, related_source_id, relation_type), CONSTRAINT fk_sr_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE, CONSTRAINT fk_sr_related FOREIGN KEY (related_source_id) REFERENCES sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS topics (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, investigation_id BIGINT UNSIGNED NULL, name VARCHAR(255) NOT NULL, score DECIMAL(6,3) NULL, evidence JSON NULL, created_at DATETIME NOT NULL, PRIMARY KEY (id), KEY idx_topics_investigation (investigation_id), CONSTRAINT fk_topics_investigation FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, investigation_id BIGINT UNSIGNED NULL, provider VARCHAR(64) NULL, model VARCHAR(128) NULL, input_tokens INT NULL, output_tokens INT NULL, estimated_cost DECIMAL(12,6) NULL, created_at DATETIME NOT NULL, PRIMARY KEY (id), KEY idx_ai_usage_investigation (investigation_id), CONSTRAINT fk_ai_usage_investigation FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, email VARCHAR(255) NOT NULL, name VARCHAR(255) NULL, crp VARCHAR(8) NULL, password_hash VARCHAR(255) NOT NULL, password_salt VARCHAR(128) NOT NULL, role VARCHAR(32) NOT NULL DEFAULT 'user', status VARCHAR(32) NOT NULL DEFAULT 'active', investigations_limit INT NOT NULL DEFAULT 10, research_limit INT NOT NULL DEFAULT 30, analysis_limit INT NOT NULL DEFAULT 20, sources_per_research INT NOT NULL DEFAULT 15, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, last_login_at DATETIME NULL, PRIMARY KEY(id), UNIQUE KEY uq_users_email(email), UNIQUE KEY uq_users_crp(crp)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id BIGINT UNSIGNED NOT NULL, token_hash CHAR(64) NOT NULL, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL, last_seen_at DATETIME NULL, PRIMARY KEY(id), UNIQUE KEY uq_sessions_token(token_hash), KEY idx_sessions_user(user_id), CONSTRAINT fk_sessions_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_analyses (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, investigation_id BIGINT UNSIGNED NOT NULL, source_id BIGINT UNSIGNED NOT NULL, model VARCHAR(128) NULL, analysis JSON NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(id), UNIQUE KEY uq_source_analysis(investigation_id,source_id), KEY idx_source_analyses_investigation(investigation_id), CONSTRAINT fk_sa_investigation FOREIGN KEY(investigation_id) REFERENCES investigations(id) ON DELETE CASCADE, CONSTRAINT fk_sa_source FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(120) NOT NULL, setting_value LONGTEXT NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(setting_key)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS email_logs (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id BIGINT UNSIGNED NULL, event_type VARCHAR(64) NOT NULL, recipient VARCHAR(255) NOT NULL, subject VARCHAR(500) NOT NULL, status VARCHAR(32) NOT NULL, error_message TEXT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY idx_email_logs_user(user_id), KEY idx_email_logs_created(created_at), CONSTRAINT fk_email_logs_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
