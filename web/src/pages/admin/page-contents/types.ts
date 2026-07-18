export interface PageContent {
  id: number
  slug: string
  title_zh: string
  title_en: string | null
  content_markdown_zh: string | null
  content_markdown_en: string | null
  status: boolean
  updated_at: string
  created_at: string
  updated_by: string | null
}

export interface PageContentForm {
  slug: string
  titleZh: string
  titleEn: string
  contentMarkdownZh: string
  contentMarkdownEn: string
  status: boolean
}

export function emptyForm(): PageContentForm {
  return {
    slug: '',
    titleZh: '',
    titleEn: '',
    contentMarkdownZh: '',
    contentMarkdownEn: '',
    status: true,
  }
}
