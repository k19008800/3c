import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import HelpModal from "../../components/HelpModal";
import api from "../../services/api";

// ── Types ──
interface ApiKeyItem {
  id: number;
  name: string;
  keyPrefix: string;
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface NewKeyResult {
  key: string;
  id: number;
  name: string;
}

// ── Component ──
export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdKey, setCreatedKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    const res = await api.get<{ list: ApiKeyItem[] }>("/me/api-keys");
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setKeys(res.data.list || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const filtered = keys.filter(
    (k) => !search || k.name.includes(search) || (k.keyPrefix && k.keyPrefix.includes(search))
  );

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    const res = await api.post<NewKeyResult>("/me/api-keys", { name: newKeyName });
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.data) {
      setCreatedKey(res.data.key);
      setShowCreate(false);
      setNewKeyName("");
      setShowSuccess(true);
      setCopied(false);
      await loadKeys();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(createdKey).catch(() => {});
    setCopied(true);
  };

  const confirmDelete = async () => {
    if (deleteId === null) return;
    const res = await api.delete(`/me/api-keys/${deleteId}`);
    if (res.error) {
      setError(res.error);
    }
    setDeleteId(null);
    await loadKeys();
  };

  const toggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    const res = await api.patch(`/me/api-keys/${id}`, { status: newStatus });
    if (res.error) {
      setError(res.error);
    }
    await loadKeys();
  };

  const STATUS_MAP: Record<string, { cls: string; text: string }> = {
    active: { cls: "badge-success", text: "启用中" },
    expiring: { cls: "badge-warning", text: "即将过期" },
    disabled: { cls: "badge-danger", text: "已禁用" },
    deleted: { cls: "badge-danger", text: "已删除" },
  };

  if (loading) {
    return (
      <div className="portal-layout">
        <aside className="sidebar">
          <div className="sidebar-logo">3Cloud</div>
          <nav className="sidebar-nav">
            <Link to="/dashboard" className="nav-item">📊 概览</Link>
            <Link to="/billing" className="nav-item">💰 消费明细</Link>
            <Link to="/api-keys" className="nav-item active">🔑 API Key</Link>
            <Link to="/playground" className="nav-item">🧪 Playground</Link>
            <Link to="/consumption" className="nav-item">📈 消费统计</Link>
          </nav>
        </aside>
        <main className="portal-main">
          <div className="loading-container">
            <div className="spinner" />
            <p>加载中...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="portal-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">3Cloud</div>
        <nav className="sidebar-nav">
          <Link to="/dashboard" className="nav-item">📊 概览</Link>
          <Link to="/billing" className="nav-item">💰 消费明细</Link>
          <Link to="/api-keys" className="nav-item active">🔑 API Key</Link>
          <Link to="/playground" className="nav-item">🧪 Playground</Link>
          <Link to="/consumption" className="nav-item">📈 消费统计</Link>
        </nav>
      </aside>

      <main className="portal-main">
        <h1 className="page-title">
          API Key 管理
          <HelpModal title="API Key 管理">
            <p>管理您的 API 密钥。创建新的 Key，设置权限和 IP 白名单。</p>
            <p style={{ marginTop: 8 }}>⚠️ 新创建的 Key 仅展示一次，请立即保存。</p>
          </HelpModal>
        </h1>
        <p className="page-subtitle">管理您的 API 密钥和访问权限</p>

        {error && <div className="error-banner">⚠️ {error}</div>}

        {/* Toolbar */}
        <div className="flex-between mb-16">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + 创建 Key
          </button>
          <input
            type="text"
            placeholder="搜索 Key 名称…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            style={{ width: 260 }}
          />
        </div>

        {/* Key Table */}
        <div className="panel">
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Key</th>
                  <th>创建时间</th>
                  <th>最后使用</th>
                  <th>过期时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 60 }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>🔑</div>
                      <div style={{ color: "var(--color-text-secondary)", marginBottom: 16 }}>暂无 API Key</div>
                      <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        创建第一个 Key
                      </button>
                    </td>
                  </tr>
                ) : (
                  filtered.map((k) => {
                    const status = STATUS_MAP[k.status] || STATUS_MAP.active;
                    return (
                      <tr key={k.id}>
                        <td>{k.name}</td>
                        <td>
                          <span className="text-mono" style={{ color: "var(--color-text-secondary)" }}>
                            {k.keyPrefix}...
                          </span>
                        </td>
                        <td>{k.createdAt ? new Date(k.createdAt).toISOString().slice(0, 10) : "—"}</td>
                        <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("zh-CN") : "—"}</td>
                        <td>{k.expiresAt ? new Date(k.expiresAt).toISOString().slice(0, 10) : "永不过期"}</td>
                        <td>
                          <span className={`badge ${status.cls}`}>{status.text}</span>
                        </td>
                        <td>
                          <div className="flex-wrap">
                            <button className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(k.keyPrefix).catch(() => {})}>
                              复制
                            </button>
                            <button className="btn btn-sm btn-secondary" onClick={() => setDeleteId(k.id)}>
                              删除
                            </button>
                            <button className="btn btn-sm btn-secondary" onClick={() => toggleStatus(k.id, k.status)}>
                              {k.status === "disabled" || k.status === "deleted" ? "启用" : "禁用"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>创建 API Key</h3>
                <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Key 名称 *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="例如：生产环境"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleCreate} disabled={!newKeyName.trim()}>
                  确认创建
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccess && (
          <div className="modal-overlay" onClick={() => setShowSuccess(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-body" style={{ textAlign: "center", padding: 32 }}>
                <h3 style={{ fontSize: 18, marginBottom: 20 }}>✅ API Key 创建成功</h3>
                <div className="code-block" style={{ fontSize: 16, letterSpacing: 1, margin: "16px 0", textAlign: "center" }}>
                  {createdKey}
                </div>
                <div style={{ color: "var(--color-danger-text)", fontSize: 13, marginBottom: 16 }}>
                  ⚠️ 该 Key 仅展示一次，请立即复制保存
                </div>
                <div className="flex-wrap" style={{ justifyContent: "center" }}>
                  <button className="btn btn-primary" onClick={handleCopy}>
                    {copied ? "已复制 ✅" : "复制 Key"}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowSuccess(false)}>
                    返回列表
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm Modal */}
        {deleteId !== null && (
          <div className="modal-overlay" onClick={() => setDeleteId(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
              <div className="modal-header">
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>⚠️ 确认删除</h3>
                <button className="modal-close" onClick={() => setDeleteId(null)}>✕</button>
              </div>
              <div className="modal-body">
                <p>确定要删除此 API Key 吗？此操作不可撤销。</p>
                <p style={{ marginTop: 8, color: "var(--color-danger-text)", fontSize: 13 }}>
                  删除后，使用该 Key 的所有请求将立即失败。
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>取消</button>
                <button className="btn btn-danger" onClick={confirmDelete}>确认删除</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
