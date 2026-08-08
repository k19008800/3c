import { useState, useMemo } from "react";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";

/**
 * TODO: 后端需补充 GET /api/v1/admin/users 端点（分页 + 搜索 + 状态筛选）
 * 当前使用 mock 数据演示 UI，数据适配字段与后端用户表保持一致后接入。
 */

interface Customer {
  id: number;
  email: string;
  username: string;
  registeredAt: string;
  balance: number;
  totalConsumed: number;
  agent: string;
  status: "active" | "frozen" | "pending";
  verified: boolean;
}

const MOCK_CUSTOMERS: Customer[] = [
  { id: 1, email: "alice@example.com", username: "Alice", registeredAt: "2025-01-15", balance: 1250.50, totalConsumed: 8920.30, agent: "张代理", status: "active", verified: true },
  { id: 2, email: "bob@techcorp.com", username: "Bob", registeredAt: "2025-02-20", balance: 340.00, totalConsumed: 15600.00, agent: "李代理", status: "active", verified: true },
  { id: 3, email: "charlie@startup.io", username: "Charlie", registeredAt: "2025-03-10", balance: 85.50, totalConsumed: 4200.75, agent: "直接注册", status: "frozen", verified: false },
  { id: 4, email: "diana@enterprise.cn", username: "Diana", registeredAt: "2025-04-05", balance: 5000.00, totalConsumed: 32000.00, agent: "王代理", status: "active", verified: true },
  { id: 5, email: "eric@devteam.com", username: "Eric", registeredAt: "2025-05-12", balance: 120.00, totalConsumed: 890.00, agent: "直接注册", status: "pending", verified: false },
  { id: 6, email: "fiona@ai-lab.org", username: "Fiona", registeredAt: "2025-06-01", balance: 2800.00, totalConsumed: 18700.50, agent: "赵代理", status: "active", verified: true },
  { id: 7, email: "george@research.edu", username: "George", registeredAt: "2025-06-15", balance: 450.00, totalConsumed: 5600.00, agent: "直接注册", status: "active", verified: true },
  { id: 8, email: "helen@cloud.dev", username: "Helen", registeredAt: "2025-07-01", balance: 0.00, totalConsumed: 1200.00, agent: "李代理", status: "frozen", verified: true },
  { id: 9, email: "ivan@mobile.app", username: "Ivan", registeredAt: "2025-07-20", balance: 660.00, totalConsumed: 3400.00, agent: "直接注册", status: "active", verified: false },
  { id: 10, email: "julia@data.biz", username: "Julia", registeredAt: "2025-08-01", balance: 1800.00, totalConsumed: 9800.00, agent: "张代理", status: "active", verified: true },
];

type CustomerTab = "overview" | "consumption" | "keys" | "logs";

export default function AdminCustomers() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<keyof Customer | "">("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<CustomerTab>("overview");
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("");

  const filtered = useMemo(() => {
    let list = MOCK_CUSTOMERS.filter((c) => {
      if (search && !c.email.includes(search) && !c.username.includes(search)) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      return true;
    });
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        if (typeof va === "string" && typeof vb === "string") {
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
      });
    }
    return list;
  }, [search, statusFilter, sortKey, sortDir]);

  const handleSort = (key: keyof Customer) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "active": return "活跃";
      case "frozen": return "已冻结";
      case "pending": return "待审核";
      default: return s;
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <h2 className="admin-page-title">
          客户管理
          <HelpModal title="客户管理">
            <p>管理平台所有注册客户。可以查看客户详情、充值、重置密码、冻结/解冻账号等。</p>
            <p><strong>搜索筛选</strong>：按邮箱或用户名搜索，按状态筛选。</p>
            <p><strong>客户详情</strong>：点击客户行查看详情抽屉，包含余额、消费、API Key、日志等 Tab。</p>
          </HelpModal>
        </h2>
        <span style={{ fontSize: 11, color: "#f59e0b" }}>
          ⚠️ TODO: 后端需补充 GET /api/v1/admin/users 端点，当前为演示数据
        </span>
      </div>

      {/* Filters */}
      <div className="panel">
        <div className="panel-body">
          <div className="flex-wrap gap-12">
            <input
              className="form-input"
              style={{ width: 260 }}
              placeholder="搜索邮箱或用户名…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="form-select"
              style={{ width: 140 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">全部状态</option>
              <option value="active">活跃</option>
              <option value="frozen">已冻结</option>
              <option value="pending">待审核</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("id")}>
                  ID {sortKey === "id" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick={() => handleSort("email")}>
                  邮箱 {sortKey === "email" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick={() => handleSort("registeredAt")}>
                  注册时间 {sortKey === "registeredAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick={() => handleSort("balance")}>
                  余额 {sortKey === "balance" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick={() => handleSort("totalConsumed")}>
                  累计消费 {sortKey === "totalConsumed" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th>代理</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => setSelectedCustomer(c)} style={{ cursor: "pointer" }}>
                  <td>{c.id}</td>
                  <td>
                    {c.email}
                    {!c.verified && <span className="badge badge-warning" style={{ marginLeft: 6 }}>未认证</span>}
                  </td>
                  <td>{c.registeredAt}</td>
                  <td><span className="text-mono">¥{c.balance.toFixed(2)}</span></td>
                  <td><span className="text-mono">¥{c.totalConsumed.toFixed(2)}</span></td>
                  <td>{c.agent}</td>
                  <td>
                    <StatusBadge status={c.status === "active" ? "success" : c.status === "frozen" ? "error" : "pending"}>
                      {statusLabel(c.status)}
                    </StatusBadge>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex-wrap gap-8">
                      <button className="btn btn-xs btn-primary" onClick={() => { setSelectedCustomer(c); setRechargeOpen(true); }}>
                        充值
                      </button>
                      <button className="btn btn-xs btn-secondary">冻结</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer */}
      <Modal
        open={!!selectedCustomer && !rechargeOpen}
        onClose={() => setSelectedCustomer(null)}
        title={`客户详情 — ${selectedCustomer?.email ?? ""}`}
        width={680}
      >
        {selectedCustomer && (
          <>
            <div className="admin-detail-tabs">
              {(["overview", "consumption", "keys", "logs"] as CustomerTab[]).map((tab) => (
                <button
                  key={tab}
                  className={`admin-detail-tab${detailTab === tab ? " active" : ""}`}
                  onClick={() => setDetailTab(tab)}
                >
                  {tab === "overview" ? "基本信息"
                    : tab === "consumption" ? "消费记录"
                    : tab === "keys" ? "API Key"
                    : "操作日志"}
                </button>
              ))}
            </div>

            {detailTab === "overview" && (
              <div style={{ marginTop: 16 }}>
                <div className="admin-detail-grid">
                  <div><strong>邮箱：</strong>{selectedCustomer.email}</div>
                  <div><strong>用户名：</strong>{selectedCustomer.username}</div>
                  <div><strong>注册时间：</strong>{selectedCustomer.registeredAt}</div>
                  <div><strong>余额：</strong>¥{selectedCustomer.balance.toFixed(2)}</div>
                  <div><strong>累计消费：</strong>¥{selectedCustomer.totalConsumed.toFixed(2)}</div>
                  <div><strong>代理：</strong>{selectedCustomer.agent}</div>
                  <div><strong>实名认证：</strong>{selectedCustomer.verified ? "✅ 已认证" : "❌ 未认证"}</div>
                  <div><strong>状态：</strong>
                    <StatusBadge status={selectedCustomer.status === "active" ? "success" : selectedCustomer.status === "frozen" ? "error" : "pending"}>
                      {statusLabel(selectedCustomer.status)}
                    </StatusBadge>
                  </div>
                </div>
                <div className="flex-wrap gap-8" style={{ marginTop: 16 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => setRechargeOpen(true)}>💰 充值</button>
                  <button className="btn btn-sm btn-secondary">🔒 重置密码</button>
                  <button className="btn btn-sm btn-secondary">✅ 强制认证</button>
                  <button className="btn btn-sm btn-danger">⛔ {selectedCustomer.status === "frozen" ? "解冻" : "冻结"}</button>
                  <button className="btn btn-sm btn-danger">🗑️ 注销</button>
                </div>
              </div>
            )}
            {detailTab === "consumption" && (
              <div style={{ marginTop: 16 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>日期</th><th>模型</th><th>Token 输入</th><th>Token 输出</th><th>消费金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { date: "2025-08-08", model: "GPT-4o", in: "12,500", out: "38,200", cost: "¥4.56" },
                      { date: "2025-08-07", model: "Claude 3.5", in: "8,900", out: "22,100", cost: "¥3.21" },
                      { date: "2025-08-06", model: "DeepSeek V3", in: "15,300", out: "51,800", cost: "¥5.89" },
                    ].map((row, i) => (
                      <tr key={i}>
                        <td>{row.date}</td><td>{row.model}</td>
                        <td>{row.in}</td><td>{row.out}</td><td>{row.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {detailTab === "keys" && (
              <div style={{ marginTop: 16 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Key 名称</th><th>前缀</th><th>创建时间</th><th>最后使用</th><th>状态</th></tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "Default Key", prefix: "sk-a1b2...", created: "2025-01-15", lastUsed: "2025-08-08", status: "active" },
                      { name: "Dev Key", prefix: "sk-c3d4...", created: "2025-03-20", lastUsed: "2025-08-07", status: "active" },
                    ].map((key, i) => (
                      <tr key={i}>
                        <td>{key.name}</td><td className="text-mono">{key.prefix}</td>
                        <td>{key.created}</td><td>{key.lastUsed}</td>
                        <td><StatusBadge status="success">活跃</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {detailTab === "logs" && (
              <div style={{ marginTop: 16 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>时间</th><th>操作</th><th>操作人</th><th>备注</th></tr>
                  </thead>
                  <tbody>
                    {[
                      { time: "2025-08-08 10:30", action: "充值", operator: "admin", note: "人工充值 ¥100" },
                      { time: "2025-08-07 14:20", action: "修改密码", operator: "系统", note: "用户自助重置" },
                      { time: "2025-08-05 09:00", action: "创建 Key", operator: "alice@example.com", note: "创建 Default Key" },
                    ].map((log, i) => (
                      <tr key={i}>
                        <td>{log.time}</td><td>{log.action}</td><td>{log.operator}</td><td>{log.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Recharge Modal */}
      <Modal
        open={rechargeOpen}
        onClose={() => { setRechargeOpen(false); setRechargeAmount(""); }}
        title="人工充值"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setRechargeOpen(false); setRechargeAmount(""); }}>取消</button>
            <button className="btn btn-primary" onClick={() => { setRechargeOpen(false); setRechargeAmount(""); }}>确认充值</button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">客户</label>
          <input className="form-input" value={selectedCustomer?.email ?? ""} disabled />
        </div>
        <div className="form-group">
          <label className="form-label">充值金额 (元)</label>
          <input
            className="form-input"
            type="number"
            placeholder="请输入充值金额"
            value={rechargeAmount}
            onChange={(e) => setRechargeAmount(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">备注</label>
          <input className="form-input" placeholder="可选" />
        </div>
      </Modal>
    </div>
  );
}
