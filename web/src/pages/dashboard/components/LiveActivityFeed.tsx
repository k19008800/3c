// ============================================================
//  3cloud (3C) — 实时活动流组件
//  显示用户最新的 API 调用记录
// ============================================================

import { useState } from 'react';
import { useActivityFeed, ActivityEvent } from '@/hooks/useActivityFeed';
import {
  Activity,
  Pause,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';

// ── 格式化工具函数 ──

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  // 小于 1 分钟
  if (diff < 60 * 1000) {
    return '刚刚';
  }

  // 小于 1 小时
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))} 分钟前`;
  }

  // 小于 24 小时
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
  }

  // 显示日期时间
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTokens(tokens: number): string {
  if (tokens >= 10000) {
    return `${(tokens / 10000).toFixed(1)}万`;
  }
  return tokens.toLocaleString();
}

function formatCost(cost: number): string {
  return `¥${cost.toFixed(4)}`;
}

// ── 事件条目组件 ──

function EventItem({ event }: { event: ActivityEvent }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors group">
      {/* 状态图标 */}
      <div className="mt-0.5 shrink-0">
        {event.status === 'success' ? (
          <CheckCircle2 size={16} className="text-green-500" />
        ) : (
          <XCircle size={16} className="text-red-500" />
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-slate-900 truncate">
            {event.model}
          </span>
          {event.keyName && (
            <span className="text-xs text-slate-400 font-mono truncate">
              ({event.keyName})
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>
            {formatTokens(event.inputTokens)} → {formatTokens(event.outputTokens)} tokens
          </span>
          <span className="font-mono font-medium text-slate-700">
            {formatCost(event.cost)}
          </span>
        </div>
      </div>

      {/* 时间 */}
      <div className="text-xs text-slate-400 shrink-0">
        {formatTime(event.timestamp)}
      </div>
    </div>
  );
}

// ── 主组件 ──

export default function LiveActivityFeed() {
  const {
    events,
    isConnected,
    isPaused,
    pause,
    resume,
    reconnect,
    clearEvents,
  } = useActivityFeed({ maxEvents: 50 });

  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-900">实时活动流</h3>
          <span className="text-xs text-slate-400">
            ({events.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 连接状态 */}
          <div className="flex items-center gap-1 text-xs">
            {isConnected ? (
              <>
                <Wifi size={12} className="text-green-500" />
                <span className="text-green-600">已连接</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-slate-400" />
                <span className="text-slate-500">未连接</span>
              </>
            )}
          </div>

          {/* 暂停/恢复按钮 */}
          {isConnected && (
            <button
              onClick={isPaused ? resume : pause}
              className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
              title={isPaused ? '恢复实时更新' : '暂停实时更新'}
            >
              {isPaused ? (
                <Play size={14} className="text-green-600" />
              ) : (
                <Pause size={14} className="text-slate-500" />
              )}
            </button>
          )}

          {/* 重连按钮 */}
          {!isConnected && (
            <button
              onClick={reconnect}
              className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
              title="重新连接"
            >
              <RefreshCw size={14} className="text-slate-500" />
            </button>
          )}

          {/* 清空按钮 */}
          {events.length > 0 && (
            <button
              onClick={clearEvents}
              className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
              title="清空活动流"
            >
              <Trash2 size={14} className="text-slate-500" />
            </button>
          )}

          {/* 展开/折叠按钮 */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
            title={isExpanded ? '折叠' : '展开'}
          >
            <Activity
              size={14}
              className={`text-slate-500 transition-transform ${isExpanded ? '' : 'rotate-180'}`}
            />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            // 空状态
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Activity size={32} className="text-slate-300 mb-3" />
              <p className="text-sm text-slate-500 mb-1">暂无活动记录</p>
              <p className="text-xs text-slate-400">
                {isConnected
                  ? 'API 调用完成后将自动显示在这里'
                  : '连接后将显示实时活动'}
              </p>
            </div>
          ) : (
            // 事件列表
            <div className="divide-y divide-slate-100">
              {events.map((event) => (
                <EventItem key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 暂停提示 */}
      {isPaused && isExpanded && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-xs text-amber-700 flex items-center gap-1">
            <Pause size={12} />
            已暂停实时更新，点击恢复按钮继续接收新活动
          </p>
        </div>
      )}
    </div>
  );
}
