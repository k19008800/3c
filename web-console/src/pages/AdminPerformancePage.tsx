import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

interface PerfConfig {
  cache_ttl_seconds: number; query_timeout_seconds: number; connection_pool_max: number;
  connection_pool_idle_timeout: number; compression_enabled: boolean; response_gzip_min_bytes: number;
  batch_write_enabled: boolean; batch_write_interval_ms: number; slow_query_threshold_ms: number;
  max_concurrent_requests: number;
}

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

export default function AdminPerformancePage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<PerfConfig>({
    cache_ttl_seconds: 300, query_timeout_seconds: 30, connection_pool_max: 20,
    connection_pool_idle_timeout: 60, compression_enabled: true, response_gzip_min_bytes: 1024,
    batch_write_enabled: true, batch_write_interval_ms: 500, slow_query_threshold_ms: 1000,
    max_concurrent_requests: 1000,
  });
  const [loading, setLoading] = useState(true);
  // 后端加载失败标记：GET 404 视为未接入，页面展示禁用徽标
  const [backendMissing, setBackendMissing] = useState(false);

  useEffect(() => {
    api.get("/admin/performance").then(r => setConfig(r.data?.data ?? config))
      .catch((e: any) => { if (e?.response?.status === 404) setBackendMissing(true); })
      .finally(() => setLoading(false));
  }, []);

  async function saveConfig() {
    try {
      await api.put("/admin/performance", config);
      toast.success("性能配置已保存，部分配置需重启生效");
    } catch (e: any) {
      toast.error(e?.response?.status === 404 ? "性能配置后端未接入（/admin/performance 待实现）" : (e?.response?.data?.message ?? e?.message ?? "保存失败"));
    }
  }

  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" };
  const label: React.CSSProperties = { width: 200, fontSize: 13, color: "#666", flexShrink: 0 };
  const numberInput: React.CSSProperties = { width: 120, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, textAlign: "center" };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>加载中…</div>;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>⚡</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>性能配置
          <HelpIcon text="调整平台性能参数：缓存TTL、查询超时、连接池、压缩、批量写入、慢查询阈值、并发限制等。" level="page" />
          {backendMissing && <span style={{ fontSize: 11, color: "#f59e0b", marginLeft: 8 }}>⚠️ 后端未接入（/admin/performance 待实现），保存将不生效</span>}
        </span>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>⚡ 缓存配置 <HelpIcon text="Redis 缓存默认过期时间。" /></h3>
        <div style={row}>
          <span style={label}>缓存 TTL (秒) <HelpIcon text="Redis 键默认过期时间，建议 300-600 秒。" /></span>
          <input type="number" value={config.cache_ttl_seconds} onChange={e => setConfig({...config, cache_ttl_seconds: Number(e.target.value)})} style={numberInput} />
          <span style={{ fontSize: 12, color: "#888" }}>秒</span>
        </div>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginTop: 16 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>🗄️ 数据库配置</h3>
        <div style={row}>
          <span style={label}>查询超时 (秒) <HelpIcon text="SQL 语句最大执行时间，超时将返回错误。" /></span>
          <input type="number" value={config.query_timeout_seconds} onChange={e => setConfig({...config, query_timeout_seconds: Number(e.target.value)})} style={numberInput} />
        </div>
        <div style={row}>
          <span style={label}>连接池大小 <HelpIcon text="数据库连接池最大连接数。" /></span>
          <input type="number" value={config.connection_pool_max} onChange={e => setConfig({...config, connection_pool_max: Number(e.target.value)})} style={numberInput} />
        </div>
        <div style={row}>
          <span style={label}>连接空闲超时 (秒)</span>
          <input type="number" value={config.connection_pool_idle_timeout} onChange={e => setConfig({...config, connection_pool_idle_timeout: Number(e.target.value)})} style={numberInput} />
        </div>
        <div style={row}>
          <span style={label}>慢查询阈值 (ms) <HelpIcon text="超过此时间将在日志中标记为慢查询。" /></span>
          <input type="number" value={config.slow_query_threshold_ms} onChange={e => setConfig({...config, slow_query_threshold_ms: Number(e.target.value)})} style={numberInput} />
          <span style={{ fontSize: 12, color: "#888" }}>毫秒</span>
        </div>
        <div style={row}>
          <span style={label}>批量写入 <HelpIcon text="开启后对日志类数据批量写入数据库，提升吞吐。" /></span>
          <Toggle on={config.batch_write_enabled} onChange={v => setConfig({...config, batch_write_enabled: v})} />
        </div>
        <div style={row}>
          <span style={label}>批量写入间隔 (ms)</span>
          <input type="number" value={config.batch_write_interval_ms} onChange={e => setConfig({...config, batch_write_interval_ms: Number(e.target.value)})} style={numberInput} disabled={!config.batch_write_enabled} />
        </div>
      </div>

      <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginTop: 16 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>🌐 响应优化</h3>
        <div style={row}>
          <span style={label}>GZip 压缩 <HelpIcon text="对响应体启用 GZip 压缩，减少带宽。" /></span>
          <Toggle on={config.compression_enabled} onChange={v => setConfig({...config, compression_enabled: v})} />
        </div>
        <div style={row}>
          <span style={label}>压缩最小字节数</span>
          <input type="number" value={config.response_gzip_min_bytes} onChange={e => setConfig({...config, response_gzip_min_bytes: Number(e.target.value)})} style={numberInput} disabled={!config.compression_enabled} />
        </div>
        <div style={row}>
          <span style={label}>最大并发请求数 <HelpIcon text="网关允许的最大并发 API 请求数，超过将排队。" /></span>
          <input type="number" value={config.max_concurrent_requests} onChange={e => setConfig({...config, max_concurrent_requests: Number(e.target.value)})} style={numberInput} />
        </div>
      </div>

      <button onClick={saveConfig} style={{ marginTop: 20, padding: "10px 32px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
        保存性能配置
        <HelpIcon text="部分参数（连接池、并发限制）需重启服务生效。" />
      </button>
    </div>
  );
}
