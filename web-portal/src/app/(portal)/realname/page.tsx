/**
 * RealNamePage — 对齐 portal-verification.html
 *
 * Features:
 * - Personal/Enterprise certification tab switching
 * - Personal form: name, ID number, phone, ID card front/back
 * - Enterprise form: company name, credit code, legal person, business license
 * - Three states: unverified, under review, verified
 * - StatusBadge for review status
 * - Rejection reason display + re-submit
 * - Progress bar animation (review state)
 * - Help modal
 */
"use client";

import { useState, useCallback, useRef } from "react";
import { HelpIcon, StatusBadge } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

/* ==================== Types ==================== */
type AuthType = "personal" | "enterprise";
type AuthStatus = "unverified" | "review" | "verified";

interface ReviewInfo {
  type: string;
  time: string;
  name: string;
  idNumber: string;
  company?: string;
}

/* ==================== Styles ==================== */
const s = {
  card: {
    background: "var(--color-panel)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-xl)",
    padding: 24,
    marginBottom: 20,
    boxShadow: "var(--shadow-panel)",
  } as const,
  cardTitle: {
    fontSize: "var(--font-size-lg)",
    fontWeight: 600,
    color: "var(--color-text)",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as const,
  // Alert
  alert: (type: "warning" | "info" | "success" | "danger") => {
    const bg = {
      warning: "var(--color-warning-bg)",
      info: "var(--color-primary-light)",
      success: "var(--color-success-bg)",
      danger: "var(--color-danger-bg)",
    };
    const border = {
      warning: "var(--color-warning-border)",
      info: "rgba(79,110,247,0.2)",
      success: "var(--color-success-border)",
      danger: "var(--color-danger-border)",
    };
    return {
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      padding: "16px 18px",
      borderRadius: "var(--radius-lg)",
      marginBottom: 24,
      background: bg[type],
      border: `1px solid ${border[type]}`,
    } as const;
  },
  alertTitle: (type: string) => ({
    fontWeight: 600,
    marginBottom: 4,
    color: type === "warning" ? "var(--color-warning-text)" :
           type === "info" ? "var(--color-primary)" :
           type === "success" ? "var(--color-success-text)" : "var(--color-danger-text)",
    fontSize: "var(--font-size-base)",
  } as const),
  alertText: {
    fontSize: "var(--font-size-md)",
    color: "var(--color-text-secondary)",
  } as const,
  // Auth type cards
  authTypeCards: {
    display: "flex",
    gap: 16,
  } as const,
  authTypeCard: (selected: boolean) => ({
    flex: 1,
    border: `2px solid ${selected ? "var(--color-primary)" : "var(--color-border)"}`,
    borderRadius: "var(--radius-xl)",
    padding: 20,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    background: selected ? "var(--color-primary-light)" : "var(--color-panel)",
    display: "flex",
    alignItems: "center",
    gap: 16,
  } as const),
  authTypeRadio: (selected: boolean) => ({
    width: 20,
    height: 20,
    border: `2px solid ${selected ? "var(--color-primary)" : "var(--color-border)"}`,
    borderRadius: "50%",
    flexShrink: 0,
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const),
  // Forms
  formRow: {
    display: "flex",
    gap: 20,
    marginBottom: 18,
    flexWrap: "wrap" as const,
  } as const,
  formGroup: {
    flex: 1,
    minWidth: 200,
  } as const,
  formLabel: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: "var(--font-size-md)",
    fontWeight: 500,
    color: "var(--color-text)",
    marginBottom: 6,
  } as const,
  required: {
    color: "#ff5a5a",
    marginLeft: 2,
  } as const,
  formInput: {
    width: "100%",
    padding: "10px 14px",
    background: "var(--color-panel)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    color: "var(--color-text)",
    fontSize: "var(--font-size-md)",
    outline: "none",
    transition: "border-color var(--transition-fast)",
  } as const,
  uploadArea: {
    border: "2px dashed var(--color-border)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
    textAlign: "center",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    background: "#fafafa",
    minHeight: 140,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  } as const,
  uploadIcon: {
    fontSize: 28,
    color: "#bbb",
    marginBottom: 8,
  } as const,
  uploadText: {
    fontSize: "var(--font-size-md)",
    color: "var(--color-text-secondary)",
  } as const,
  uploadHint: {
    fontSize: "var(--font-size-xs)",
    color: "#bbb",
    marginTop: 4,
  } as const,
  formError: {
    fontSize: "var(--font-size-sm)",
    color: "#ff5a5a",
    marginTop: 4,
  } as const,
  actionRow: {
    display: "flex",
    gap: 12,
    marginTop: 24,
  } as const,
  btn: (variant: "primary" | "secondary" | "danger") => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 24px",
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--font-size-base)",
    fontWeight: 500,
    cursor: "pointer",
    border: variant === "primary" ? "none" : "1px solid var(--color-border)",
    background: variant === "primary" ? "var(--color-primary)" :
               variant === "danger" ? "var(--color-danger-text)" : "var(--color-panel)",
    color: variant === "secondary" ? "var(--color-text)" : "#fff",
    transition: "all var(--transition-fast)",
  } as const),
  // Info grid
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px 24px",
  } as const,
  infoItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } as const,
  infoLabel: {
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-secondary)",
  } as const,
  infoValue: {
    fontSize: "var(--font-size-base)",
    color: "var(--color-text)",
    fontWeight: 500,
  } as const,
  // Progress
  progressContainer: {
    margin: "24px 0",
  } as const,
  progressBar: {
    height: 8,
    background: "var(--color-disabled-bg)",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  } as const,
  progressFill: (pct: number) => ({
    height: "100%",
    background: "linear-gradient(90deg, var(--color-primary), var(--color-primary-hover))",
    borderRadius: 4,
    width: `${pct}%`,
    transition: "width 0.3s ease",
  } as const),
  progressSteps: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 20,
  } as const,
  progressStep: (done: boolean, active: boolean) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    fontSize: "var(--font-size-sm)",
    color: done || active ? "var(--color-text)" : "var(--color-text-secondary)",
  } as const),
  stepIcon: (done: boolean, active: boolean) => ({
    width: 32,
    height: 32,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    border: `2px solid ${done || active ? "var(--color-primary)" : "var(--color-border)"}`,
    background: done || active ? "var(--color-primary-light)" : "var(--color-panel)",
    color: done || active ? "var(--color-primary)" : "var(--color-text-secondary)",
  } as const),
  // Modal
  modalOverlay: (show: boolean) => ({
    position: "fixed",
    inset: 0,
    background: "var(--color-modal-overlay)",
    zIndex: 1000,
    display: show ? "flex" : "none",
    alignItems: "center",
    justifyContent: "center",
  } as const),
  modal: {
    background: "var(--color-panel)",
    borderRadius: "var(--radius-2xl)",
    padding: 24,
    maxWidth: 480,
    width: "90%",
    boxShadow: "var(--shadow-modal)",
  } as const,
};

/* ==================== Component ==================== */
export default function RealNamePage() {
  const [authType, setAuthType] = useState<AuthType>("personal");
  const [status, setStatus] = useState<AuthStatus>("unverified");
  const [reviewInfo, setReviewInfo] = useState<ReviewInfo | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressText, setProgressText] = useState("资料提交中...");

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

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* ==================== Validation ==================== */
  const validatePhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone);
  const validateID = (id: string) => /^\d{17}[\dXx]$/.test(id);
  const validateCreditCode = (code: string) => /^[0-9A-Z]{18}$/.test(code);

  /* ==================== Submit ==================== */
  const handleSubmit = useCallback(async () => {
    const newErrors: Record<string, string> = {};

    if (authType === "personal") {
      if (!pName.trim()) newErrors.pName = "请输入姓名";
      if (!validateID(pIdNum)) newErrors.pIdNum = "请输入正确的身份证号码";
      if (!validatePhone(pPhone)) newErrors.pPhone = "请输入正确的手机号";
      if (!pFront) newErrors.pFront = "请上传身份证正面照片";
      if (!pBack) newErrors.pBack = "请上传身份证反面照片";
    } else {
      if (!eName.trim()) newErrors.eName = "请输入企业全称";
      if (!validateCreditCode(eCode)) newErrors.eCode = "请输入正确的统一社会信用代码";
      if (!eLegal.trim()) newErrors.eLegal = "请输入法人姓名";
      if (!validateID(eLegalId)) newErrors.eLegalId = "请输入正确的身份证号";
      if (!validatePhone(ePhone)) newErrors.ePhone = "请输入正确的手机号";
      if (!eLicense) newErrors.eLicense = "请上传营业执照副本";
      if (!eAuth) newErrors.eAuth = "请上传授权委托书";
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const info: ReviewInfo = {
      type: authType === "personal" ? "个人认证" : "企业认证",
      time: new Date().toLocaleString("zh-CN"),
      name: authType === "personal" ? pName : eName,
      idNumber: authType === "personal"
        ? pIdNum.substring(0, 3) + "***********" + pIdNum.substring(14)
        : eLegalId.substring(0, 3) + "***********" + eLegalId.substring(14),
      company: authType === "enterprise" ? eName : undefined,
    };

    setReviewInfo(info);
    setStatus("review");
    animateProgress();
  }, [authType, pName, pIdNum, pPhone, pFront, pBack,
      eName, eCode, eLegal, eLegalId, ePhone, eLicense, eAuth]);

  const animateProgress = () => {
    setProgressPct(0);
    setProgressText("资料提交中...");
    let w = 0;
    const timer = setInterval(() => {
      w += 2;
      if (w > 100) { clearInterval(timer); return; }
      setProgressPct(w);
      if (w < 30) setProgressText("资料提交中...");
      else if (w < 60) setProgressText("人工审核中，请耐心等待...");
      else if (w < 100) setProgressText("审核即将完成...");
      else { setProgressText("审核完成！"); clearInterval(timer); }
    }, 80);
  };

  /* ==================== File Upload ==================== */
  const handleUpload = useCallback((key: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const setter: Record<string, (v: string | null) => void> = {
        pFront: setPFront, pBack: setPBack,
        eLicense: setELicense, eAuth: setEAuth,
      };
      if (setter[key]) setter[key](e.target?.result as string);
      setErrors((prev) => ({ ...prev, [key]: "" }));
    };
    reader.readAsDataURL(file);
  }, []);

  const removeUpload = (key: string) => {
    const setter: Record<string, (v: string | null) => void> = {
      pFront: setPFront, pBack: setPBack,
      eLicense: setELicense, eAuth: setEAuth,
    };
    if (setter[key]) setter[key](null);
  };

  const resetForm = (type: AuthType) => {
    setErrors({});
    if (type === "personal") {
      setPName(""); setPIdNum(""); setPPhone(""); setPFront(null); setPBack(null);
    } else {
      setEName(""); setECode(""); setELegal(""); setELegalId("");
      setEPhone(""); setELicense(null); setEAuth(null);
    }
  };

  /* ==================== Render Helpers ==================== */
  const renderUploadArea = (key: string, icon: string, text: string, hint: string, preview: string | null) => (
    <div
      style={{
        ...s.uploadArea,
        ...(preview ? { padding: 8, borderStyle: "solid", borderColor: "var(--color-primary)" } : {}),
      }}
      onClick={() => {
        if (!preview) fileInputRefs.current[key]?.click();
      }}
    >
      {preview ? (
        <div style={{ position: "relative", width: "100%" }}>
          <img src={preview} alt="预览" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 6, display: "block", margin: "0 auto" }} />
          <button
            style={{
              position: "absolute", top: 4, right: 4,
              width: 24, height: 24, background: "rgba(0,0,0,0.6)",
              borderRadius: "50%", border: "none", color: "#fff",
              cursor: "pointer", fontSize: 14, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
            onClick={(e) => { e.stopPropagation(); removeUpload(key); }}
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <div style={s.uploadIcon}>{icon}</div>
          <div style={s.uploadText}>{text}</div>
          <div style={s.uploadHint}>{hint}</div>
        </>
      )}
      <input
        ref={(el) => { fileInputRefs.current[key] = el; }}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(key, file);
        }}
      />
    </div>
  );

  const renderError = (key: string) => {
    if (!errors[key]) return null;
    return <div style={s.formError}>{errors[key]}</div>;
  };

  const renderFieldError = (inputKey: string, errorKey: string) => {
    return errors[errorKey]
      ? { borderColor: "#ff5a5a" }
      : {};
  };

  /* ==================== Status Views ==================== */
  const renderUnverified = () => (
    <>
      <div style={s.alert("warning")}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={s.alertTitle("warning")}>您尚未完成实名认证</div>
          <div style={s.alertText}>未认证账户每日 API 调用限额 100 次，且无法使用企业级功能。请完成认证以解锁完整服务。</div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>选择认证类型</div>
        <div style={s.authTypeCards}>
          {(["personal", "enterprise"] as AuthType[]).map((t) => {
            const selected = authType === t;
            return (
              <div key={t} style={s.authTypeCard(selected)} onClick={() => setAuthType(t)}>
                <div style={s.authTypeRadio(selected)}>
                  {selected && <div style={{ width: 10, height: 10, background: "var(--color-primary)", borderRadius: "50%" }} />}
                </div>
                <div style={{ fontSize: 28 }}>{t === "personal" ? "👤" : "🏢"}</div>
                <div>
                  <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>
                    {t === "personal" ? "个人认证" : "企业认证"}
                  </div>
                  <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                    {t === "personal" ? "适用于个人开发者，需身份证信息" : "适用于企业用户，需营业执照及法人信息"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Personal Form */}
        {authType === "personal" && (
          <>
            <div style={{ marginTop: 24 }}>
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    姓名<span style={s.required}>*</span>
                    <HelpIcon text="请输入与身份证一致的真实姓名" />
                  </label>
                  <input style={{ ...s.formInput, ...renderFieldError("pName", "pName") }} value={pName}
                    onChange={(e) => { setPName(e.target.value); setErrors(p => ({ ...p, pName: "" })); }}
                    placeholder="请输入真实姓名" maxLength={20} />
                  {renderError("pName")}
                </div>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    身份证号<span style={s.required}>*</span>
                    <HelpIcon text="请输入18位第二代身份证号码" />
                  </label>
                  <input style={{ ...s.formInput, ...renderFieldError("pIdNum", "pIdNum") }} value={pIdNum}
                    onChange={(e) => { setPIdNum(e.target.value); setErrors(p => ({ ...p, pIdNum: "" })); }}
                    placeholder="请输入身份证号码" maxLength={18} />
                  {renderError("pIdNum")}
                </div>
              </div>
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    手机号<span style={s.required}>*</span>
                    <HelpIcon text="请输入本人手机号，用于验证码确认" />
                  </label>
                  <input style={{ ...s.formInput, ...renderFieldError("pPhone", "pPhone") }} value={pPhone}
                    onChange={(e) => { setPPhone(e.target.value); setErrors(p => ({ ...p, pPhone: "" })); }}
                    placeholder="请输入手机号码" maxLength={11} />
                  {renderError("pPhone")}
                </div>
                <div style={{ ...s.formGroup, flex: 1 }} />
              </div>
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    身份证正面（人像面）<span style={s.required}>*</span>
                    <HelpIcon text="请上传身份证人像面照片，支持 JPG/PNG，大小不超过5MB" />
                  </label>
                  {renderUploadArea("pFront", "📷", "点击上传身份证人像面", "支持 JPG / PNG / JPEG，大小不超过 5MB", pFront)}
                  {renderError("pFront")}
                </div>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    身份证反面（国徽面）<span style={s.required}>*</span>
                    <HelpIcon text="请上传身份证国徽面照片，支持 JPG/PNG，大小不超过5MB" />
                  </label>
                  {renderUploadArea("pBack", "📷", "点击上传身份证国徽面", "支持 JPG / PNG / JPEG，大小不超过 5MB", pBack)}
                  {renderError("pBack")}
                </div>
              </div>
              <div style={s.actionRow}>
                <button style={s.btn("primary")} onClick={handleSubmit}>
                  提交认证 <HelpIcon text="提交后进入审核状态，通常1-3个工作日完成" />
                </button>
                <button style={s.btn("secondary")} onClick={() => resetForm("personal")}>重置</button>
              </div>
            </div>
          </>
        )}

        {/* Enterprise Form */}
        {authType === "enterprise" && (
          <>
            <div style={{ marginTop: 24 }}>
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    企业全称<span style={s.required}>*</span>
                    <HelpIcon text="请输入营业执照上的企业全称" />
                  </label>
                  <input style={{ ...s.formInput, ...renderFieldError("eName", "eName") }} value={eName}
                    onChange={(e) => { setEName(e.target.value); setErrors(p => ({ ...p, eName: "" })); }}
                    placeholder="请输入企业全称" maxLength={50} />
                  {renderError("eName")}
                </div>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    统一社会信用代码<span style={s.required}>*</span>
                    <HelpIcon text="18位统一社会信用代码，见营业执照" />
                  </label>
                  <input style={{ ...s.formInput, ...renderFieldError("eCode", "eCode") }} value={eCode}
                    onChange={(e) => { setECode(e.target.value); setErrors(p => ({ ...p, eCode: "" })); }}
                    placeholder="请输入统一社会信用代码" maxLength={18} />
                  {renderError("eCode")}
                </div>
              </div>
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    法人姓名<span style={s.required}>*</span>
                    <HelpIcon text="请输入法定代表人姓名" />
                  </label>
                  <input style={{ ...s.formInput, ...renderFieldError("eLegal", "eLegal") }} value={eLegal}
                    onChange={(e) => { setELegal(e.target.value); setErrors(p => ({ ...p, eLegal: "" })); }}
                    placeholder="请输入法人姓名" maxLength={20} />
                  {renderError("eLegal")}
                </div>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    法人身份证号<span style={s.required}>*</span>
                    <HelpIcon text="法人身份证号码，18位" />
                  </label>
                  <input style={{ ...s.formInput, ...renderFieldError("eLegalId", "eLegalId") }} value={eLegalId}
                    onChange={(e) => { setELegalId(e.target.value); setErrors(p => ({ ...p, eLegalId: "" })); }}
                    placeholder="请输入法人身份证号" maxLength={18} />
                  {renderError("eLegalId")}
                </div>
              </div>
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    联系人手机号<span style={s.required}>*</span>
                    <HelpIcon text="企业联系人手机号，用于审核结果通知" />
                  </label>
                  <input style={{ ...s.formInput, ...renderFieldError("ePhone", "ePhone") }} value={ePhone}
                    onChange={(e) => { setEPhone(e.target.value); setErrors(p => ({ ...p, ePhone: "" })); }}
                    placeholder="请输入联系人手机号" maxLength={11} />
                  {renderError("ePhone")}
                </div>
                <div style={{ ...s.formGroup, flex: 1 }} />
              </div>
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    营业执照副本<span style={s.required}>*</span>
                    <HelpIcon text="请上传清晰可见的营业执照副本扫描件" />
                  </label>
                  {renderUploadArea("eLicense", "📄", "点击上传营业执照副本", "支持 JPG / PNG / PDF，大小不超过 10MB", eLicense)}
                  {renderError("eLicense")}
                </div>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>
                    授权委托书<span style={s.required}>*</span>
                    <HelpIcon text="经办人非法人本人时需上传授权委托书" />
                  </label>
                  {renderUploadArea("eAuth", "📝", "点击上传授权委托书", "支持 JPG / PNG / PDF，大小不超过 10MB", eAuth)}
                  {renderError("eAuth")}
                </div>
              </div>
              <div style={s.actionRow}>
                <button style={s.btn("primary")} onClick={handleSubmit}>
                  提交认证 <HelpIcon text="提交后进入审核状态，通常3-5个工作日完成" />
                </button>
                <button style={s.btn("secondary")} onClick={() => resetForm("enterprise")}>重置</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );

  const renderReview = () => (
    <div style={s.card}>
      <div style={s.alert("info")}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>⏳</span>
        <div style={{ flex: 1 }}>
          <div style={s.alertTitle("info")}>认证资料已提交，审核中</div>
          <div style={s.alertText}>我们正在审核您的认证资料，通常需要 1-3 个工作日。审核结果将通过短信和邮件通知您。</div>
        </div>
      </div>

      <div style={s.cardTitle}>审核进度</div>
      <div style={s.progressContainer}>
        <div style={s.progressBar}>
          <div style={s.progressFill(progressPct)} />
        </div>
        <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", textAlign: "center" }}>
          {progressText}
        </div>
        <div style={s.progressSteps}>
          {[
            { label: "提交资料", done: true, active: false },
            { label: "人工审核", done: progressPct >= 60, active: progressPct < 60 },
            { label: "审核完成", done: progressPct >= 100, active: false },
          ].map((step, i) => (
            <div key={i} style={s.progressStep(step.done, step.active)}>
              <div style={s.stepIcon(step.done, step.active)}>
                {step.done ? "✓" : step.active ? "⏳" : "○"}
              </div>
              <span>{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      {reviewInfo && (
        <div style={{ ...s.card, background: "#fafafa", marginTop: 20 }}>
          <div style={s.cardTitle}>提交信息概览</div>
          <div style={s.infoGrid}>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>认证类型</span>
              <span style={s.infoValue}>{reviewInfo.type}</span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>提交时间</span>
              <span style={s.infoValue}>{reviewInfo.time}</span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>申请人</span>
              <span style={s.infoValue}>{reviewInfo.name}</span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>审核状态</span>
              <div><StatusBadge status="warning" variant="pill">审核中</StatusBadge></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderVerified = () => (
    <>
      <div style={s.alert("success")}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>✅</span>
        <div style={{ flex: 1 }}>
          <div style={s.alertTitle("success")}>实名认证已完成</div>
          <div style={s.alertText}>您的账户已完成实名认证，可使用平台全部功能。</div>
        </div>
      </div>
      <div style={s.card}>
        <div style={s.cardTitle}>认证信息</div>
        <div style={s.infoGrid}>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>认证类型</span>
            <span style={s.infoValue}>{reviewInfo?.type || "个人认证"}</span>
          </div>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>认证状态</span>
            <div><StatusBadge status="success" variant="pill">已认证</StatusBadge></div>
          </div>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>认证时间</span>
            <span style={s.infoValue}>{reviewInfo?.time || "2026-08-05 14:30"}</span>
          </div>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>认证人</span>
            <span style={s.infoValue}>{reviewInfo?.name || "张明"}</span>
          </div>
          {reviewInfo?.idNumber && (
            <div style={s.infoItem}>
              <span style={s.infoLabel}>证件号码</span>
              <span style={s.infoValue}>{reviewInfo.idNumber}</span>
            </div>
          )}
          {reviewInfo?.company && (
            <div style={s.infoItem}>
              <span style={s.infoLabel}>企业名称</span>
              <span style={s.infoValue}>{reviewInfo.company}</span>
            </div>
          )}
        </div>
        <div style={s.actionRow}>
          <button style={s.btn("secondary")} onClick={() => setWithdrawOpen(true)}>撤销认证</button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <PortalTopbar
        title="实名认证"
        helpHint="完成实名认证后可使用平台的全部功能，包括 API 调用、模型订阅等"
      />
      <div style={{ padding: "20px 0" }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "var(--font-size-2xl)", fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 8 }}>
            实名认证 <HelpIcon text="完成实名认证后可使用平台的全部功能，包括 API 调用、模型订阅等" level="page" />
          </h2>
          <p style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginTop: 6 }}>
            完成实名认证后可使用平台的全部功能，包括 API 调用、模型订阅等
          </p>
        </div>

        {status === "unverified" && renderUnverified()}
        {status === "review" && renderReview()}
        {status === "verified" && renderVerified()}

        {/* Demo Controls */}
        <div style={{ background: "var(--color-primary-light)", borderRadius: "var(--radius-xl)", padding: "16px 20px", border: "1px solid rgba(79,110,247,0.12)" }}>
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-primary)", marginBottom: 8, fontWeight: 500 }}>
            🔄 演示控制 — 切换认证状态
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ padding: "4px 12px", fontSize: "var(--font-size-sm)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-panel)", cursor: "pointer" }}
              onClick={() => setStatus("unverified")}>未认证</button>
            <button style={{ padding: "4px 12px", fontSize: "var(--font-size-sm)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-panel)", cursor: "pointer" }}
              onClick={() => setStatus("review")}>审核中</button>
            <button style={{ padding: "4px 12px", fontSize: "var(--font-size-sm)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-panel)", cursor: "pointer" }}
              onClick={() => setStatus("verified")}>已认证</button>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      <div style={s.modalOverlay(helpOpen) as any} onClick={() => setHelpOpen(false)}>
        <div style={s.modal as any} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
            <span>实名认证帮助</span>
            <button onClick={() => setHelpOpen(false)} style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ fontSize: "var(--font-size-md)", lineHeight: 1.8, color: "var(--color-text)" }}>
            <p><strong>什么是实名认证？</strong></p>
            <p>实名认证是 3Cloud 平台为确保账户安全、合规运营而设立的身份验证机制。</p>
            <p><strong>认证类型：</strong></p>
            <p>• 个人认证 — 适用于个人开发者，需提供身份证信息</p>
            <p>• 企业认证 — 适用于企业用户，需提供营业执照及法人信息</p>
            <p><strong>审核时间：</strong></p>
            <p>• 个人认证：1-3 个工作日</p>
            <p>• 企业认证：3-5 个工作日</p>
          </div>
          <div style={{ textAlign: "right", marginTop: 20 }}>
            <button style={s.btn("secondary")} onClick={() => setHelpOpen(false)}>关闭</button>
          </div>
        </div>
      </div>

      {/* Withdraw Modal */}
      <div style={s.modalOverlay(withdrawOpen) as any} onClick={() => setWithdrawOpen(false)}>
        <div style={s.modal as any} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
            <span>撤销认证</span>
            <button onClick={() => setWithdrawOpen(false)} style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ fontSize: "var(--font-size-md)", lineHeight: 1.8, color: "var(--color-text)", marginBottom: 16 }}>
            <p>撤销认证后，您将失去已认证账户的权限，包括：</p>
            <p>• API 调用额度恢复为未认证限额</p>
            <p>• 无法使用企业级功能</p>
            <p style={{ color: "var(--color-danger-text)", marginTop: 12 }}>此操作不可逆，确认要继续吗？</p>
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button style={s.btn("secondary")} onClick={() => setWithdrawOpen(false)}>取消</button>
            <button style={s.btn("danger")}
              onClick={() => { setWithdrawOpen(false); setStatus("unverified"); }}>
              确认撤销
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
