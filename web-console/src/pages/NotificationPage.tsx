import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  SkeletonGroup,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

interface Prefs {
  [type: string]: { site: boolean; email: boolean };
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function NotificationPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const notifQ = useQuery({
    queryKey: ["me-notif"],
    queryFn: async () =>
      (
        await api.get<{ data: { types: Record<string, string>; prefs: Prefs } }>(
          "/me/notification-subscriptions",
        )
      ).data.data,
  });

  const toggleMut = useMutation({
    mutationFn: async ({
      type,
      channel,
      enabled,
    }: {
      type: string;
      channel: string;
      enabled: boolean;
    }) =>
      (await api.post(`/me/notification-subscriptions/${type}/${channel}`, { enabled })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-notif"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const entries = Object.entries(notifQ.data?.types ?? {});

  const columns: ColumnDef<{ type: string; label: string; site: boolean; email: boolean }>[] = [
    { key: "type", title: "通知类型", dataIndex: "type", render: (_, record) => <strong>{record.label}</strong> },
    {
      key: "site",
      title: "站内信",
      render: (_, record) => (
        <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", gap: 6 }}>
          <input
            type="checkbox"
            checked={record.site}
            onChange={(e) =>
              toggleMut.mutate({ type: record.type, channel: "site", enabled: e.target.checked })
            }
            style={{ width: 18, height: 18 }}
          />
        </label>
      ),
    },
    {
      key: "email",
      title: "邮件",
      render: (_, record) => (
        <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", gap: 6 }}>
          <input
            type="checkbox"
            checked={record.email}
            onChange={(e) =>
              toggleMut.mutate({ type: record.type, channel: "email", enabled: e.target.checked })
            }
            style={{ width: 18, height: 18 }}
          />
        </label>
      ),
    },
  ];

  const dataSource = entries.map(([type, label]) => {
    const p = notifQ.data?.prefs[type];
    return { type, label, site: p?.site ?? true, email: p?.email ?? true };
  });

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ marginBottom: 20 }}>
        通知设置
        <HelpIcon text="控制各类通知推送到站内信或邮件。关闭后该类通知将不再发送。" level="page" />
      </h2>
      <div style={card}>
        {notifQ.isLoading ? (
          <SkeletonGroup lines={5} />
        ) : (
          <Table columns={columns} dataSource={dataSource} loading={notifQ.isLoading} emptyText="暂无通知类型" />
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: "var(--color-text-secondary)" }}>
        控制各类通知推送到站内信或邮件。关闭后该类通知将不再发送。
      </div>
    </div>
  );
}
