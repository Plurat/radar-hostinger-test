# Radar Editorial 0.2.2

Web-only MVP. Adds deterministic source classification and preliminary editorial ranking without AI.

Ranking weights: relevance 40%, quality 25%, recency 15%, authority 10%, correspondence 10%.

No database schema migration is required. Existing `sources.quality_score`, `sources.authority_score` and `sources.source_type` columns are used.
