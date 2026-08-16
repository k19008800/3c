import { Modal } from "@3cloud/shared-ui";

/**
 * 模型广场同步结果类型（对齐 api/src/services/model-sync.ts 返回结构）
 */

/** 单供应商同步结果（error 存在时其余计数为 0） */
export interface ModelSyncResult {
  synced: number;
  created: number;
  updated: number;
  failed: number;
  models: string[];
}

/** 批量同步全部供应商的汇总结果 */
export interface SyncAllResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    supplierId: number;
    name: string;
    result?: ModelSyncResult;
    error?: string;
  }>;
}

/**
 * SyncResultModal — 模型广场「全部同步」结果弹窗
 *
 * 展示批量同步汇总（参与/成功/失败）+ 每家供应商明细（成功带计数、失败带原因），
 * 供 供应商列表 / 模型市场 两个入口复用。
 *
 * @param open   - 是否显示
 * @param result - 同步汇总结果（null 且 pending=false 时显示空）
 * @param pending - 同步进行中（显示加载提示）
 * @param onClose - 关闭回调
 */
export function SyncResultModal({
  open,
  result,
  onClose,
  pending,
}: {
  open: boolean;
  result: SyncAllResult | null;
  onClose: () => void;
  pending?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="模型广场同步结果" width={720}>
      {pending ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#666", fontSize: 14 }}>
          ⏳ 正在从上游同步全部启用供应商的模型，请稍候…
        </div>
      ) : result ? (
        <div>
          <div style={{ display: "flex", gap: 18, marginBottom: 12, fontSize: 13, flexWrap: "wrap" }}>
            <span>参与同步：<b>{result.total}</b> 家</span>
            <span style={{ color: "#16a34a" }}>成功：<b>{result.succeeded}</b></span>
            <span style={{ color: result.failed ? "#dc2626" : "#16a34a" }}>失败：<b>{result.failed}</b></span>
          </div>
          {result.results.length === 0 ? (
            <div style={{ textAlign: "center", color: "#999", padding: 24, fontSize: 13 }}>
              暂无启用中的供应商
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#888", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "6px 8px" }}>供应商</th>
                  <th style={{ padding: "6px 8px" }}>状态</th>
                  <th style={{ padding: "6px 8px" }}>明细</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.supplierId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: "6px 8px" }}>
                      {r.result ? (
                        <span style={{ color: "#16a34a" }}>✅ 成功</span>
                      ) : (
                        <span style={{ color: "#dc2626" }}>❌ 失败</span>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", color: "#666" }}>
                      {r.result
                        ? `新增 ${r.result.created} · 更新 ${r.result.updated} · 失败 ${r.result.failed} · 共 ${r.result.synced} 个模型`
                        : r.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
