// ============================================================
//  3cloud (3C) — 管理后台工单详情（§26.3）
//  /console/admin/tickets/:id
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-yellow-100 text-yellow-800" },
  processing: { label: "处理中", color: "bg-blue-100 text-blue-800" },
  resolved: { label: "已解决", color: "bg-green-100 text-green-800" },
  closed: { label: "已关闭", color: "bg-gray-100 text-gray-600" },
};

const PRIORITY_TEXT: Record<string, string> = { low: "低", normal: "普通", high: "高", urgent: "紧急" };

interface Reply { id: number; userId: number; isStaff: boolean; content: string; createdAt: string; }
interface OpLog { id: number; action: string; detail: string; createdAt: string; }

export default function AdminTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [opLogs, setOpLogs] = useState<OpLog[]>([]);
  const [satisfaction, setSatisfaction] = useState<any>(null);
  const [replyContent, setReplyContent] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [newTag, setNewTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const fetchTicket = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.get("/api/v1/admin/tickets/" + id);
      const d = res.data;
      setTicket(d.ticket);
      setReplies(d.replies || []);
      setOpLogs(d.operationLogs || []);
      setSatisfaction(d.satisfaction || null);
    } catch (err) { setError("工单不存在"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    setSending(true);
    try {
      await api.post("/api/v1/admin/tickets/" + id + "/reply", { content: replyContent.trim() });
      setReplyContent("");
      fetchTicket();
    } catch (err: any) { setError(err?.response?.data?.error || "回复失败"); }
    finally { setSending(false); }
  };

  const handleStatusChange = async (status: string) => {
    try {
      await api.post("/api/v1/admin/tickets/" + id + "/status", { status });
      fetchTicket();
    } catch (err: any) { setError(err?.response?.data?.error || "状态变更失败"); }
  };

  const handlePriorityChange = async (priority: string) => {
    try {
      await api.post("/api/v1/admin/tickets/" + id + "/priority", { priority });
      fetchTicket();
    } catch (err: any) { setError(err?.response?.data?.error || "优先级变更失败"); }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    try {
      await api.post("/api/v1/admin/tickets/" + id + "/tags", { action: "add", tagName: newTag.trim() });
      setNewTag("");
      fetchTicket();
    } catch (err: any) { setError(err?.response?.data?.error || "添加标签失败"); }
  };

  const handleRemoveTag = async (tagName: string) => {
    try {
      await api.post("/api/v1/admin/tickets/" + id + "/tags", { action: "remove", tagName });
      fetchTicket();
    } catch (err: any) { setError(err?.response?.data?.error || "移除标签失败"); }
  };

  const handleAddNote = async () => {
    if (!internalNote.trim()) return;
    try {
      await api.post("/api/v1/admin/tickets/" + id + "/note", { note: internalNote.trim() });
      setInternalNote("");
      fetchTicket();
    } catch (err: any) { setError(err?.response?.data?.error || "备注失败"); }
  };

  if (loading) return <div className="text-center py-12">加载中...</div>;
  if (!ticket) return <div className="text-center py-12 text-muted-foreground">{error}</div>;

  const tags = ticket.tags ? ticket.tags.split(",").filter(Boolean) : [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/console/admin/tickets")}>← 返回工单队列</Button>

      {error && <div className="text-sm text-red-500 bg-red-50 rounded px-3 py-2">{error}</div>}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">{ticket.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{ticket.ticketNo} · 用户 #{ticket.userId}</p>
            </div>
            <Badge className={STATUS_CONFIG[ticket.status]?.color}>{STATUS_CONFIG[ticket.status]?.label}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">优先级:</span>
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={ticket.priority} onChange={(e) => handlePriorityChange(e.target.value)}>
                {Object.entries(PRIORITY_TEXT).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">状态:</span>
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={ticket.status} onChange={(e) => handleStatusChange(e.target.value)}>
                <option value="processing">标记为处理中</option>
                <option value="resolved">标记为已解决</option>
                <option value="closed">关闭工单</option>
              </select>
            </div>
            <span>来源: {ticket.source}</span>
            <span>创建: {new Date(ticket.createdAt).toLocaleString("zh-CN")}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {tags.map((t: string) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button className="ml-1 text-xs hover:text-red-500" onClick={() => handleRemoveTag(t)}>x</button>
              </Badge>
            ))}
            <div className="flex gap-1">
              <Input className="w-28 h-7 text-xs" placeholder="添加标签" value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()} />
              <Button size="sm" variant="ghost" onClick={handleAddTag}>+</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">对话记录</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">U</div>
                <div className="flex-1">
                  <div className="text-sm font-medium mb-1">用户 (#{ticket.userId})</div>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap">{ticket.description}</div>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(ticket.createdAt).toLocaleString("zh-CN")}</div>
                </div>
              </div>

              {replies.map((r) => (
                <div key={r.id} className={`flex gap-3 ${r.isStaff ? "flex-row-reverse" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${r.isStaff ? "bg-green-100" : "bg-gray-200"}`}>
                    <span className="text-xs font-bold">{r.isStaff ? "客服" : "U"}</span>
                  </div>
                  <div className={`flex-1 ${r.isStaff ? "" : ""}`}>
                    <div className="text-sm font-medium mb-1">{r.isStaff ? "客服" : "用户 (#" + r.userId + ")"}</div>
                    <div className={`rounded-lg p-3 text-sm ${r.isStaff ? "bg-green-50" : "bg-gray-50"}`}>{r.content}</div>
                    <div className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleString("zh-CN")}</div>
                  </div>
                </div>
              ))}

              {ticket.status !== "closed" && (
                <div className="space-y-3 pt-4 border-t">
                  <label className="block text-sm font-medium">回复</label>
                  <textarea className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                    value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="输入回复..." rows={3} />
                  <Button onClick={handleReply} disabled={sending || !replyContent.trim()}>
                    {sending ? "发送中..." : "发送"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {satisfaction && (
            <Card>
              <CardHeader><CardTitle className="text-sm">用户评价</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <span key={n} className={`text-lg ${n <= satisfaction.rating ? "text-yellow-500" : "text-gray-300"}`}>★</span>
                  ))}
                </div>
                {satisfaction.comment && <p className="text-sm text-muted-foreground">{satisfaction.comment}</p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm">内部备注</CardTitle></CardHeader>
            <CardContent>
              <textarea className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="添加内部备注（用户不可见）" rows={2} />
              <Button className="mt-2 w-full" size="sm" variant="outline" onClick={handleAddNote} disabled={!internalNote.trim()}>添加备注</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">操作日志</CardTitle></CardHeader>
            <CardContent className="max-h-48 overflow-y-auto space-y-2">
              {opLogs.length === 0 ? (
                <div className="text-xs text-muted-foreground">暂无日志</div>
              ) : (
                opLogs.map((log) => (
                  <div key={log.id} className="text-xs border-l-2 border-gray-200 pl-2 py-1">
                    <div className="font-medium">{log.action}</div>
                    {log.detail && <div className="text-muted-foreground">{log.detail}</div>}
                    <div className="text-muted-foreground">{new Date(log.createdAt).toLocaleString("zh-CN")}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}