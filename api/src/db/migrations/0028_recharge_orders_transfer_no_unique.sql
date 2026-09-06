-- 0028_recharge_orders_transfer_no_unique.sql
-- R1 人工上账转账单号全平台唯一（ARCH §12.2 裁决 A6 / PRD §3.1.3 C9 / 边界 B4）：
-- transfer_no 填写则全平台唯一，同一转账单号重复创建被拒（防重复入账第一道闸）。
--
-- 部分唯一索引：仅约束「已填写 transfer_no」的行（metadata->>'transfer_no' IS NOT NULL）；
-- 未填写 transfer_no 的存量/新建行（NULL）不受限，无需数据回填。
-- 并发窗口兜底：应用层存在性校验（见 admin-finance-missing.ts 创建端点）之外，
-- 并发双写由本唯一索引拒绝（23505 → 路由层转 409 TRANSFER_NO_DUPLICATE）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_recharge_orders_transfer_no ON recharge_orders ((metadata->>'transfer_no')) WHERE metadata->>'transfer_no' IS NOT NULL;
