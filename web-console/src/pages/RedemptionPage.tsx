import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

interface RedeemHistory {
  id: number;
  code: string;
  amount: number;
  batch_name: string;
  created_at: string;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};

export default function RedemptionPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const { toast } = useToast();

  const historyQ = useQuery({
    queryKey: ["me-redemption-history"],
    queryFn: async () =>
      (await api.get<{ data: { list: RedeemHistory[] } }>("/me/redemption/history?page_size=50")).data.data,
  });

  const redeemMut = useMutation({
    mutationFn: async () =>
      (await api.post("/me/redemption/redeem", { code: code.trim().toUpperCase() })).data,
    onSuccess: (d: { data?: { message?: string; amount?: number } }) => {
      toast.success(d?.data?.message ?? "兑换成功");
      setCode("");
      qc.invalidateQueries({ queryKey: ["me-redemption-history"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["me-stats"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const historyColumns: ColumnDef<RedeemHistory>[] = [
    {
      key: "code",
      title: "兑换码",
      dataIndex: "code",
      render: (v) => <span style={{ fontFamily: "monospace", fontSize: 13 }}>{v as string}</span>,
    },
    { key: "batch_name", title: "批次", dataIndex: "batch_name", render: (v) => (v as string) ?? "-" },
    {
      key: "amount",
      title: "到账金额",
      dataIndex: "amount",
      render: (v) => (
        <span style={{ fontWeight: 600, color: "var(--color-success-text)" }}>
          ¥{(v as number).toFixed(2)}
        </span>
      ),
    },
    {
      key: "created_at",
      title: "时间",
      dataIndex: "created_at",
      render: (v) => (
        <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          {new Date(v as string).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>
        兑换码
        <HelpIcon text="使用兑换码兑换账户余额。输入以 3C- 开头的兑换码即可领取对应的金额奖励。" level="page" />
      </h2>

      {/* 兑换输入 */}
      <div style={{ ...card, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>
          兑换余额
          <HelpIcon text="输入兑换码以领取余额。" level="button" />
        </h3>
        <div style={{ display: "flex", gap: 10, maxWidth: 480 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="输入兑换码（如 3C-XXXXXXXXXX）"
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              flex: 1,
              fontFamily: "monospace",
              letterSpacing: 1,
            }}
          />
          <button
            onClick={() => redeemMut.mutate()}
            disabled={redeemMut.isPending || !code.trim().startsWith("3C-")}
            style={{
              ...btnBase,
              background: "var(--color-primary)",
              color: "#fff",
              whiteSpace: "nowrap",
              opacity: redeemMut.isPending || !code.trim().startsWith("3C-") ? 0.6 : 1,
            }}
          >
            {redeemMut.isPending ? "兑换中..." : "兑换"}
          </button>
        </div>
      </div>

      {/* 兑换历史 */}
      <div style={card}>
        <h3 style={{ marginBottom: 16 }}>兑换记录</h3>
        {historyQ.isLoading ? (
          <SkeletonGroup lines={4} />
        ) : (historyQ.data?.list?.length ?? 0) === 0 ? (
          <EmptyState icon="🎁" title="暂无兑换记录" description="您还没有使用过兑换码" />
        ) : (
          <Table
            columns={historyColumns}
            dataSource={historyQ.data?.list ?? []}
            loading={historyQ.isLoading}
            emptyText="暂无兑换记录"
          />
        )}
      </div>
    </div>
  );
}
