INSERT INTO _migrations (name, hash, executed_at) VALUES ('2026-07-20-vendor-key-groups.sql', '5d898209', NOW()) ON CONFLICT (name) DO NOTHING;
INSERT INTO _migrations (name, hash, executed_at) VALUES ('2026-07-22-content-filters.sql', '66c8ce38', NOW()) ON CONFLICT (name) DO NOTHING;
