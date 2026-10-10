import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface OnboardingStatus {
  status: "not_started" | "in_progress" | "completed" | "skipped";
  step: number;
  completedAt: string | null;
}

const steps = [
  {
    title: "🎉 欢迎使用 3Cloud",
    subtitle: "统一 API 接入数十家 AI 供应商模型",
    desc: [
      "统一 API — 一个 Key 调用数十家 AI 供应商模型，无需分别对接",
      "智能路由 — 自动选择最优供应商，保证可用性和最低成本",
      "精细运营 — 实时监控用量、费用、预算，数据尽在掌握",
    ],
  },
  {
    title: "🔑 创建您的第一个 API Key",
    subtitle: "API Key 是您使用 3Cloud 服务的凭证",
    desc: ["首先，让我们创建一个 API Key，这是您使用 3Cloud 服务的凭证 🗝️"],
  },
  {
    title: "🔍 了解模型与定价",
    subtitle: "浏览可用的 AI 模型及其定价",
    desc: ["您可以在这里搜索需要的模型，查看价格和上下文长度 🗳️"],
  },
  {
    title: "🧪 在线测试 API",
    subtitle: "在 Playground 中测试您的第一个 API 调用",
    desc: ["点击发送，测试您的第一个 API 调用吧！🚀"],
  },
  {
    title: "📄 获取接入代码",
    subtitle: "复制代码即可在您的项目中集成 AI 能力",
    desc: ["恭喜完成引导！复制代码即可在您的项目中集成 AI 能力，查看完整文档获取更多玩法"],
  },
];

interface Props {
  onClose?: () => void;
}

export default function OnboardingWizard({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(true);
  const [showBanner, setShowBanner] = useState(true);

  const { data: statusData } = useQuery<OnboardingStatus>({
    queryKey: ["onboarding-status"],
    queryFn: async () => {
      const res = await api.get<OnboardingStatus>("/me/onboarding/status");
      return res.data;
    },
  });

  const stepMutation = useMutation({
    mutationFn: async (step: number) => {
      await api.post("/me/onboarding/step", { step });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      await api.post("/me/onboarding/skip");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      setIsOpen(false);
      setShowBanner(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      await api.post("/me/onboarding/complete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      setIsOpen(false);
      setShowBanner(false);
    },
  });

  useEffect(() => {
    if (statusData?.status === "completed" || statusData?.status === "skipped") {
      setIsOpen(false);
      setShowBanner(false);
    }
    if (statusData?.status === "in_progress") {
      setCurrentStep((statusData.step ?? 1) - 1);
    }
  }, [statusData]);

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      await stepMutation.mutateAsync(next + 1);
    }
  };

  const handleComplete = async () => {
    await completeMutation.mutateAsync();
  };

  const handleSkip = async () => {
    await skipMutation.mutateAsync();
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  // 横幅（未完成用户）
  if (showBanner && statusData && (statusData.status === "in_progress" || statusData.status === "not_started") && !isOpen) {
    return (
      <div
        style={{
          background: "linear-gradient(135deg, #2563eb, #3b82f6)",
          borderRadius: 10,
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          color: "#fff",
        }}
      >
        <div>
          <span style={{ fontWeight: 600 }}>🚀 快速接入引导</span>
          <span style={{ marginLeft: 12, opacity: 0.9 }}>
            — 第 {statusData.step ?? 1}/{steps.length} 步
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setIsOpen(true)}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#fff",
              padding: "6px 16px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            继续引导
          </button>
          <button
            onClick={() => setShowBanner(false)}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 18, opacity: 0.7 }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  const s = steps[currentStep];
  if (!s) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: 560,
          maxWidth: "90vw",
          padding: 40,
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            fontSize: 24,
            cursor: "pointer",
            color: "#94a3b8",
          }}
        >
          ×
        </button>

        {/* 进度指示器 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= currentStep ? "#2563eb" : "#e2e8f0",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>

        {/* 标题 */}
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>{s.title}</h2>
        <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 14 }}>{s.subtitle}</p>

        {/* 内容 */}
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: 20, marginBottom: 28 }}>
          {s.desc.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < s.desc.length - 1 ? 12 : 0, color: "#334155", fontSize: 14, lineHeight: 1.6 }}>
              <span style={{ color: "#2563eb", flexShrink: 0 }}>•</span>
              <span>{d}</span>
            </div>
          ))}
          {/* Step 2 特殊内容：创建 Key 按钮 */}
          {currentStep === 1 && (
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <a
                href="/api-keys"
                style={{
                  display: "inline-block",
                  background: "#2563eb",
                  color: "#fff",
                  padding: "10px 24px",
                  borderRadius: 8,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                前往创建 API Key →
              </a>
            </div>
          )}
          {/* Step 4 特殊内容：预填数据 */}
          {currentStep === 3 && (
            <div
              style={{
                marginTop: 16,
                background: "#1e293b",
                borderRadius: 8,
                padding: 16,
                color: "#e2e8f0",
                fontSize: 13,
                fontFamily: "monospace",
              }}
            >
              <div style={{ marginBottom: 8, color: "#94a3b8" }}>预设测试数据：</div>
              <div>Model: deepseek-chat</div>
              <div>System: "You are a helpful assistant."</div>
              <div>User: "请用一句话介绍什么是 AI"</div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={handleSkip}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 13,
              textDecoration: "underline",
            }}
            disabled={skipMutation.isPending}
          >
            跳过引导
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            {currentStep < steps.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={stepMutation.isPending}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  padding: "10px 24px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                下一步 →
              </button>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleComplete}
                  disabled={completeMutation.isPending}
                  style={{
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    padding: "10px 24px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  ✅ 完成
                </button>
                <a
                  href="/docs"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    background: "#f1f5f9",
                    color: "#475569",
                    padding: "10px 20px",
                    borderRadius: 8,
                    textDecoration: "none",
                    fontSize: 13,
                  }}
                >
                  📖 查看完整文档
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
