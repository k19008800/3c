import React, { useEffect, useState } from "react";
import {
  Card, Table, Button, Tag, Modal, Input, message, Space, Typography, Descriptions, Divider, Alert,
} from "antd";
import { DownloadOutlined, ExportOutlined, StopOutlined, CheckCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { get, post } from "../../lib/api";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ExportRequest {
  id: number;
  userId: number;
  userEmail: string | null;
  userNickname: string | null;
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

const AdminDataExportRequests: React.FC = () => {
  const [list, setList] = useState<ExportRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [processing, setProcessing] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<{ visible: boolean; id: number }>({ visible: false, id: 0 });
  const [rejectReason, setRejectReason] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await get(`/api/v1/admin/data-export/requests?${params}`);
      if (res.code === 0) {
        setList(res.data.list);
        setTotal(res.data.total);
      } else {
        message.error(res.message || "加载失败");
      }
    } catch (err: any) {
      message.error("加载失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, statusFilter]);

  const handleProcess = async (id: number) => {
    setProcessing(id);
    try {
      const res = await post(`/api/v1/admin/data-export/${id}/process`);
      if (res.code === 0) {
        message.success("已处理导出请求");
        fetchData();
      } else {
        message.error(res.message || "处理失败");
      }
    } catch (err: any) {
      message.error("处理失败: " + err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      message.warning("请填写拒绝原因");
      return;
    }
    try {
      const res = await post(`/api/v1/admin/data-export/${rejectModal.id}/reject`, { reason: rejectReason });
      if (res.code === 0) {
        message.success("已拒绝导出请求");
        setRejectModal({ visible: false, id: 0 });
        setRejectReason("");
        fetchData();
      } else {
        message.error(res.message || "操作失败");
      }
    } catch (err: any) {
      message.error("操作失败: " + err.message);
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
      title: "#",
      dataIndex: "id",
      width: 60,
    },
    {
      title: "用户",
      width: 180,
      render: (_, r) => r.userNickname || r.userEmail || `用户 #${r.userId}`,
    },
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
      title: "操作",
      width: 300,
      render: (_, r) => {
        if (r.status === "pending") {
          return (
            <Space>
              <Button type="primary" size="small" icon={<CheckCircleOutlined />} loading={processing === r.id} onClick={() => handleProcess(r.id)}>
                处理
              </Button>
              <Button size="small" icon={<StopOutlined />} onClick={() => setRejectModal({ visible: true, id: r.id })}>
                拒绝
              </Button>
            </Space>
          );
        }
        if (r.status === "completed") {
          return (
            <Space>
              <Button size="small" icon={<DownloadOutlined />} disabled={!r.fileUrl}>
                下载
              </Button>
              <Button size="small" disabled>
                重新发送链接
              </Button>
            </Space>
          );
        }
        if (r.status === "failed") {
          return (
            <Space>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => handleProcess(r.id)}>
                重新处理
              </Button>
            </Space>
          );
        }
        if (r.status === "rejected") {
          return <Text type="secondary">{r.rejectReason || "已拒绝"}</Text>;
        }
        return <Tag color="processing">生成中...</Tag>;
      },
    },
  ];

  return (
    <div>
      <Title level={4}>
        <ExportOutlined /> 数据导出请求管理
        <span style={{ fontSize: 14, fontWeight: "normal", marginLeft: 12, color: "#999" }}>
          管理和处理用户的数据导出请求
        </span>
      </Title>

      <Card>
        <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <Space>
            <span>状态筛选：</span>
            {["", "pending", "processing", "completed", "failed", "rejected"].map((s) => (
              <Tag
                key={s}
                color={statusFilter === s ? "blue" : "default"}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setStatusFilter(s || undefined);
                  setPage(1);
                }}
              >
                {s ? (statusConfig[s]?.label || s) : "全部"}
              </Tag>
            ))}
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </Card>

      <Modal
        title="拒绝导出请求"
        open={rejectModal.visible}
        onOk={handleReject}
        onCancel={() => {
          setRejectModal({ visible: false, id: 0 });
          setRejectReason("");
        }}
        okText="确认拒绝"
        cancelText="取消"
      >
        <div style={{ margin: "16px 0" }}>
          <Text type="secondary">请输入拒绝原因，该原因将展示给用户：</Text>
          <TextArea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="请填写拒绝原因..."
            style={{ marginTop: 8 }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default AdminDataExportRequests;