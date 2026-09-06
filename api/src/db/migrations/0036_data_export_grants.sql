-- 数据导出授权表 data_export_grants（PRD-数据导出授权管理 §3）
-- 用户端「数据导出」能力开关：user_id 唯一，一条记录通过 is_enabled 启/停。
-- 外键不级联删除：用户删除后授权记录保留用于审计。
CREATE TABLE IF NOT EXISTS data_export_grants (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id),
    is_enabled boolean NOT NULL DEFAULT true,
    granted_by integer REFERENCES users(id) ON DELETE SET NULL,
    granted_at timestamp DEFAULT now(),
    disabled_by integer REFERENCES users(id) ON DELETE SET NULL,
    disabled_at timestamp,
    remark varchar(500),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

-- 一个用户仅一条授权记录（启/停通过对同一行 is_enabled 置位实现）
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_export_grants_user_id ON data_export_grants(user_id);
-- 「列出全部已授权用户」过滤索引
CREATE INDEX IF NOT EXISTS idx_data_export_grants_enabled ON data_export_grants(is_enabled);
