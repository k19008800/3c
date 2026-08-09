import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

/**
 * 实名认证 — 对齐原型 portal-verification.html
 * 状态：未认证 / 审核中 / 已认证
 * 类型：个人认证 / 企业认证
 * 表单：个人信息 + 证件上传 / 企业信息 + 营业执照 + 授权委托书
 */

type AuthType = "personal" | "enterprise";
type VerifyStatus = "unverified" | "review" | "verified";

const card: React.CSSProperties = {
  background: "var(--color-panel)", borderRadius: 12, padding: 24,
  marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--color-border)",
  background: "var(--color-panel)", color: "var(--color-text)", fontSize: 13,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const label: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500, color: "var(--color-text)", marginBottom: 6,
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 24px", borderRadius: 8, border: "none", background: "var(--color-primary)",
  color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
};
const btnSecondary: React.CSSProperties = {
  ...btnPrimary, background: "var(--color-panel)", color: "var(--color-text)",
  border: "1px solid var(--color-border)",
};

export default function RealNamePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [authType, setAuthType] = useState<AuthType>("personal");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("unverified");
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  // Personal form
  const [pName, setPName] = useState("");
  const [pIdNum, setPIdNum] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pFront, setPFront] = useState<string | null>(null);
  const [pBack, setPBack] = useState<string | null>(null);

  // Enterprise form
  const [eName, setEName] = useState("");
  const [eCode, setECode] = useState("");
  const [eLegal, setELegal] = useState("");
  const [eLegalId, setELegalId] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eLicense, setELicense] = useState<string | null>(null);
  const [eAuth, setEAuth] = useState<string | null>(null);

  // Form errors
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // Progress state
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("资料提交中...");

  // Status query
  const statusQ = useQuery({
    queryKey: ["me-real-name"],
    queryFn: async () => (await api.get<{ data: any }>("/me/real-name")).data.data,
  });

  const st = statusQ.data;
  // When data loads, set status
  if (st && st.status && verifyStatus === "unverified") {
    if (st.status === "pending_review") {
      // Already in review from backend - but we manage locally for demo
    } else if (st.status === "approved") {
      // Already verified
    }
  }

  const submitMut = useMutation({
    mutationFn: async () => {
      const body: any = { type: authType };
      if (authType === "personal") {
        body.real_name = pName;
        body.id_number = pIdNum;
        body.phone = pPhone;
      } else {
        body.real_name = eName;
        body.id_number = eCode;
        body.legal_person = eLegal;
        body.legal_id = eLegalId;
        body.phone = ePhone;
      }
      return (await api.post("/me/real-name", body)).data;
    },
    onSuccess: () => {
      toast.success("认证资料已提交");
      qc.invalidateQueries({ queryKey: ["me-real-name"] });
      setVerifyStatus("review");
      startProgress();
    },
    onError: (err) => toast.error(extractError(err)),
  });

  /* ========== Validation ========== */
  const validatePhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone);
  const validateID = (id: string) => /^\d{17}[\dXx]$/.test(id);
  const validateCode = (code: string) => /^[0-9A-Z]{18}$/.test(code);

  const submitPersonal = () => {
    const errs: Record<string, boolean> = {};
    if (!pName) errs["p-name"] = true;
    if (!validateID(pIdNum)) errs["p-idnum"] = true;
    if (!validatePhone(pPhone)) errs["p-phone"] = true;
    if (!pFront) errs["p-front"] = true;
    if (!pBack) errs["p-back"] = true;
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("请完善所有必填信息");
      return;
    }
    submitMut.mutate();
  };

  const submitEnterprise = () => {
    const errs: Record<string, boolean> = {};
    if (!eName) errs["e-name"] = true;
    if (!validateCode(eCode)) errs["e-code"] = true;
    if (!eLegal) errs["e-legal"] = true;
    if (!validateID(eLegalId)) errs["e-legal-id"] = true;
    if (!validatePhone(ePhone)) errs["e-phone"] = true;
    if (!eLicense) errs["e-license"] = true;
    if (!eAuth) errs["e-auth"] = true;
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("请完善所有必填信息");
      return;
    }
    submitMut.mutate();
  };

  const startProgress = () => {
    setProgress(0);
    setProgressText("资料提交中...");
    // Simulate progress animation
    let w = 0;
    const timer = setInterval(() => {
      w += 2;
      if (w >= 100) {
        w = 100;
        setProgressText("审核完成！");
        clearInterval(timer);
      } else if (w < 30) setProgressText("资料提交中...");
      else if (w < 60) setProgressText("人工审核中，请耐心等待...");
      else setProgressText("审核即将完成...");
      setProgress(w);
    }, 80);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string | null) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const getStatusBadge = () => {
    const currentSt = verifyStatus;
    switch (currentSt) {
      case "verified": return <StatusBadge status="success">已认证</StatusBadge>;
      case "review": return <StatusBadge status="warning">审核中</StatusBadge>;
      default: return <StatusBadge status="default">未认证</StatusBadge>;
    }
  };

  /* ========== Render ========== */
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          实名认证
          <HelpIcon text="完成实名认证后可使用平台的全部功能，包括 API 调用、模型订阅等" level="page" />
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6 }}>
          完成实名认证后可使用平台的全部功能，包括 API 调用、模型订阅等
        </div>
      </div>

      {/* ===== Status: Unverified ===== */}
      {verifyStatus === "unverified" && (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 18px", borderRadius: 8, background: "#fff3e0", border: "1px solid #ffe0b2", marginBottom: 20 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, color: "#e65100", marginBottom: 4 }}>您尚未完成实名认证</div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                未认证账户每日 API 调用限额 100 次，且无法使用企业级功能。请完成认证以解锁完整服务。
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>选择认证类型</div>
            <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
              <div
                onClick={() => setAuthType("personal")}
                style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 16, padding: 20,
                  border: `2px solid ${authType === "personal" ? "var(--color-primary)" : "var(--color-border)"}`,
                  borderRadius: 12, background: authType === "personal" ? "var(--color-primary-light)" : "var(--color-panel)",
                  cursor: "pointer", transition: ".2s",
                }}
              >
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${authType === "personal" ? "var(--color-primary)" : "var(--color-border)"}`, position: "relative" }}>
                  {authType === "personal" && <div style={{ position: "absolute", top: 3, left: 3, width: 10, height: 10, borderRadius: "50%", background: "var(--color-primary)" }} />}
                </div>
                <span style={{ fontSize: 28 }}>👤</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>个人认证</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>适用于个人开发者，需身份证信息</div>
                </div>
              </div>
              <div
                onClick={() => setAuthType("enterprise")}
                style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 16, padding: 20,
                  border: `2px solid ${authType === "enterprise" ? "var(--color-primary)" : "var(--color-border)"}`,
                  borderRadius: 12, background: authType === "enterprise" ? "var(--color-primary-light)" : "var(--color-panel)",
                  cursor: "pointer", transition: ".2s",
                }}
              >
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${authType === "enterprise" ? "var(--color-primary)" : "var(--color-border)"}`, position: "relative" }}>
                  {authType === "enterprise" && <div style={{ position: "absolute", top: 3, left: 3, width: 10, height: 10, borderRadius: "50%", background: "var(--color-primary)" }} />}
                </div>
                <span style={{ fontSize: 28 }}>🏢</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>企业认证</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>适用于企业用户，需营业执照及法人信息</div>
                </div>
              </div>
            </div>

            {/* Personal Form */}
            {authType === "personal" && (
              <div>
                <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>姓名<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="请输入与身份证一致的真实姓名" level="button" />
                    </div>
                    <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="请输入真实姓名" maxLength={20} style={{ ...inp, borderColor: errors["p-name"] ? "var(--color-danger-text)" : "var(--color-border)" }} />
                    {errors["p-name"] && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>请输入姓名</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={label}>身份证号<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="请输入18位第二代身份证号码" level="button" />
                    </div>
                    <input value={pIdNum} onChange={(e) => setPIdNum(e.target.value)} placeholder="请输入身份证号码" maxLength={18} style={{ ...inp, borderColor: errors["p-idnum"] ? "var(--color-danger-text)" : "var(--color-border)" }} />
                    {errors["p-idnum"] && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>请输入正确的身份证号码</div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>手机号<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="请输入本人手机号，用于验证码确认" level="button" />
                    </div>
                    <input value={pPhone} onChange={(e) => setPPhone(e.target.value)} placeholder="请输入手机号码" maxLength={11} style={{ ...inp, borderColor: errors["p-phone"] ? "var(--color-danger-text)" : "var(--color-border)" }} />
                    {errors["p-phone"] && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>请输入正确的手机号</div>}
                  </div>
                </div>
                {/* ID Upload */}
                <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>身份证正面（人像面）<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="请上传身份证人像面照片，支持 JPG/PNG，大小不超过5MB" level="button" />
                    </div>
                    <UploadArea image={pFront} onUpload={(e) => handleFileUpload(e, setPFront)} onRemove={() => setPFront(null)} icon="📷" text="点击上传身份证人像面" hint="支持 JPG / PNG / JPEG，大小不超过 5MB" error={errors["p-front"]} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={label}>身份证反面（国徽面）<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="请上传身份证国徽面照片，支持 JPG/PNG，大小不超过5MB" level="button" />
                    </div>
                    <UploadArea image={pBack} onUpload={(e) => handleFileUpload(e, setPBack)} onRemove={() => setPBack(null)} icon="📷" text="点击上传身份证国徽面" hint="支持 JPG / PNG / JPEG，大小不超过 5MB" error={errors["p-back"]} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={submitPersonal} style={btnPrimary}>提交认证</button>
                  <button onClick={() => { setPName(""); setPIdNum(""); setPPhone(""); setPFront(null); setPBack(null); setErrors({}); }} style={btnSecondary}>重置</button>
                </div>
              </div>
            )}

            {/* Enterprise Form */}
            {authType === "enterprise" && (
              <div>
                <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>企业全称<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="请输入营业执照上的企业全称" level="button" />
                    </div>
                    <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="请输入企业全称" maxLength={50} style={{ ...inp, borderColor: errors["e-name"] ? "var(--color-danger-text)" : "var(--color-border)" }} />
                    {errors["e-name"] && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>请输入企业全称</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={label}>统一社会信用代码<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="18位统一社会信用代码，见营业执照" level="button" />
                    </div>
                    <input value={eCode} onChange={(e) => setECode(e.target.value)} placeholder="请输入统一社会信用代码" maxLength={18} style={{ ...inp, borderColor: errors["e-code"] ? "var(--color-danger-text)" : "var(--color-border)" }} />
                    {errors["e-code"] && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>请输入正确的统一社会信用代码</div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>法人姓名<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="请输入法定代表人姓名" level="button" />
                    </div>
                    <input value={eLegal} onChange={(e) => setELegal(e.target.value)} placeholder="请输入法人姓名" maxLength={20} style={{ ...inp, borderColor: errors["e-legal"] ? "var(--color-danger-text)" : "var(--color-border)" }} />
                    {errors["e-legal"] && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>请输入法人姓名</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={label}>法人身份证号<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="法人身份证号码，18位" level="button" />
                    </div>
                    <input value={eLegalId} onChange={(e) => setELegalId(e.target.value)} placeholder="请输入法人身份证号" maxLength={18} style={{ ...inp, borderColor: errors["e-legal-id"] ? "var(--color-danger-text)" : "var(--color-border)" }} />
                    {errors["e-legal-id"] && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>请输入正确的身份证号</div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>联系人手机号<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="企业联系人手机号，用于审核结果通知" level="button" />
                    </div>
                    <input value={ePhone} onChange={(e) => setEPhone(e.target.value)} placeholder="请输入联系人手机号" maxLength={11} style={{ ...inp, borderColor: errors["e-phone"] ? "var(--color-danger-text)" : "var(--color-border)" }} />
                    {errors["e-phone"] && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>请输入正确的手机号</div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>营业执照副本<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="请上传清晰可见的营业执照副本扫描件" level="button" />
                    </div>
                    <UploadArea image={eLicense} onUpload={(e) => handleFileUpload(e, setELicense)} onRemove={() => setELicense(null)} icon="📄" text="点击上传营业执照副本" hint="支持 JPG / PNG / PDF，大小不超过 10MB" error={errors["e-license"]} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={label}>授权委托书<span style={{ color: "var(--color-danger-text)" }}>*</span>
                      <HelpIcon text="经办人非法人本人时需上传授权委托书" level="button" />
                    </div>
                    <UploadArea image={eAuth} onUpload={(e) => handleFileUpload(e, setEAuth)} onRemove={() => setEAuth(null)} icon="📝" text="点击上传授权委托书" hint="支持 JPG / PNG / PDF，大小不超过 10MB" error={errors["e-auth"]} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={submitEnterprise} style={btnPrimary}>提交认证</button>
                  <button onClick={() => { setEName(""); setECode(""); setELegal(""); setELegalId(""); setEPhone(""); setELicense(null); setEAuth(null); setErrors({}); }} style={btnSecondary}>重置</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== Status: Under Review ===== */}
      {verifyStatus === "review" && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 18px", borderRadius: 8, background: "var(--color-primary-light)", border: "1px solid rgba(79,110,247,0.2)", marginBottom: 24 }}>
            <span style={{ fontSize: 20 }}>⏳</span>
            <div>
              <div style={{ fontWeight: 600, color: "var(--color-primary)", marginBottom: 4 }}>认证资料已提交，审核中</div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                我们正在审核您的认证资料，通常需要 1-3 个工作日。审核结果将通过短信和邮件通知您。
              </div>
            </div>
          </div>

          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>审核进度</div>
          <div style={{ margin: "24px 0" }}>
            <div style={{ height: 8, background: "var(--color-divider-light)", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, var(--color-primary), var(--color-primary-hover))", borderRadius: 4, transition: "width .3s" }} />
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center" }}>{progressText}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              {["提交资料", "人工审核", "审核完成"].map((step, i) => {
                const done = progress >= 100 ? true : progress >= (i + 1) * 33;
                const active = !done && progress >= i * 33;
                return (
                  <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 12, color: done || active ? "var(--color-text)" : "var(--color-text-secondary)" }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                      border: `2px solid ${done || active ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: done || active ? "var(--color-primary-light)" : "var(--color-panel)",
                      color: done || active ? "var(--color-primary)" : "var(--color-text-secondary)",
                    }}>
                      {done ? "✓" : active ? "⏳" : "○"}
                    </div>
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: "var(--color-bg)", padding: 20, borderRadius: 8, marginTop: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>提交信息概览</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
              <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>认证类型</div><div style={{ fontSize: 14, fontWeight: 500 }}>{authType === "personal" ? "个人认证" : "企业认证"}</div></div>
              <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>提交时间</div><div style={{ fontSize: 14, fontWeight: 500 }}>{new Date().toLocaleString("zh-CN")}</div></div>
              <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>申请人</div><div style={{ fontSize: 14, fontWeight: 500 }}>{authType === "personal" ? pName : eLegal}</div></div>
              <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>审核状态</div><div><span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 12, background: "var(--color-primary-light)", color: "var(--color-primary)" }}>审核中</span></div></div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Status: Verified ===== */}
      {verifyStatus === "verified" && (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 18px", borderRadius: 8, background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", marginBottom: 20 }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <div>
              <div style={{ fontWeight: 600, color: "var(--color-success-text)", marginBottom: 4 }}>实名认证已完成</div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                您的账户已完成实名认证，可使用平台全部功能。
              </div>
            </div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>认证信息</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
              <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>认证类型</div><div style={{ fontSize: 14, fontWeight: 500 }}>{authType === "personal" ? "个人认证" : "企业认证"}</div></div>
              <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>认证状态</div><div><span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 12, background: "var(--color-success-bg)", color: "var(--color-success-text)" }}>已认证</span></div></div>
              <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>认证时间</div><div style={{ fontSize: 14, fontWeight: 500 }}>{new Date().toLocaleString("zh-CN")}</div></div>
              <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>认证人</div><div style={{ fontSize: 14, fontWeight: 500 }}>{authType === "personal" ? pName : eLegal}</div></div>
              <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>证件号码</div><div style={{ fontSize: 14, fontWeight: 500 }}>{authType === "personal" ? (pIdNum.substring(0, 3) + "***********" + pIdNum.substring(14)) : (eLegalId.substring(0, 3) + "***********" + eLegalId.substring(14))}</div></div>
              {authType === "enterprise" && <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>企业名称</div><div style={{ fontSize: 14, fontWeight: 500 }}>{eName}</div></div>}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowWithdrawModal(true)} style={btnSecondary}>撤销认证</button>
            </div>
          </div>
        </>
      )}

      {/* Demo Controls */}
      <div style={{ background: "var(--color-primary-light)", padding: 16, borderRadius: 12, marginTop: 12 }}>
        <div style={{ fontSize: 13, color: "var(--color-primary)", marginBottom: 8 }}>🔄 演示控制 — 切换认证状态</div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["unverified", "review", "verified"] as VerifyStatus[]).map((s) => (
            <button key={s} onClick={() => setVerifyStatus(s)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, border: "1px solid var(--color-border)", background: "var(--color-panel)", cursor: "pointer", fontFamily: "inherit" }}>
              {s === "unverified" ? "未认证" : s === "review" ? "审核中" : "已认证"}
            </button>
          ))}
        </div>
      </div>

      {/* Help Modal */}
      <Modal open={showHelpModal} onClose={() => setShowHelpModal(false)} title="实名认证帮助">
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <p><strong>什么是实名认证？</strong></p>
          <p>实名认证是 3Cloud 平台为确保账户安全、合规运营而设立的身份验证机制。完成认证后可解锁全部平台功能。</p>
          <p><strong>认证类型：</strong></p>
          <p>• 个人认证 — 适用于个人开发者，需提供身份证信息</p>
          <p>• 企业认证 — 适用于企业用户，需提供营业执照及法人信息</p>
          <p><strong>审核时间：</strong></p>
          <p>• 个人认证：1-3 个工作日</p>
          <p>• 企业认证：3-5 个工作日</p>
          <p><strong>注意事项：</strong></p>
          <p>请确保上传的照片清晰可见，信息真实有效。虚假信息将导致认证被拒。</p>
        </div>
      </Modal>

      {/* Withdraw Modal */}
      <Modal open={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} title="撤销认证">
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <p>撤销认证后，您将失去已认证账户的权限，包括：</p>
          <p>• API 调用额度恢复为未认证限额</p>
          <p>• 无法使用企业级功能</p>
          <p>• 历史调用记录不受影响</p>
          <p style={{ color: "var(--color-danger-text)", marginTop: 12 }}>此操作不可逆，确认要继续吗？</p>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={() => setShowWithdrawModal(false)} style={btnSecondary}>取消</button>
          <button onClick={() => { setShowWithdrawModal(false); setVerifyStatus("unverified"); }} style={{ ...btnPrimary, background: "var(--color-danger-text)" }}>确认撤销</button>
        </div>
      </Modal>
    </div>
  );
}

/* ==================== UploadArea Component ==================== */
function UploadArea({
  image, onUpload, onRemove, icon, text, hint, error,
}: {
  image: string | null;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  icon: string;
  text: string;
  hint: string;
  error?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      {image ? (
        <div style={{
          border: `2px solid ${error ? "var(--color-danger-text)" : "var(--color-border)"}`,
          borderRadius: 8, padding: 8, position: "relative", cursor: "pointer",
        }} onClick={() => inputRef.current?.click()}>
          <img src={image} alt="preview" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 6, display: "block", margin: "0 auto" }} />
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${error ? "var(--color-danger-text)" : "var(--color-border)"}`,
            borderRadius: 8, padding: 24, textAlign: "center", cursor: "pointer",
            background: "var(--color-bg)", transition: ".2s",
          }}
        >
          <div style={{ fontSize: 28, color: "#bbb", marginBottom: 8 }}>{icon}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{text}</div>
          <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>{hint}</div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onUpload} />
      {error && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>请上传文件</div>}
    </div>
  );
}
