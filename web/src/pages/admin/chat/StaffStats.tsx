// ============================================================
//  3cloud (3C) — 客服绩效统计（§27.5）
//  /console/admin/chat/stats
// ============================================================

import React, { useState, useEffect } from "react";
import api from "../../../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";

interface StaffStatsItem {
  staffName: string;
  totalSessions: number;
  totalTickets: number;
  avgSessionTime: number;
  avgResponseTime: number;
  satisfactionAvg: number | null;
}

export default function StaffStats() {
  const [overview, setOverview] = useState({
    totalSessions: 0,
    totalTickets: 0,
    avgSessionTime: 0,
    avgResponseTime: 0,
  });
  const [staffStats, setStaffStats] = useState<StaffStatsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/v1/admin/chat/stats");
        const d = res.data;
        if (d.overview) setOverview(d.overview);
        else setOverview(d);
        if (d.staffStats) setStaffStats(d.staffStats);
        else if (d.ranking) setStaffStats(d.ranking);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="text-center py-12">加载中...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">客服绩效统计</h1>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="py-4 text-center">
          <div className="text-2xl font-bold">{overview.totalSessions}</div>
          <div className="text-sm text-muted-foreground">总会话</div>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <div className="text-2xl font-bold">{overview.totalTickets}</div>
          <div className="text-sm text-muted-foreground">处理工单</div>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <div className="text-2xl font-bold">{overview.avgSessionTime.toFixed(1)}m</div>
          <div className="text-sm text-muted-foreground">平均会话时长</div>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <div className="text-2xl font-bold">{overview.avgResponseTime.toFixed(1)}s</div>
          <div className="text-sm text-muted-foreground">平均响应时间</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>客服排行</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">排名</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">客服</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">会话数</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">工单数</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">平均会话时长</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">平均响应时间</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">满意度</th>
              </tr>
            </thead>
            <tbody>
              {staffStats.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">暂无数据</td></tr>
              ) : (
                staffStats.map((s, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      {i === 0 ? <span className="text-lg">1st</span> : i === 1 ? <span className="text-lg">2nd</span> : i === 2 ? <span className="text-lg">3rd</span> : `#${i + 1}`}
                    </td>
                    <td className="p-3 text-sm font-medium">{s.staffName}</td>
                    <td className="p-3 text-sm">{s.totalSessions}</td>
                    <td className="p-3 text-sm">{s.totalTickets}</td>
                    <td className="p-3 text-sm">{s.avgSessionTime.toFixed(1)}m</td>
                    <td className="p-3 text-sm">{s.avgResponseTime.toFixed(1)}s</td>
                    <td className="p-3 text-sm">
                      {s.satisfactionAvg != null
                        ? <Badge className={s.satisfactionAvg >= 4 ? "bg-green-100 text-green-800" : s.satisfactionAvg >= 3 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}>{s.satisfactionAvg.toFixed(1)}</Badge>
                        : <span className="text-muted-foreground">--</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}