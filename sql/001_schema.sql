CREATE TABLE IF NOT EXISTS investigations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(500) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'created',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_investigations_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS research_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  investigation_id BIGINT UNSIGNED NOT NULL,
  job_type VARCHAR(80) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  payload_json JSON NULL,
  result_json JSON NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_research_jobs_investigation (investigation_id),
  KEY idx_research_jobs_status (status),
  CONSTRAINT fk_research_jobs_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  investigation_id BIGINT UNSIGNED NULL,
  url VARCHAR(2048) NOT NULL,
  title VARCHAR(1000) NULL,
  source_type VARCHAR(50) NULL,
  publisher VARCHAR(255) NULL,
  published_at DATETIME NULL,
  discovered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  relevance_score DECIMAL(8,4) NULL,
  quality_score DECIMAL(8,4) NULL,
  recency_score DECIMAL(8,4) NULL,
  authority_score DECIMAL(8,4) NULL,
  correspondence_score DECIMAL(8,4) NULL,
  ranking_score DECIMAL(8,4) NULL,
  metadata_json JSON NULL,
  content_hash CHAR(64) NULL,
  PRIMARY KEY (id),
  KEY idx_sources_investigation (investigation_id),
  KEY idx_sources_hash (content_hash),
  KEY idx_sources_published_at (published_at),
  CONSTRAINT fk_sources_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_relations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id BIGINT UNSIGNED NOT NULL,
  related_source_id BIGINT UNSIGNED NOT NULL,
  relation_type VARCHAR(80) NOT NULL,
  score DECIMAL(8,4) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_source_relation (source_id, related_source_id, relation_type),
  CONSTRAINT fk_source_relations_source
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
  CONSTRAINT fk_source_relations_related
    FOREIGN KEY (related_source_id) REFERENCES sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS topics (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  investigation_id BIGINT UNSIGNED NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NULL,
  source_count INT UNSIGNED NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_topics_investigation (investigation_id),
  CONSTRAINT fk_topics_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  investigation_id BIGINT UNSIGNED NULL,
  provider VARCHAR(80) NULL,
  model VARCHAR(160) NULL,
  operation VARCHAR(100) NULL,
  input_tokens INT UNSIGNED NULL,
  output_tokens INT UNSIGNED NULL,
  estimated_cost DECIMAL(12,6) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_usage_investigation (investigation_id),
  CONSTRAINT fk_ai_usage_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
