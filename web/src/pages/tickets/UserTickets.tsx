// ============================================================
//  3cloud (3C) — 用户端工单列表（§26.1）
//  /console/tickets
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-yellow-100 text-yellow-800" },
  processing: { label: "处理中", color: "bg-blue-100 text-blue-800" },
  resolved: { label: "已解决", color: "bg-green-100 text-green-800" },
  closed: { label: "已关闭", color: "bg-gray-100 text-gray-600" },
};

const CATEGORIES = [
  { value: "", label: "全部分类" },
  { value: "billing", label: "计费问题" },
  { value: "api", label: "API 调用" },
  { value: "account", label: "账户与安全" },
  { value: "key", label: "Key 管理" },
  { value: "invoice_refund", label: "发票与退款" },
  { value: "feature_request", label: "功能建议" },
  { value: "other", label: "其他" },
];

export default function UserTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (search) params.set("search", search);
      const res = await api.get("/api/v1/me/tickets?" + params);
      const d = res.data;
      setTickets(d.tickets || []);
      setTotal(d.total || 0);
      setTotalPages(d.totalPages || 1);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, statusFilter, categoryFilter, search]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的工单</h1>
        <Button onClick={() => navigate("/console/tickets/new")}>创建工单</Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm w-36"
              value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm w-28"
              value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">全部状态</option>
              <option value="pending">待处理</option>
              <option value="processing">处理中</option>
              <option value="resolved">已解决</option>
              <option value="closed">已关闭</option>
            </select>
            <Input className="w-56" placeholder="搜索工单..."
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">工单号</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">标题</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">分类</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">优先级</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">状态</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">创建时间</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8">加载中...</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">暂无工单</td></tr>
              ) : (
                tickets.map((t: any) => {
                  const cfg = STATUS_CONFIG[t.status];
                  return (
                    <tr key={t.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate("/console/tickets/" + t.id)}>
                      <td className="p-3 font-mono text-sm">{t.ticketNo}</td>
                      <td className="p-3 text-sm max-w-[200px] truncate">{t.title}</td>
                      <td className="p-3 text-sm">{(CATEGORIES.find((c: any) => c.value === t.category) || {}).label || t.category}</td>
                      <td className="p-3 text-sm">
                        {t.priority === "urgent" ? <span className="text-red-600 font-bold">紧急</span>
                          : t.priority === "high" ? <span className="text-orange-600">高</span>
                          : t.priority === "normal" ? "普通" : "低"}
                      </td>
                      <td className="p-3">{cfg ? <Badge className={cfg.color}>{cfg.label}</Badge> : t.status}</td>
                      <td className="p-3 text-sm text-muted-foreground">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</td>
                      <td className="p-3"><Button variant="ghost" size="sm">查看</Button></td>
                    </tr>
                  );
                })
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
    </div>
  );
}