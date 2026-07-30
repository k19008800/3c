// ============================================================
//  3cloud (3C) — 客服工作台（§27.4）
//  /console/admin/chat
//  三面板布局：左-等待队列+活跃会话 / 中-聊天窗口 / 右-预设消息
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import api from "../../../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

interface ChatSession {
  id: number;
  userId: number;
  status: string;
  createdAt: string;
  lastMessageAt: string | null;
  queuePosition: number;
  userNickname?: string;
}

interface Message {
  id: number;
  sessionId: number;
  senderType: string;
  content: string;
  createdAt: string;
}

interface Preset {
  id: number;
  category: string;
  title: string;
  content: string;
}

export default function StaffWorkbench() {
  const [staffStatus, setStaffStatus] = useState<"online" | "busy" | "offline">("online");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetCategory, setPresetCategory] = useState("");
  const [presetTitle, setPresetTitle] = useState("");
  const [presetContent, setPresetContent] = useState("");
  const [presetFilter, setPresetFilter] = useState("");

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/admin/chat/sessions?status=waiting");
      setSessions(res.data.sessions || []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchPresets = useCallback(async () => {
    try {
      const params = presetFilter ? "?category=" + presetFilter : "";
      const res = await api.get("/api/v1/admin/chat/presets" + params);
      setPresets(res.data.presets || []);
    } catch (e) { console.error(e); }
  }, [presetFilter]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  useEffect(() => {
    if (!activeSession) { setMessages([]); return; }
    const poll = async () => {
      try {
        const res = await api.get("/api/v1/admin/chat/sessions/" + activeSession.id + "/messages");
        setMessages(res.data.messages || []);
      } catch (e) { /* skip */ }
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, [activeSession]);

  const handleAccept = async (sessionId: number) => {
    try {
      const res = await api.post("/api/v1/admin/chat/sessions/" + sessionId + "/accept", {});
      setActiveSession(res.data.session);
      fetchSessions();
    } catch (e) { console.error(e); }
  };

  const handleClose = async (sessionId: number) => {
    try {
      await api.post("/api/v1/admin/chat/sessions/" + sessionId + "/close", {});
      if (activeSession?.id === sessionId) setActiveSession(null);
      fetchSessions();
    } catch (e) { console.error(e); }
  };

  const handleSend = async () => {
    if (!msgInput.trim() || !activeSession) return;
    try {
      const res = await api.post("/api/v1/admin/chat/sessions/" + activeSession.id + "/messages", {
        content: msgInput.trim(), senderType: "staff",
      });
      setMessages(prev => [...prev, res.data.message]);
      setMsgInput("");
    } catch (e) { console.error(e); }
  };

  const handlePresetCreate = async () => {
    if (!presetTitle.trim() || !presetContent.trim()) return;
    try {
      await api.post("/api/v1/admin/chat/presets", {
        category: presetCategory || "通用", title: presetTitle.trim(), content: presetContent.trim(),
      });
      setPresetTitle(""); setPresetContent("");
      fetchPresets();
    } catch (e) { console.error(e); }
  };

  const handlePresetDelete = async (id: number) => {
    try {
      await api.delete("/api/v1/admin/chat/presets/" + id);
      fetchPresets();
    } catch (e) { console.error(e); }
  };

  const handleInsertPreset = (content: string) => {
    setMsgInput(content);
  };

  const handleStatusChange = async (status: string) => {
    try {
      await api.post("/api/v1/admin/chat/status", { status });
      setStaffStatus(status as any);
    } catch (e) { console.error(e); }
  };

  const waitingSessions = sessions.filter(s => s.status === "waiting");
  const activeSessions = sessions.filter(s => s.status === "active" && s.id !== activeSession?.id);
  const filteredPresets = presetFilter ? presets.filter(p => p.category === presetFilter) : presets;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">客服工作台</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">状态:</span>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={staffStatus} onChange={e => handleStatusChange(e.target.value)}>
            <option value="online">在线</option>
            <option value="busy">忙碌</option>
            <option value="offline">离线</option>
          </select>
          <Badge className={
            staffStatus === "online"
              ? "bg-green-100 text-green-800"
              : staffStatus === "busy"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-gray-100 text-gray-600"
          }>
            {staffStatus === "online" ? "在线" : staffStatus === "busy" ? "忙碌" : "离线"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 text-center">
        <Card><CardContent className="py-3"><div className="text-xl font-bold">{waitingSessions.length}</div><div className="text-xs text-muted-foreground">等待中</div></CardContent></Card>
        <Card><CardContent className="py-3"><div className="text-xl font-bold">{activeSessions.length}</div><div className="text-xs text-muted-foreground">其他客服已接入</div></CardContent></Card>
        <Card><CardContent className="py-3"><div className="text-xl font-bold">{activeSession ? 1 : 0}</div><div className="text-xs text-muted-foreground">我已接入</div></CardContent></Card>
        <Card><CardContent className="py-3"><div className="text-xl font-bold">{presets.length}</div><div className="text-xs text-muted-foreground">预设消息</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-[280px_1fr_300px] gap-4" style={{ minHeight: "65vh" }}>
        {/* Left: Session list */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2"><CardTitle className="text-sm">等待队列 ({waitingSessions.length})</CardTitle></CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2 p-3">
            {waitingSessions.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">暂无等待会话</div>
            )}
            {waitingSessions.map(s => (
              <div key={s.id} className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer" onClick={() => handleAccept(s.id)}>
                <div className="text-sm font-medium">用户 #{s.userId}</div>
                <div className="text-xs text-muted-foreground">排队位置: #{s.queuePosition}</div>
                <div className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleTimeString("zh-CN")}</div>
                <Button className="mt-2 w-full" size="sm">接入</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Center: Chat window */}
        <Card className="flex flex-col">
          {activeSession ? (
            <>
              <CardHeader className="pb-2 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">会话 - 用户 #{activeSession.userId}</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => handleClose(activeSession.id)}>关闭</Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: "50vh" }}>
                {messages.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-8">暂无消息</div>
                )}
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.senderType === "staff" ? "flex-row-reverse" : ""} gap-2`}>
                    <div className={`max-w-[75%] rounded-lg p-2 text-sm ${m.senderType === "staff" ? "bg-blue-100" : "bg-gray-100"}`}>
                      <div className="text-xs font-medium mb-1">{m.senderType === "staff" ? "我" : "用户"}</div>
                      <div>{m.content}</div>
                      <div className="text-xs text-muted-foreground mt-1">{new Date(m.createdAt).toLocaleTimeString("zh-CN")}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
              <div className="border-t p-3">
                <textarea
                  className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                  value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  placeholder="输入消息... 点击预设消息快速插入"
                  rows={2}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
                <Button className="mt-2" size="sm" onClick={handleSend} disabled={!msgInput.trim()}>发送</Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
              从左侧队列中选择一个会话接入
            </div>
          )}
        </Card>

        {/* Right: Preset messages */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm">预设消息</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3 space-y-2">
            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm mb-2"
              value={presetFilter} onChange={e => setPresetFilter(e.target.value)}>
              <option value="">全部分类</option>
              <option value="问候">问候</option>
              <option value="通用">通用</option>
              <option value="计费">计费</option>
              <option value="技术">技术</option>
              <option value="结束语">结束语</option>
            </select>

            {filteredPresets.map(p => (
              <div key={p.id} className="border rounded-lg p-2 hover:bg-gray-50 cursor-pointer" onClick={() => handleInsertPreset(p.content)}>
                <div className="text-xs font-medium">{p.title}</div>
                <div className="text-xs text-muted-foreground truncate">{p.content}</div>
                <div className="flex justify-between mt-1">
                  <Badge variant="secondary" className="text-xs">{p.category}</Badge>
                  <button className="text-xs text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); handlePresetDelete(p.id); }}>删除</button>
                </div>
              </div>
            ))}

            <div className="border-t pt-3 mt-3">
              <div className="text-xs font-medium mb-2">新增预设</div>
              <select className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs mb-1"
                value={presetCategory} onChange={e => setPresetCategory(e.target.value)}>
                <option value="">分类</option>
                <option value="问候">问候</option>
                <option value="通用">通用</option>
                <option value="计费">计费</option>
                <option value="技术">技术</option>
                <option value="结束语">结束语</option>
              </select>
              <Input className="h-7 text-xs mb-1" placeholder="标题" value={presetTitle} onChange={e => setPresetTitle(e.target.value)} />
              <textarea className="w-full h-14 rounded-md border border-input bg-background px-2 py-1 text-xs resize-y"
                value={presetContent} onChange={e => setPresetContent(e.target.value)} placeholder="内容" />
              <Button className="mt-1 w-full" size="sm" variant="outline" onClick={handlePresetCreate}>添加</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}