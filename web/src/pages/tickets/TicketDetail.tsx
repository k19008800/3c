// ============================================================
//  3cloud (3C) — 用户端工单详情页（§26.1）
//  /console/tickets/:id
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-yellow-100 text-yellow-800" },
  processing: { label: "处理中", color: "bg-blue-100 text-blue-800" },
  resolved: { label: "已解决", color: "bg-green-100 text-green-800" },
  closed: { label: "已关闭", color: "bg-gray-100 text-gray-600" },
};

const CATEGORY_LABEL: Record<string, string> = {
  billing: "计费问题", api: "API 调用", account: "账户与安全",
  key: "Key 管理", invoice_refund: "发票与退款", feature_request: "功能建议", other: "其他",
};

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [replyContent, setReplyContent] = useState("");
  const [satisfaction, setSatisfaction] = useState<any>(null);
  const [showSatisfaction, setShowSatisfaction] = useState(false);
  const [satisfactionRating, setSatisfactionRating] = useState(0);
  const [satisfactionComment, setSatisfactionComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const fetchTicket = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/v1/me/tickets/${id}`);
      setTicket(res.data.ticket);
      setReplies(res.data.replies || []);
      if (res.data.ticket.status === "resolved" || res.data.ticket.status === "closed") {
        setShowSatisfaction(true);
      }
    } catch (err) {
      setError("工单不存在或无权访问");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/v1/me/tickets/${id}/reply`, { content: replyContent.trim() });
      setReplyContent("");
      fetchTicket();
    } catch (err: any) { setError(err?.response?.data?.error || "回复失败"); }
    finally { setSending(false); }
  };

  const handleCloseTicket = async () => {
    try {
      await api.post(`/api/v1/me/tickets/${id}/close`);
      fetchTicket();
    } catch (err: any) { setError(err?.response?.data?.error || "关闭失败"); }
  };

  const handleSatisfaction = async () => {
    if (satisfactionRating === 0) return;
    try {
      await api.post(`/api/v1/me/tickets/${id}/satisfaction`, {
        rating: satisfactionRating,
        comment: satisfactionComment.trim() || undefined,
      });
      setShowSatisfaction(false);
      setSatisfaction({ rating: satisfactionRating, comment: satisfactionComment });
    } catch (err: any) { setError(err?.response?.data?.error || "评价失败"); }
  };

  if (loading) return <div className="text-center py-12">加载中...</div>;
  if (!ticket) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">{error || "工单不存在"}</p>
      <Button className="mt-4" variant="outline" onClick={() => navigate("/console/tickets")}>返回</Button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/console/tickets")}>← 返回工单列表</Button>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">{ticket.title}</h1>
              <p className="text-sm text-muted-foreground mt-1 font-mono">{ticket.ticketNo}</p>
            </div>
            <Badge className={STATUS_CONFIG[ticket.status]?.color}>
              {STATUS_CONFIG[ticket.status]?.label}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>分类: {CATEGORY_LABEL[ticket.category] || ticket.category}</span>
            <span>创建: {new Date(ticket.createdAt).toLocaleString("zh-CN")}</span>
            {ticket.resolvedAt && <span className="text-green-600">解决: {new Date(ticket.resolvedAt).toLocaleString("zh-CN")}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">对话记录</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">我</div>
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">我</div>
              <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap">{ticket.description}</div>
              <div className="text-xs text-muted-foreground mt-1">{new Date(ticket.createdAt).toLocaleString("zh-CN")}</div>
            </div>
          </div>

          {replies.map((r: any) => (
            <div key={r.id} className={`flex gap-3 ${r.isStaff ? "" : "flex-row-reverse"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${r.isStaff ? "bg-green-100" : "bg-blue-100"}`}>
                <span className="text-xs font-bold">{r.isStaff ? "客服" : "我"}</span>
              </div>
              <div className={`flex-1 ${r.isStaff ? "" : "text-right"}`}>
                <div className="text-sm font-medium mb-1">{r.isStaff ? "客服" : "我"}</div>
                <div className={`rounded-lg p-3 text-sm inline-block max-w-[80%] text-left ${r.isStaff ? "bg-green-50" : "bg-blue-50"}`}>
                  {r.content}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleString("zh-CN")}</div>
              </div>
            </div>
          ))}

          {ticket.status !== "closed" && (
            <div className="space-y-3 pt-4 border-t">
              <label className="block text-sm font-medium">回复</label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="输入回复内容..."
                rows={3}
              />
              <div className="flex gap-2">
                <Button onClick={handleReply} disabled={sending || !replyContent.trim()}>
                  {sending ? "发送中..." : "发送"}
                </Button>
                {(ticket.status === "pending" || ticket.status === "processing") && (
                  <Button variant="outline" onClick={handleCloseTicket}>关闭工单</Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showSatisfaction && ticket.status === "resolved" && !satisfaction && (
        <Card>
          <CardHeader><CardTitle className="text-base">评价本次服务</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n: number) => (
                <button
                  key={n}
                  className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer text-2xl ${
                    n <= satisfactionRating ? "text-yellow-500" : "text-gray-300"
                  }`}
                  onClick={() => setSatisfactionRating(n)}
                >★</button>
              ))}
            </div>
            <textarea
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              value={satisfactionComment}
              onChange={(e) => setSatisfactionComment(e.target.value)}
              placeholder="补充意见（可选）"
              rows={2}
            />
            <div className="flex gap-2">
              <Button onClick={handleSatisfaction} disabled={satisfactionRating === 0}>提交评价</Button>
              <Button variant="outline" onClick={() => setShowSatisfaction(false)}>跳过</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}