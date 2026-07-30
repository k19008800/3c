// ============================================================
//  3cloud (3C) — 客服审计日志（§27.6）
//  /console/admin/chat/audit
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import api from "../../../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

interface AuditLog {
  id: number;
  staffId: number;
  staffName: string;
  action: string;
  targetType: string;
  targetId: number;
  detail: string | null;
  ip: string;
  createdAt: string;
  canRollback: boolean;
}

export default function StaffAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [rollbackId, setRollbackId] = useState<number | null>(null);
  const [rollbackLog, setRollbackLog] = useState<AuditLog | null>(null);
  const [showRollbackModal, setShowRollbackModal] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (actionFilter) params.set("action", actionFilter);
      if (search) params.set("search", search);
      const res = await api.get("/api/v1/admin/chat/audit?" + params);
      const d = res.data;
      setLogs(d.logs || []);
      setTotal(d.total || 0);
      setTotalPages(d.totalPages || 1);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, actionFilter, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleRollback = async (logId: number) => {
    try {
      await api.post("/api/v1/admin/chat/audit/" + logId + "/rollback", {});
      setShowRollbackModal(false);
      setRollbackId(null);
      fetchLogs();
    } catch (e) { console.error(e); }
  };

  const openRollbackModal = (log: AuditLog) => {
    setRollbackLog(log);
    setRollbackId(log.id);
    setShowRollbackModal(true);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">客服操作审计</h1>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm w-32"
              value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}>
              <option value="">全部操作</option>
              <option value="accept">接入会话</option>
              <option value="close">关闭会话</option>
              <option value="send_message">发送消息</option>
              <option value="transfer">转接</option>
              <option value="update_tags">更新标签</option>
            </select>
            <Input className="w-56" placeholder="搜索员工/操作..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">ID</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">客服</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">操作类型</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">对象</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">描述</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">IP</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">时间</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8">加载中...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">暂无日志</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-sm font-mono">{log.id}</td>
                    <td className="p-3 text-sm">{log.staffName}</td>
                    <td className="p-3 text-sm">
                      <span className="bg-gray-100 text-gray-700 rounded px-2 py-0.5 text-xs">{log.action}</span>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{log.targetType}#{log.targetId}</td>
                    <td className="p-3 text-sm max-w-[200px] truncate">{log.detail || "--"}</td>
                    <td className="p-3 text-sm font-mono text-xs">{log.ip}</td>
                    <td className="p-3 text-sm text-muted-foreground">{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                    <td className="p-3">
                      {log.canRollback && (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => openRollbackModal(log)}>回滚</Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="flex items-center text-sm text-muted-foreground px-3">第 {page}/{totalPages} 页</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}

      {showRollbackModal && rollbackLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRollbackModal(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">确认回滚操作</h3>
            <div className="text-sm text-muted-foreground space-y-2 mb-4">
              <p>操作类型: <span className="font-medium">{rollbackLog.action}</span></p>
              <p>对象: <span className="font-medium">{rollbackLog.targetType}#{rollbackLog.targetId}</span></p>
              <p>时间: <span className="font-medium">{new Date(rollbackLog.createdAt).toLocaleString("zh-CN")}</span></p>
              {rollbackLog.detail && <p>描述: <span className="font-medium">{rollbackLog.detail}</span></p>}
              <p className="text-red-600 text-xs mt-4">注意：回滚操作不可撤销，确认要继续吗？</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowRollbackModal(false)}>取消</Button>
              <Button size="sm" onClick={() => handleRollback(rollbackLog.id)}>确认回滚</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}