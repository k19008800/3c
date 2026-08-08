import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  StatusBadge,
  Table,
  SkeletonGroup,
  Modal,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/**
 * 安全中心 对齐 SPEC-§20
 * Tab1 消费预算 / Tab2 双因素认证 / Tab3 设备管理 / Tab4 Key权限 / Tab5 登录安全
 */

const card: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
};
const btnBase: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};
const inp: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  width: "100%",
  boxSizing: "border-box",
  marginBottom: 10,
  fontFamily: "inherit",
};

const BUDGET_HELP =
  "设置月度/日度消费预算，防止超支。hard=超限熔断；soft=仅预警。可设置预警阈值与豁免Key。";
const TWOFA_HELP =
  "双因素认证：使用 Authenticator 应用扫描二维码，每次登录需输入 6 位动态码，提升账户安全。";
const DEVICE_HELP =
  "查看所有已登录设备，可远程登出可疑设备。可疑设备带风险标记。";
const KEY_HELP =
  "对单个 API Key 设置模型范围、IP白名单、域名限制、每日额度等访问控制。";
const LOGIN_HELP =
  "查看登录记录与安全异常汇总，可确认本人登录或报告异常（触发保护措施）。";

export default function SecurityPage() {
  const [tab, setTab] = useState<"budget" | "2fa" | "devices" | "key" | "login">("budget");

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>
        安全中心
        <HelpIcon
          text="安全中心：管理消费预算、双因素认证、设备管理、Key 权限和登录安全。保护您的账户和 API 密钥安全。"
          level="page"
        />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginTop: 0, fontSize: 13 }}>
        账户安全与消费控制 · SPEC-§20
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(
          [
            ["budget", "消费预算"],
            ["2fa", "双因素认证"],
            ["devices", "设备管理"],
            ["key", "Key权限"],
            ["login", "登录安全"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              ...btnBase,
              background: tab === k ? "var(--color-primary)" : "#fff",
              color: tab === k ? "#fff" : "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "budget" && <BudgetTab />}
      {tab === "2fa" && <TwoFaTab />}
      {tab === "devices" && <DevicesTab />}
      {tab === "key" && <KeyPermTab />}
      {tab === "login" && <LoginTab />}
    </div>
  );
}

/* ==================== Tab1 消费预算 ==================== */
function BudgetTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<any>(null);
  const [confirmFn, setConfirmFn] = useState<(() => void) | null>(null);
  const [confirmMsg, setConfirmMsg] = useState("");

  const settingsQ = useQuery({
    queryKey: ["me-budget"],
    queryFn: async () => (await api.get<{ data: any }>("/me/budget/settings")).data.data,
  });
  const statusQ = useQuery({
    queryKey: ["me-budget-status"],
    queryFn: async () => (await api.get<{ data: any }>("/me/budget/status")).data.data,
  });
  const keysQ = useQuery({
    queryKey: ["me-api-keys"],
    queryFn: async () => (await api.get<{ data: { list?: any[] } | any[] }>("/me/api-keys")).data.data,
  });
  const keyList = Array.isArray(keysQ.data) ? keysQ.data : keysQ.data?.list ?? [];

  const saveMut = useMutation({
    mutationFn: async () =>
      (
        await api.put("/me/budget/settings", {
          monthlyBudget: Number(form.monthly_budget),
          dailyBudget: Number(form.daily_budget),
          budgetType: form.budget_type,
          autoBlock: form.auto_block,
          alertThresholds: form.alert_thresholds,
          exemptKeys: form.exempt_keys,
        })
      ).data,
    onSuccess: (d: any) => {
      toast.success(d?.data?.message ?? "已保存");
      qc.invalidateQueries({ queryKey: ["me-budget"] });
      qc.invalidateQueries({ queryKey: ["me-budget-status"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });
  const unblockMut = useMutation({
    mutationFn: async (action: string) =>
      (await api.post("/me/budget/unblock", { action, reason: "用户操作" })).data,
    onSuccess: () => {
      toast.success("已解除熔断");
      qc.invalidateQueries({ queryKey: ["me-budget-status"] });
      qc.invalidateQueries({ queryKey: ["me-budget"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  if (!form && settingsQ.data) {
    try {
      setForm({
        monthly_budget: Number(settingsQ.data.monthly_budget ?? 0),
        daily_budget: Number(settingsQ.data.daily_budget ?? 0),
        budget_type: settingsQ.data.budget_type ?? "hard",
        auto_block: !!settingsQ.data.auto_block,
        alert_thresholds: (settingsQ.data.alert_thresholds ?? "80")
          .split(",")
          .map(Number),
        exempt_keys: (() => {
          try {
            return JSON.parse(settingsQ.data.exempt_keys || "[]");
          } catch {
            return [];
          }
        })(),
      });
    } catch {
      /* noop */
    }
  }

  const st = statusQ.data;
  const spentPercent = st?.spent_percent ?? 0;
  const barColor =
    spentPercent > 80
      ? "var(--color-danger-text)"
      : spentPercent > 50
      ? "var(--color-warning-text)"
      : "var(--color-success-text)";

  return (
    <div>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>本月消费 / 预算</strong>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            日预算: ¥{st?.daily_budget ?? 0} · 剩余 {st?.remaining_days ?? 0} 天
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
          <span style={{ color: barColor }}>¥{st?.current_month_spent ?? 0}</span>
          <span>
            / ¥{st?.monthly_budget ?? 0} ({spentPercent}%)
          </span>
        </div>
        <div
          style={{
            height: 10,
            background: "var(--color-border)",
            borderRadius: 6,
            marginTop: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(spentPercent, 100)}%`,
              background: barColor,
              borderRadius: 6,
            }}
          />
        </div>
        {st?.blocked ? (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: "var(--color-danger-bg)",
              borderRadius: 8,
              color: "var(--color-danger-text)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong>● 已熔断（预算已用尽）</strong>
            <button
              onClick={() => {
                setConfirmMsg("解除熔断后您的 API Key 将恢复调用。确认解除？");
                setConfirmFn(() => () => unblockMut.mutate("disable_block"));
              }}
              style={{
                ...btnBase,
                background: "var(--color-danger-text)",
                color: "#fff",
                padding: "6px 12px",
              }}
            >
              解除熔断
            </button>
          </div>
        ) : spentPercent >= 100 ? (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: "var(--color-warning-bg)",
              borderRadius: 8,
              color: "var(--color-warning-text)",
            }}
          >
            ⚠ 软上限超限
          </div>
        ) : (
          <div style={{ marginTop: 12, color: "var(--color-success-text)", fontSize: 13 }}>
            ● 运行中{spentPercent >= 50 ? " · 已使用 " + spentPercent + "%" : ""}
          </div>
        )}
      </div>

      <div style={card}>
        <h4 style={{ margin: 0, marginBottom: 16 }}>预算设置</h4>
        {!form ? (
          <SkeletonGroup lines={5} />
        ) : (
          <>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              月预算（元，0=不限制）
            </label>
            <input
              type="number"
              min={0}
              value={form.monthly_budget}
              onChange={(e) => setForm({ ...form, monthly_budget: Number(e.target.value) })}
              style={inp}
            />
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              日预算（元，0=关闭）
            </label>
            <input
              type="number"
              min={0}
              value={form.daily_budget}
              onChange={(e) => setForm({ ...form, daily_budget: Number(e.target.value) })}
              style={inp}
            />
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13, color: "var(--color-text-secondary)", marginRight: 16 }}>
                <input
                  type="radio"
                  checked={form.budget_type === "hard"}
                  onChange={() => setForm({ ...form, budget_type: "hard" })}
                />{" "}
                硬上限（熔断）
              </label>
              <label style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                <input
                  type="radio"
                  checked={form.budget_type === "soft"}
                  onChange={() => setForm({ ...form, budget_type: "soft" })}
                />{" "}
                软上限（仅预警）
              </label>
            </div>
            <button
              onClick={() => saveMut.mutate()}
              style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}
            >
              保存预算
            </button>
          </>
        )}
      </div>

      <Modal open={!!confirmFn} onClose={() => setConfirmFn(null)} title="确认操作">
        <p style={{ color: "var(--color-text)" }}>{confirmMsg}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button
            onClick={() => setConfirmFn(null)}
            style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}
          >
            取消
          </button>
          <button
            onClick={() => {
              confirmFn!();
              setConfirmFn(null);
            }}
            style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}
          >
            确认
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ==================== Tab2 2FA ==================== */
function TwoFaTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "setup" | "verify">("idle");
  const [setupData, setSetupData] = useState<any>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showCodes, setShowCodes] = useState(false);
  const [confirmedSave, setConfirmedSave] = useState(false);

  const statusQ = useQuery({
    queryKey: ["me-2fa"],
    queryFn: async () => (await api.get<{ data: any }>("/auth/2fa/status")).data.data,
  });

  const setupMut = useMutation({
    mutationFn: async () => (await api.post("/auth/2fa/setup", {})).data,
    onSuccess: (d: any) => {
      setSetupData(d.data);
      setStep("setup");
    },
    onError: (e) => toast.error(extractError(e)),
  });
  const verifyMut = useMutation({
    mutationFn: async () => (await api.post("/auth/2fa/verify", { code })).data,
    onSuccess: (d: any) => {
      setRecoveryCodes(d?.data?.recovery_codes ?? []);
      setShowCodes(true);
      setStep("idle");
      qc.invalidateQueries({ queryKey: ["me-2fa"] });
    },
    onError: (e) => {
      toast.error(extractError(e));
      setCode("");
    },
  });
  const disableMut = useMutation({
    mutationFn: async () => (await api.post("/auth/2fa/disable", { code })).data,
    onSuccess: () => {
      setCode("");
      toast.success("2FA 已禁用");
      qc.invalidateQueries({ queryKey: ["me-2fa"] });
    },
    onError: (e) => {
      toast.error(extractError(e));
      setCode("");
    },
  });
  const regenMut = useMutation({
    mutationFn: async () => (await api.post("/auth/2fa/recovery-codes", { code })).data,
    onSuccess: (d: any) => {
      setRecoveryCodes(d?.data?.recovery_codes ?? []);
      setShowCodes(true);
      setCode("");
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const st = statusQ.data;

  return (
    <div style={card}>
      {showCodes && (
        <div style={{ marginBottom: 16 }}>
          <h4>请立即保存恢复码！</h4>
          <p style={{ color: "var(--color-danger-text)", fontSize: 13 }}>
            此页面关闭后无法再次查看。恢复码用于丢失手机时登录。
          </p>
          <div
            style={{
              background: "#1e293b",
              color: "var(--color-border)",
              padding: 16,
              borderRadius: 8,
              fontFamily: "monospace",
              marginBottom: 12,
            }}
          >
            {recoveryCodes.map((c) => (
              <div key={c} style={{ padding: "4px 0" }}>
                {c}
              </div>
            ))}
          </div>
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={confirmedSave}
              onChange={(e) => setConfirmedSave(e.target.checked)}
            />{" "}
            我已安全保存恢复码
          </label>
          <div style={{ marginTop: 12 }}>
            <button
              disabled={!confirmedSave}
              onClick={() => setShowCodes(false)}
              style={{
                ...btnBase,
                background: confirmedSave ? "var(--color-primary)" : "var(--color-border)",
                color: "#fff",
              }}
            >
              完成
            </button>
          </div>
        </div>
      )}

      {showCodes ? null : st?.enabled ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>🛡️</span>
            <div>
              <strong style={{ color: "var(--color-success-text)" }}>双因素认证已启用</strong>
              {st?.enabled_at ? (
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  启用时间: {new Date(st.enabled_at).toLocaleString()}
                </div>
              ) : null}
            </div>
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
            剩余恢复码: <strong>{st?.remaining_recovery_codes ?? 0}</strong> 个
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="输入当前 6 位验证码"
              maxLength={6}
              style={{ ...inp, width: 200, marginBottom: 0 }}
            />
            <button
              onClick={() => regenMut.mutate()}
              style={{ ...btnBase, background: "var(--color-warning-text)", color: "#fff" }}
            >
              重新生成恢复码
            </button>
          </div>
          <button
            onClick={() => {
              if (window.confirm("禁用后账户安全性降低，确认禁用？")) disableMut.mutate();
            }}
            style={{ ...btnBase, background: "var(--color-border)", color: "var(--color-danger-text)" }}
          >
            禁用 2FA
          </button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>🛡️</span>
            <div>
              <strong>双因素认证未启用</strong>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                使用 Authenticator 应用提升账户安全
              </div>
            </div>
          </div>
          <button
            onClick={() => setupMut.mutate()}
            style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}
          >
            启用 2FA
          </button>
        </>
      )}

      {step === "setup" && setupData && (
        <div style={{ marginTop: 20, padding: 16, background: "var(--color-bg)", borderRadius: 8 }}>
          <h4>步骤 1: 扫码或输入密钥</h4>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            打开 Authenticator 应用，扫描二维码或手动输入密钥：
          </div>
          <div
            style={{
              fontFamily: "monospace",
              background: "#fff",
              border: "1px solid var(--color-border)",
              padding: 10,
              borderRadius: 6,
              marginBottom: 12,
              wordBreak: "break-all",
            }}
          >
            {setupData.manual_key}
          </div>
          <h4>步骤 2: 输入验证码验证</h4>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6 位验证码"
            maxLength={6}
            style={{ ...inp, width: 200 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => verifyMut.mutate()}
              disabled={code.length !== 6}
              style={{
                ...btnBase,
                background: code.length === 6 ? "var(--color-primary)" : "var(--color-border)",
                color: "#fff",
              }}
            >
              {verifyMut.isPending ? "验证中..." : "验证并启用"}
            </button>
            <button
              onClick={() => setStep("idle")}
              style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== Tab3 设备管理 ==================== */
function DevicesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const devQ = useQuery({
    queryKey: ["me-devices"],
    queryFn: async () =>
      (await api.get<{ data: { devices: any[] } }>("/me/devices")).data.data,
  });
  const opt = useMutation({
    mutationFn: async ({ url }: { url: string }) =>
      (await api.post(url, {})).data,
    onSuccess: (d: any) => {
      toast.success(d?.data?.message ?? "操作成功");
      qc.invalidateQueries({ queryKey: ["me-devices"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const devices = devQ.data?.devices ?? [];

  const deviceColumns: ColumnDef<any>[] = [
    {
      key: "device",
      title: "设备",
      render: (_, record) => (
        <div>
          <strong>{record.device_name ?? "未知设备"}</strong>
          {record.is_current ? (
            <span style={{ color: "var(--color-primary)", fontSize: 12 }}> 🏷当前</span>
          ) : null}
          <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
            {record.browser ?? "—"} {record.os ?? ""}
          </div>
        </div>
      ),
    },
    {
      key: "ip",
      title: "IP/位置",
      render: (_, record) => (
        <div>
          <span style={{ color: "var(--color-text-secondary)" }}>{record.ip ?? "—"}</span>
          <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
            {record.city ?? "未知"} {record.country ?? ""}
          </div>
        </div>
      ),
    },
    {
      key: "risk",
      title: "风险",
      render: (_, record) => {
        const level = record.risk_level;
        if (level === "suspicious")
          return <StatusBadge status="warning">可疑</StatusBadge>;
        if (level === "unknown")
          return <StatusBadge status="danger">未知</StatusBadge>;
        return <StatusBadge status="success">正常</StatusBadge>;
      },
    },
    {
      key: "last_active_at",
      title: "最近活跃",
      render: (_, record) => (
        <span style={{ color: "var(--color-text-secondary)" }}>
          {record.last_active_at
            ? new Date(record.last_active_at).toLocaleString()
            : "—"}
        </span>
      ),
    },
    {
      key: "action",
      title: "操作",
      render: (_, record) => (
        <span>
          {!record.is_current && (
            <button
              onClick={() => opt.mutate({ url: `/me/devices/${record.id}/logout` })}
              style={{
                ...btnBase,
                background: "var(--color-danger-bg)",
                color: "var(--color-danger-text)",
                padding: "4px 10px",
              }}
            >
              登出
            </button>
          )}
          {record.risk_level !== "normal" && !record.is_current && (
            <button
              onClick={() => opt.mutate({ url: `/me/devices/${record.id}/trust` })}
              style={{
                ...btnBase,
                background: "var(--color-success-bg)",
                color: "var(--color-success-text)",
                padding: "4px 10px",
                marginLeft: 6,
              }}
            >
              标记可信
            </button>
          )}
          {record.is_current && (
            <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>当前设备</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          onClick={() => opt.mutate({ url: "/me/devices/logout-all" })}
          style={{ ...btnBase, background: "var(--color-danger-text)", color: "#fff" }}
        >
          登出所有其他设备
        </button>
      </div>
      <div style={card}>
        <h4 style={{ margin: 0, marginBottom: 12 }}>
          我的设备 ({devices.length})
          <HelpIcon text="查看和管理已登录设备，支持登出可疑设备和标记可信设备。" level="button" />
        </h4>
        {devices.length === 0 ? (
          <div style={{ color: "var(--color-text-secondary)" }}>暂无设备记录</div>
        ) : (
          <Table
            columns={deviceColumns}
            dataSource={devices}
            loading={devQ.isLoading}
            emptyText="暂无设备记录"
          />
        )}
      </div>
    </div>
  );
}

/* ==================== Tab4 Key 权限 ==================== */
function KeyPermTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selKey, setSelKey] = useState<number | null>(null);
  const [form, setForm] = useState<any>(null);

  const keysQ = useQuery({
    queryKey: ["me-api-keys"],
    queryFn: async () =>
      (await api.get<{ data: { list?: any[] } | any[] }>("/me/api-keys")).data.data,
  });
  const keyList = Array.isArray(keysQ.data) ? keysQ.data : keysQ.data?.list ?? [];

  const permQ = useQuery({
    queryKey: ["me-key-perm", selKey],
    queryFn: async () =>
      (await api.get<{ data: any }>(`/me/api-keys/${selKey}/permissions`)).data.data,
    enabled: !!selKey,
  });
  const saveMut = useMutation({
    mutationFn: async () =>
      (
        await api.put(`/me/api-keys/${selKey}/permissions`, {
          modelPermissions: form.model_permissions,
          ipWhitelist: form.ip_whitelist,
          domainWhitelist: form.domain_whitelist,
          dailyTokenLimit: Number(form.daily_token_limit),
          dailyCallLimit: Number(form.daily_call_limit),
        })
      ).data,
    onSuccess: () => {
      toast.success("权限已更新");
      qc.invalidateQueries({ queryKey: ["me-key-perm"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  useEffect(() => {
    if (permQ.data && !form) {
      setForm({
        model_permissions: permQ.data.model_permissions ?? [],
        ip_whitelist: permQ.data.ip_whitelist ?? [],
        domain_whitelist: permQ.data.domain_whitelist ?? [],
        daily_token_limit: permQ.data.daily_token_limit ?? 0,
        daily_call_limit: permQ.data.daily_call_limit ?? 0,
      });
    }
  }, [permQ.data]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {keyList.map((k: any) => (
          <button
            key={k.id}
            onClick={() => {
              setSelKey(k.id);
              setForm(null);
            }}
            style={{
              ...btnBase,
              background: selKey === k.id ? "var(--color-primary)" : "#fff",
              color: selKey === k.id ? "#fff" : "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {k.name}
          </button>
        ))}
      </div>
      {!selKey && (
        <div style={{ ...card, color: "var(--color-text-secondary)" }}>
          请选择左侧 API Key 查看/编辑权限
        </div>
      )}
      {selKey && (
        <div style={card}>
          <h4 style={{ margin: 0, marginBottom: 12 }}>
            Key 权限配置 #{selKey}
            <HelpIcon text="设置 API Key 的访问控制：模型白名单、IP/域名限制、每日 Token 和调用次数额度。" level="button" />
          </h4>
          {!form ? (
            <SkeletonGroup lines={5} />
          ) : (
            <>
              <label style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                可访问模型（逗号分隔，空=全部）
              </label>
              <input
                value={form.model_permissions.join(",")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    model_permissions: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="deepseek-chat,gpt-4o"
                style={inp}
              />
              <label style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                IP 白名单（逗号分隔，空=不限制）
              </label>
              <input
                value={form.ip_whitelist.join(",")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ip_whitelist: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="192.168.1.0/24"
                style={inp}
              />
              <label style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                域名白名单（逗号分隔，空=不限制）
              </label>
              <input
                value={form.domain_whitelist.join(",")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    domain_whitelist: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="example.com"
                style={inp}
              />
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                    每日 Token 额度（0=不限）
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.daily_token_limit}
                    onChange={(e) =>
                      setForm({ ...form, daily_token_limit: Number(e.target.value) })
                    }
                    style={inp}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                    每日调用次数（0=不限）
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.daily_call_limit}
                    onChange={(e) =>
                      setForm({ ...form, daily_call_limit: Number(e.target.value) })
                    }
                    style={inp}
                  />
                </div>
              </div>
              <button
                onClick={() => saveMut.mutate()}
                style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}
              >
                {saveMut.isPending ? "保存中..." : "保存权限"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================== Tab5 登录安全 ==================== */
function LoginTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const sumQ = useQuery({
    queryKey: ["me-security-summary"],
    queryFn: async () =>
      (await api.get<{ data: any }>("/me/security/summary")).data.data,
    refetchInterval: 60000,
  });
  const histQ = useQuery({
    queryKey: ["me-login-history"],
    queryFn: async () =>
      (await api.get<{ data: { records: any[] } }>("/me/login-history")).data.data,
  });
  const opt = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: string }) =>
      (await api.post(`/me/login-history/${id}/${action}`, {})).data,
    onSuccess: () => {
      toast.success("操作成功");
      qc.invalidateQueries({ queryKey: ["me-login-history"] });
      qc.invalidateQueries({ queryKey: ["me-security-summary"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const s = sumQ.data;

  const loginColumns: ColumnDef<any>[] = [
    {
      key: "login_at",
      title: "时间",
      render: (_, record) =>
        record.login_at ? new Date(record.login_at).toLocaleString() : "—",
    },
    {
      key: "risk_level",
      title: "状态",
      render: (_, record) => {
        const level = record.risk_level;
        if (level === "blocked")
          return <StatusBadge status="danger">✗ 异常拦截</StatusBadge>;
        if (level === "suspicious")
          return <StatusBadge status="warning">⚠ 异地登录</StatusBadge>;
        return <StatusBadge status="success">正常</StatusBadge>;
      },
    },
    {
      key: "ip",
      title: "IP/位置",
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--color-text-secondary)" }}>{record.ip ?? "—"}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            {record.city ?? ""}
            {record.country ? ` · ${record.country}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "browser",
      title: "设备",
      render: (_, record) => (
        <span style={{ color: "var(--color-text-secondary)" }}>
          {record.browser ?? (record.device_info ?? "—")}
        </span>
      ),
    },
    {
      key: "action",
      title: "操作",
      render: (_, record) => {
        if (record.risk_level !== "normal" && !record.confirmed_by_user) {
          return (
            <span>
              <button
                onClick={() => opt.mutate({ id: record.id, action: "confirm" })}
                style={{
                  ...btnBase,
                  background: "var(--color-success-bg)",
                  color: "var(--color-success-text)",
                  padding: "4px 8px",
                  marginRight: 6,
                }}
              >
                确认是本人
              </button>
              <button
                onClick={() => {
                  if (
                    window.confirm("确认这不是您本人的登录？系统将登出所有设备并保护账户。")
                  )
                    opt.mutate({ id: record.id, action: "report" });
                }}
                style={{
                  ...btnBase,
                  background: "var(--color-danger-bg)",
                  color: "var(--color-danger-text)",
                  padding: "4px 8px",
                }}
              >
                这不是我
              </button>
            </span>
          );
        }
        return (
          <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
            {record.confirmed_by_user ? "已确认为本人" : "—"}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      {s && (
        <div style={{ ...card, marginBottom: 16 }}>
          <h4 style={{ margin: 0, marginBottom: 12 }}>🔒 安全概览</h4>
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            {[
              ["近7天异常登录", s.anomaly_count, "var(--color-warning-text)"],
              ["近期拦截", s.blocked_count, "var(--color-danger-text)"],
              [
                "双因素认证",
                s.two_factor_enabled ? "已启用" : "未启用",
                s.two_factor_enabled ? "var(--color-success-text)" : "var(--color-text-secondary)",
              ],
            ].map(([label, v, color]) => (
              <div
                key={label as string}
                style={{ flex: 1, background: "var(--color-bg)", padding: 14, borderRadius: 8, textAlign: "center" }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: color as string }}>
                  {v as any}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                  {label as string}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={card}>
        <h4 style={{ margin: 0, marginBottom: 12 }}>登录记录</h4>
        {histQ.data?.records?.length === 0 ? (
          <div style={{ color: "var(--color-text-secondary)" }}>暂无登录记录</div>
        ) : (
          <Table
            columns={loginColumns}
            dataSource={histQ.data?.records ?? []}
            loading={histQ.isLoading}
            emptyText="暂无登录记录"
          />
        )}
      </div>
    </div>
  );
}
