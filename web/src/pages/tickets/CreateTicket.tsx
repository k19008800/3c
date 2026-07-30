// ============================================================
//  3cloud (3C) — 用户端创建工单（§26.1）
//  /console/tickets/new
// ============================================================

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const CATEGORIES = [
  { value: "billing", label: "计费问题" },
  { value: "api", label: "API 调用" },
  { value: "account", label: "账户与安全" },
  { value: "key", label: "Key 管理" },
  { value: "invoice_refund", label: "发票与退款" },
  { value: "feature_request", label: "功能建议" },
  { value: "other", label: "其他" },
];

const PRIORITIES = [
  { value: "low", label: "低" },
  { value: "normal", label: "普通" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

export default function CreateTicket() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("billing");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (files.length + newFiles.length > 3) {
        setError("最多上传 3 个附件");
        return;
      }
      setFiles(prev => [...prev, ...newFiles].slice(0, 3));
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError("请输入标题"); return; }
    if (!description.trim()) { setError("请输入描述"); return; }
    setSubmitting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("category", category);
      formData.append("priority", priority);
      formData.append("description", description.trim());
      files.forEach(f => formData.append("attachments", f));

      await api.post("/api/v1/me/tickets", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      navigate("/console/tickets");
    } catch (err: any) {
      setError(err?.response?.data?.error || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/console/tickets")}>← 返回</Button>
        <h1 className="text-2xl font-bold">创建工单</h1>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">标题 *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="简要描述问题"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">分类 *</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">优先级 *</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">描述 *</label>
            <textarea
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细描述问题，包括您期望的结果"
              rows={5}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">附件（可选，最多 3 个，每个不超过 5MB）</label>
            <Input
              type="file"
              multiple
              onChange={handleFileChange}
              accept="image/*,.pdf,.doc,.docx,.txt,.zip"
            />
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <button className="text-red-500 hover:text-red-700 ml-2" onClick={() => removeFile(i)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 rounded px-3 py-2">{error}</div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "提交中..." : "提交工单"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/console/tickets")}>取消</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}