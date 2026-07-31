// ============================================================
//  PrivacyPolicy — 隐私政策版本管理
// ============================================================

import LegalDocVersionManager from './LegalDocVersionManager'

export default function AdminPrivacyPolicy() {
  return (
    <LegalDocVersionManager
      apiBase="/api/v1/admin/privacy-policy"
      title="隐私政策管理"
      description="管理隐私政策版本，发布新版本并追踪用户同意情况"
      pageKey="admin/settings/privacy-policy"
      docTypeName="隐私政策"
    />
  )
}