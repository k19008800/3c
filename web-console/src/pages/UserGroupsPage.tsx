/**
 * 用户端「我的分组」页 — UserGroupsPage
 *
 * 对齐后端「一人一组」契约（api/src/routes/me.ts）：
 *   GET /api/v1/me/group        — 当前用户分组信息（无分组时 data=null）
 *   GET /api/v1/me/group/models — 当前用户可用模型名列表（白名单为空 = 平台全部可用模型）
 *
 * 旧契约处理：原页面按「API Key 多对多绑定分组」实现（GET /me/groups 复数列表、
 * PATCH /me/groups/:id 启停、/me/api-keys/:id body 带 group_ids），后端为「用户一对一
 * 归属分组」，上述旧接口均不存在（404）。本页已整体重写：展示「我的分组」+「可用模型」，
 * 删除 Key 绑定分组相关交互（API Key 管理仍在 /api-keys 页面）。
 *
 * 设计原则（PRODUCT-DESIGN-PRINCIPLES.md P1）：页面标题旁 [?] 页面级帮助；
 * 面板标题旁 [?] 帮助；交互入口旁 [?] 按钮级帮助（HelpIcon 悬停）。
 *
 * @module pages/UserGroupsPage
 * @see api/src/routes/me.ts
 */

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, Panel, SkeletonGroup, EmptyState, StatusBadge, Tag } from "@3cloud/shared-ui";
import type { CSSProperties, ReactNode } from "react";

/* ============ 类型 ============ */

/** 我的分组 DTO（GET /me/group → data） */
interface MyGroup {
  id: number;
  name: string;
  description: string | null;
  pricingGroup: string | null;
  rateLimitQps: number | null;
  rateLimitTpm: number | null;
  dailyQuota: number | null;
  modelWhitelist: string[];
  isDefault: boolean;
  status: string;
}

/* ============ 常量 ============ */

/** 模型标签样式 */
const MODEL_TAG_STYLE: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  background: "#f0f2ff",
  color: "#4f6ef7",
  fontSize: 11,
  border: "1px solid rgba(79,110,247,0.12)",
  margin: "2px 4px 2px 0",
};

export default function UserGroupsPage() {
  /* 当前用户分组信息（一人一组；无分组时后端返回 data=null） */
  const groupQ = useQuery({
    queryKey: ["me-group"],
    queryFn: async () => (await api.get<{ data: MyGroup | null }>("/me/group")).data.data,
  });

  /* 当前用户可用模型列表（白名单为空 → 全部平台可用模型） */
  const modelsQ = useQuery({
    queryKey: ["me-group-models"],
    queryFn: async () => (await api.get<{ data: string[] }>("/me/group/models")).data.data,
  });

  const group = groupQ.data;
  const models = modelsQ.data ?? [];
  const whitelistEmpty = !group || group.modelWhitelist.length === 0;

  return (
    <div>
      {/* 标题 + 页面级帮助 */}
      <h2 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
        📋 我的分组
        <HelpIcon
          text="展示您当前所属的用户分组及其配额：可用模型白名单、限流（QPS/TPM）与日消费额度。您的 API 调用将按所在分组的配置生效；一个用户同一时刻只属于一个分组，如无分组请联系管理员。"
          level="page"
        />
      </h2>

      {/* 说明横幅 */}
      <div
        style={{
          background: "#f8f9ff",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: "1px solid rgba(79,110,247,0.12)",
        }}
      >
        <span style={{ fontSize: 18 }}>💡</span>
        <span style={{ fontSize: 13, color: "#555", flex: 1 }}>
          您当前归属的分组由管理员配置，决定您可调用的模型与配额上限；API Key 仅用于鉴权计费，无需再单独绑定分组。
        </span>
        <Link to="/api-keys" style={{ fontSize: 13, color: "#4f6ef7", textDecoration: "none", whiteSpace: "nowrap" }}>
          前往 API Key 管理 →
        </Link>
        <HelpIcon text="API Key 不再承担分组绑定，分组归属作用于整个账户" />
      </div>

      {/* ===== 我的分组 ===== */}
      <Panel
        title="📋 我的分组"
        help="当前账户所属分组及其配额配置：限流（QPS/TPM）与日额度为空表示不限制，模型白名单为空表示全部模型可用。"
      >
        {groupQ.isLoading ? (
          <SkeletonGroup lines={4} />
        ) : !group ? (
          <EmptyState title="暂无可用分组" description="您尚未被分配用户分组，请联系管理员处理" />
        ) : (
          <div>
            {(
              [
                {
                  label: "分组名称",
                  node: (
                    <span style={{ fontWeight: 600 }}>
                      {group.name}
                      {group.isDefault && (
                        <span style={{ marginLeft: 8 }}>
                          <Tag type="purple">默认组</Tag>
                        </span>
                      )}
                    </span>
                  ),
                },
                { label: "描述", node: group.description || "-" },
                {
                  label: "定价分组",
                  node: group.pricingGroup ? <Tag type="blue">{group.pricingGroup}</Tag> : <span style={{ color: "#bbb" }}>默认</span>,
                },
                { label: "限流 QPS", node: group.rateLimitQps ?? "不限" },
                { label: "限流 TPM", node: group.rateLimitTpm ?? "不限" },
                { label: "日消费额度", node: group.dailyQuota != null ? `¥${group.dailyQuota}` : "不限" },
                {
                  label: "模型白名单",
                  node:
                    group.modelWhitelist.length === 0 ? (
                      <span style={{ color: "#bbb" }}>全部模型可用</span>
                    ) : (
                      <span>
                        {group.modelWhitelist.map((m) => (
                          <span key={m} style={MODEL_TAG_STYLE}>{m}</span>
                        ))}
                      </span>
                    ),
                },
                {
                  label: "状态",
                  node: (
                    <StatusBadge status={group.status === "active" ? "success" : "danger"}>
                      {group.status === "active" ? "启用" : "停用"}
                    </StatusBadge>
                  ),
                },
              ] as { label: string; node: ReactNode }[]
            ).map((row) => (
              <div key={row.label} style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                <span style={{ width: 120, fontSize: 13, color: "#888", flexShrink: 0 }}>{row.label}</span>
                <span style={{ fontSize: 13, color: "#333", flex: 1 }}>{row.node}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ===== 可用模型 ===== */}
      <Panel
        title="🤖 可用模型"
        help="您所在分组允许调用的平台模型列表：白名单为空时展示平台全部可用模型；实际可用性以模型上架状态为准。"
      >
        {modelsQ.isLoading ? (
          <SkeletonGroup lines={4} />
        ) : models.length === 0 ? (
          <EmptyState title="暂无可用模型" description="当前分组未开放任何模型，请联系管理员" />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
              {models.map((m) => (
                <div
                  key={m}
                  style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid #eee", background: "#fff", textAlign: "center" }}
                >
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: "#333", fontWeight: 500 }}>{m}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: "#888" }}>
              共 {models.length} 个模型
              {whitelistEmpty ? "（当前分组未限制模型，展示平台全部可用模型）" : ""}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
