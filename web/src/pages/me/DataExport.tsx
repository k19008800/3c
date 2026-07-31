import React, { useEffect, useState } from "react";
import {
  Card, Table, Button, Tag, message, Space, Typography, Alert, Result,
} from "antd";
import { DownloadOutlined, ExportOutlined, HistoryOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { get, post } from "../../lib/api";

const { Title, Text } = Typography;

interface ExportRequest {
  id: number;
  status: string;
  requestedAt: string;
  processedAt: string | null;
  fileUrl: string | null;
  fileSizeBytes: number | null;
  fileExpiresAt: string | null;
  errorMessage: string | null;
  rejectReason: string | null;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  pending: { color: "default", label: "待处理" },
  processing: { color: "processing", label: "生成中" },
  completed: { color: "success", label: "已完成" },
  failed: { color: "error", label: "失败" },
  rejected: { color: "warning", label: "已拒绝" },
};

const CHART_DATA_TYPES = "个人资料、API Key 列表、调用日志、充值记录、交易记录、发票记录";

const DataExport: React.FC = () => {
  const [list, setList] = useState<ExportRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasPending, setHasPending] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await get("/api/v1/me/data-export/requests?page=1&pageSize=20");
      if (res.code === 0) {
        setList(res.data.list);
        setHasPending(res.data.list.some((r: ExportRequest) => r.status === "pending" || r.status === "processing"));
      }
    } catch (err: any) {
      message.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRequestExport = async () => {
    setSubmitting(true);
    try {
      const res = await post("/api/v1/me/data-export/request");
      if (res.code === 0) {
        message.success("导出申请已提交，请等待管理员处理");
        fetchData();
      } else {
        message.error(res.message || "申请失败");
      }
    } catch (err: any) {
      message.error("申请失败: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const columns: ColumnsType<ExportRequest> = [
    {
      title: "申请时间",
      dataIndex: "requestedAt",
      width: 170,
      render: (v: string) => new Date(v).toLocaleString("zh-CN"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (s: string) => {
        const cfg = statusConfig[s] || { color: "default", label: s };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: "文件大小",
      dataIndex: "fileSizeBytes",
      width: 100,
      render: (v: number | null) => formatFileSize(v),
    },
    {
      title: "导出时间",
      dataIndex: "processedAt",
      width: 170,
      render: (v: string | null) => (v ? new Date(v).toLocaleString("zh-CN") : "-"),
    },
    {
      title: "操作",
      width: 150,
      render: (_, r) => {
        if (r.status === "completed" && r.fileUrl) {
          return (
            <Button type="link" icon={<DownloadOutlined />} href={r.fileUrl} target="_blank">
              下载
            </Button>
          );
        }
        if (r.status === "rejected") {
          return <Text type="warning">{r.rejectReason || "已拒绝"}</Text>;
        }
        if (r.status === "failed") {
          return <Text type="danger">{r.errorMessage || "导出失败"}</Text>;
        }
        return null;
      },
    },
  ];

  return (
    <div>
      <Title level={4}>
        <ExportOutlined /> 我的数据导出
        <span style={{ fontSize: 14, fontWeight: "normal", marginLeft: 12, color: "#999" }}>
          申请导出您的全部数据（GDPR 数据可携带权）
        </span>
      </Title>

      <Card style={{ marginBottom: 16 }}>
        <Result
          icon={<ExportOutlined style={{ fontSize: 48, color: "#1890ff" }} />}
          title="导出您的数据"
          subTitle={
            <div style={{ textAlign: "left", maxWidth: 500, margin: "0 auto" }}>
              <p>可导出的数据：</p>
              <ul>
                <li>个人资料（邮箱/手机/注册时间等）</li>
                <li>API Key 列表</li>
                <li>调用日志（最近 90 天）</li>
                <li>充值记录</li>
                <li>交易记录</li>
                <li>发票记录</li>
              </ul>
              <p style={{ color: "#999", fontSize: 13 }}>
                导出后数据将以 ZIP 格式发送到您的注册邮箱，处理时间 24 小时内。
              </p>
            </div>
          }
          extra={
            <Button
              type="primary"
              size="large"
              icon={<ExportOutlined />}
              loading={submitting}
              disabled={hasPending}
              onClick={handleRequestExport}
            >
              {hasPending ? "已有待处理的导出请求" : "申请导出"}
            </Button>
          }
        />
      </Card>

      <Card title={<><HistoryOutlined /> 导出历史</>}>
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: "暂无导出记录" }}
        />
      </Card>
    </div>
  );
};

export default DataExport;