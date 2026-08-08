import { useState } from "react";
import {
  HelpIcon,
  useToast,
  Modal,
  Table,
  Pagination,
  EmptyState,
  Skeleton,
  SkeletonGroup,
  StatusBadge,
  FormField,
  ConfirmPopover,
  SearchBar,
  FilterBar,
  CopyButton,
} from "@3cloud/shared-ui";
import type { ColumnDef, FilterDef } from "@3cloud/shared-ui";

/**
 * UX 组件演示页 — 免登录，展示所有 shared-ui 组件交互效果
 */
export default function UxDemoPage() {
  const { toast } = useToast();

  // Modal 示例
  const [modalOpen, setModalOpen] = useState(false);

  // Table 示例
  const [sortKey, setSortKey] = useState<string>("");
  const columns: ColumnDef[] = [
    { key: "name", title: "名称", sortable: true },
    { key: "status", title: "状态", render: (v) => <StatusBadge status={v === "启用" ? "success" : (v === "待审核" ? "warning" : "danger")}>{v as string}</StatusBadge> },
    { key: "price", title: "价格", sortable: true },
    { key: "action", title: "操作", render: () => <CopyButton text="sk-xxx-demo-key" label="复制Key" /> },
  ];
  const dataSource = [
    { name: "DeepSeek-V4", status: "启用", price: "¥0.003" },
    { name: "GLM-5.2", status: "待审核", price: "¥0.005" },
    { name: "Qwen3.7", status: "启用", price: "¥0.004" },
    { name: "Kimi-K3", status: "已禁用", price: "¥0.006" },
  ];

  // Pagination
  const [page, setPage] = useState(1);

  // FilterBar
  const filterDefs: FilterDef[] = [
    { key: "vendor", label: "供应商", type: "select", options: [{label:"全部",value:""},{label:"DeepSeek",value:"deepseek"},{label:"智谱",value:"zhipu"},{label:"阿里",value:"ali"},{label:"月之暗面",value:"moonshot"}] },
    { key: "status", label: "状态", type: "select", options: [{label:"全部",value:""},{label:"启用",value:"active"},{label:"已禁用",value:"disabled"}] },
  ];

  // SearchBar
  const [search, setSearch] = useState("");

  const sectionStyle: React.CSSProperties = {
    background: "var(--color-panel)",
    padding: 20,
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-panel)",
    marginBottom: 20,
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ marginBottom: 8 }}>
        UX 组件演示
        <HelpIcon text="这是共享 UI 组件库的交互演示页。包含 13 个组件：帮助图标、Toast、Modal、表格、分页、空状态、骨架屏、状态标签、表单字段、气泡确认、搜索栏、筛选栏、复制按钮。" level="page" />
      </h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: 32 }}>
        基于 <code>ux-guidelines.md</code> 设计规范实现，所有组件可通过 <code>@3cloud/shared-ui</code> 导入。
      </p>

      {/* ====== Toast ====== */}
      <div style={sectionStyle}>
        <h3 style={{ marginBottom: 12 }}>
          Toast 通知
          <HelpIcon text="操作反馈：成功(绿)、失败(红)、警告(黄)、提示(蓝)。点击下方按钮体验。" />
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => toast.success("操作成功！数据已保存")} style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "none", background: "var(--color-primary)", color: "#fff", cursor: "pointer" }}>✅ 成功 Toast</button>
          <button className="btn" onClick={() => toast.error("操作失败：余额不足")} style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", cursor: "pointer" }}>❌ 错误 Toast</button>
          <button className="btn" onClick={() => toast.warning("您的 Key 即将过期")} style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", cursor: "pointer" }}>⚠️ 警告 Toast</button>
          <button className="btn" onClick={() => toast.info("新公告已发布")} style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", cursor: "pointer" }}>ℹ️ 提示 Toast</button>
        </div>
      </div>

      {/* ====== Modal + ConfirmPopover ====== */}
      <div style={sectionStyle}>
        <h3 style={{ marginBottom: 12 }}>
          Modal 弹窗 & 气泡确认
          <HelpIcon text="Modal：居中弹窗，支持 ESC 和遮罩关闭。ConfirmPopover：危险操作的气泡确认。" />
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)} style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "none", background: "var(--color-primary)", color: "#fff", cursor: "pointer" }}>打开 Modal</button>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="模型详情">
            <p>这是 Modal 弹窗示例。点击遮罩、ESC 或关闭按钮均可关闭。</p>
            <p style={{ marginTop: 12 }}>弹窗默认宽度 520px，16px 圆角，带阴影。</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button onClick={() => setModalOpen(false)} style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}>取消</button>
              <button onClick={() => { setModalOpen(false); toast.success("已确认"); }} style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "none", background: "var(--color-primary)", color: "#fff", cursor: "pointer" }}>确认</button>
            </div>
          </Modal>
          <ConfirmPopover title="确定要删除「测试Key」吗？" description="此操作不可撤销，Key 将立即失效。"
            onConfirm={() => toast.success("已删除")}
            onCancel={() => {}}>
            <button style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-danger-text)", color: "var(--color-danger-text)", background: "#fff", cursor: "pointer" }}>🗑 删除（气泡确认）</button>
          </ConfirmPopover>
        </div>
      </div>

      {/* ====== Table + Pagination ====== */}
      <div style={sectionStyle}>
        <h3 style={{ marginBottom: 12 }}>
          Table 数据表格 + Pagination 分页
          <HelpIcon text="通用数据表格：点击表头排序（升序/降序/无），行 hover 高亮，StatusBadge 状态标签，CopyButton 复制。分页：页码跳转、每页条数选择。" />
        </h3>
        <Table columns={columns} dataSource={dataSource} rowKey="name" />
        <div style={{ marginTop: 16 }}>
          <Pagination current={page} total={86} onChange={(p) => { setPage(p); toast.info(`跳转到第 ${p} 页`); }} />
        </div>
      </div>

      {/* ====== SearchBar + FilterBar ====== */}
      <div style={sectionStyle}>
        <h3 style={{ marginBottom: 12 }}>
          SearchBar 搜索 + FilterBar 筛选
          <HelpIcon text="搜索栏支持防抖和清除。筛选栏支持下拉选择、日期范围、文本输入三种类型。" />
        </h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <SearchBar value={search} onChange={setSearch} onSearch={() => toast.info(`搜索: ${search}`)} placeholder="搜索模型名称..." />
        </div>
        <FilterBar filters={filterDefs} onChange={(v) => toast.info(`筛选: ${JSON.stringify(v)}`)} onReset={() => toast.info("已重置筛选")} />
      </div>

      {/* ====== FormField ====== */}
      <div style={sectionStyle}>
        <h3 style={{ marginBottom: 12 }}>
          FormField 表单字段
          <HelpIcon text="必填标记红色*，错误时红色边框+错误提示，help 灰色小字补充说明。" />
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <FormField label="模型名称" required help="输入模型标识符，如 deepseek-chat">
            <input type="text" placeholder="deepseek-chat" style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: 14, boxSizing: "border-box" }} />
          </FormField>
          <FormField label="价格 (¥)" required error="价格不能为负数">
            <input type="number" placeholder="0.003" style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-danger-text)", fontSize: 14, boxSizing: "border-box" }} />
          </FormField>
        </div>
      </div>

      {/* ====== Skeleton + EmptyState ====== */}
      <div style={sectionStyle}>
        <h3 style={{ marginBottom: 12 }}>
          Skeleton 骨架屏 & EmptyState 空状态
          <HelpIcon text="骨架屏：text/rect/circle 三种变体，shimmer 扫光动画。空状态：带图标和操作引导。" />
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div>
            <p style={{ marginBottom: 8, color: "var(--color-text-secondary)" }}>加载中 →</p>
            <SkeletonGroup lines={4} />
          </div>
          <div>
            <p style={{ marginBottom: 8, color: "var(--color-text-secondary)" }}>无数据 →</p>
            <EmptyState icon="📭" title="暂无数据" description="当前没有可显示的记录" actionText="创建第一条" onAction={() => toast.info("点击了创建按钮")} />
          </div>
        </div>
      </div>

      {/* ====== StatusBadge + CopyButton ====== */}
      <div style={sectionStyle}>
        <h3 style={{ marginBottom: 12 }}>
          StatusBadge 状态标签 & CopyButton 复制
          <HelpIcon text="StatusBadge 支持 tag（方角）和 pill（圆角胶囊）两种变体，五色语义。CopyButton 点击复制到剪贴板，2秒后恢复。" />
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>方角 tag：</p>
            <StatusBadge status="success">启用</StatusBadge>
            <StatusBadge status="warning">待审核</StatusBadge>
            <StatusBadge status="danger">已禁用</StatusBadge>
            <StatusBadge status="info">处理中</StatusBadge>
            <StatusBadge status="default">已取消</StatusBadge>
          </div>
          <div style={{ marginLeft: 32 }}>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>Pill 胶囊：</p>
            <StatusBadge status="success" variant="pill">已完成</StatusBadge>
            <StatusBadge status="warning" variant="pill">待审核</StatusBadge>
            <StatusBadge status="danger" variant="pill">驳回</StatusBadge>
            <StatusBadge status="default" variant="pill">已取消</StatusBadge>
          </div>
          <div style={{ marginLeft: 32 }}>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>复制操作：</p>
            <CopyButton text="sk-proj-abc123def456" />
          </div>
        </div>
      </div>
    </div>
  );
}
