// ============================================================
//  TermsOfService — 服务条款版本管理
// ============================================================

import LegalDocVersionManager from './LegalDocVersionManager'

export default function AdminTermsOfService() {
  return (
    <LegalDocVersionManager
      apiBase="/api/v1/admin/terms-of-service"
      title="服务条款管理"
      description="管理服务条款版本，发布新版本并追踪用户同意情况"
      pageKey="admin/settings/terms-of-service"
      docTypeName="服务条款"
    />
  )
}