// ============================================================
//  3cloud (3C) — 富文本编辑器组件
//  基于 TipTap，支持 Markdown 快捷输入、图片上传、实时预览
// ============================================================

import React, { useCallback, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Undo,
  Redo,
  Eye,
  Code2,
} from "lucide-react";
import { clsx } from "clsx";

// ── Props ──

export interface RichTextEditorProps {
  /** 初始内容（HTML） */
  content?: string;
  /** 内容变化回调 */
  onChange?: (html: string, json: object) => void;
  /** 占位符文本 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 最小高度 */
  minHeight?: number;
  /** 最大高度 */
  maxHeight?: number;
  /** 图片上传 API 路径 */
  imageUploadUrl?: string;
  /** 自定义图片上传函数 */
  onImageUpload?: (file: File) => Promise<string>;
  /** 是否显示预览模式切换 */
  showPreviewToggle?: boolean;
  /** 类名 */
  className?: string;
}

// ── 工具栏按钮 ──

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}

function ToolbarButton({ onClick, active, disabled, children, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "p-1.5 rounded transition-colors",
        "hover:bg-gray-100 dark:hover:bg-gray-700",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        active && "bg-gray-200 dark:bg-gray-600"
      )}
    >
      {children}
    </button>
  );
}

// ── 工具栏分隔符 ──

function ToolbarSeparator() {
  return <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />;
}

// ── 主组件 ──

export function RichTextEditor({
  content = "",
  onChange,
  placeholder = "输入内容，支持 Markdown 快捷语法...",
  disabled = false,
  minHeight = 200,
  maxHeight = 600,
  imageUploadUrl = "/api/v1/admin/upload/rich-image",
  onImageUpload,
  showPreviewToggle = true,
  className,
}: RichTextEditorProps) {
  const [isPreview, setIsPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 图片上传处理 ──

  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      if (onImageUpload) {
        return onImageUpload(file);
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(imageUploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("图片上传失败");
      }

      const result = await response.json();
      if (result.code !== 0 || !result.data?.url) {
        throw new Error(result.message || "图片上传失败");
      }

      return result.data.url;
    },
    [imageUploadUrl, onImageUpload]
  );

  // ── 编辑器实例 ──

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: "max-w-full h-auto rounded",
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 dark:text-blue-400 underline",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Highlight.configure({
        multicolor: false,
      }),
    ],
    content,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML(), editor.getJSON());
      }
    },
  });

  // ── 添加链接 ──

  const addLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("输入链接地址", previousUrl);

    if (url === null) return;

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  // ── 添加图片 ──

  const addImage = useCallback(async () => {
    if (!editor) return;

    const input = fileInputRef.current;
    if (!input) return;

    input.click();
  }, [editor]);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editor) return;

      setIsUploading(true);
      try {
        const url = await handleImageUpload(file);
        editor.chain().focus().setImage({ src: url }).run();
      } catch (err) {
        console.error("图片上传失败:", err);
        alert("图片上传失败，请重试");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [editor, handleImageUpload]
  );

  // ── 设置标题 ──

  const setHeading = useCallback(
    (level: 1 | 2 | 3) => {
      editor?.chain().focus().toggleHeading({ level }).run();
    },
    [editor]
  );

  // ── 设置对齐 ──

  const setTextAlign = useCallback(
    (alignment: "left" | "center" | "right") => {
      editor?.chain().focus().setTextAlign(alignment).run();
    },
    [editor]
  );

  if (!editor) {
    return <div className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg h-48" />;
  }

  return (
    <div className={clsx("border rounded-lg overflow-hidden dark:border-gray-700", className)}>
      {/* 工具栏 */}
      {!isPreview && (
        <div className="border-b bg-gray-50 dark:bg-gray-800 dark:border-gray-700 p-2 flex flex-wrap items-center gap-1">
          {/* 撤销/重做 */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="撤销 (Ctrl+Z)"
          >
            <Undo size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="重做 (Ctrl+Y)"
          >
            <Redo size={16} />
          </ToolbarButton>

          <ToolbarSeparator />

          {/* 文本格式 */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="加粗 (Ctrl+B)"
          >
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="斜体 (Ctrl+I)"
          >
            <Italic size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
            title="下划线 (Ctrl+U)"
          >
            <UnderlineIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            title="删除线"
          >
            <Strikethrough size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive("highlight")}
            title="高亮"
          >
            <Highlighter size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive("code")}
            title="行内代码"
          >
            <Code size={16} />
          </ToolbarButton>

          <ToolbarSeparator />

          {/* 标题 */}
          <ToolbarButton
            onClick={() => setHeading(1)}
            active={editor.isActive("heading", { level: 1 })}
            title="标题 1"
          >
            <Heading1 size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setHeading(2)}
            active={editor.isActive("heading", { level: 2 })}
            title="标题 2"
          >
            <Heading2 size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setHeading(3)}
            active={editor.isActive("heading", { level: 3 })}
            title="标题 3"
          >
            <Heading3 size={16} />
          </ToolbarButton>

          <ToolbarSeparator />

          {/* 列表 */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="无序列表"
          >
            <List size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="有序列表"
          >
            <ListOrdered size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            title="引用"
          >
            <Quote size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive("codeBlock")}
            title="代码块"
          >
            <Code2 size={16} />
          </ToolbarButton>

          <ToolbarSeparator />

          {/* 对齐 */}
          <ToolbarButton
            onClick={() => setTextAlign("left")}
            active={editor.isActive({ textAlign: "left" })}
            title="左对齐"
          >
            <AlignLeft size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setTextAlign("center")}
            active={editor.isActive({ textAlign: "center" })}
            title="居中"
          >
            <AlignCenter size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setTextAlign("right")}
            active={editor.isActive({ textAlign: "right" })}
            title="右对齐"
          >
            <AlignRight size={16} />
          </ToolbarButton>

          <ToolbarSeparator />

          {/* 链接和图片 */}
          <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="插入链接">
            <LinkIcon size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={addImage} disabled={isUploading} title="插入图片">
            <ImageIcon size={16} />
          </ToolbarButton>

          {/* 预览切换 */}
          {showPreviewToggle && (
            <>
              <div className="flex-1" />
              <ToolbarButton
                onClick={() => setIsPreview(!isPreview)}
                active={isPreview}
                title="预览模式"
              >
                <Eye size={16} />
              </ToolbarButton>
            </>
          )}
        </div>
      )}

      {/* 编辑区域 */}
      <div
        className="relative"
        style={{ minHeight, maxHeight, overflowY: isPreview ? "auto" : undefined }}
      >
        {isPreview ? (
          <div
            className="p-4 prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
          />
        ) : (
          <EditorContent
            editor={editor}
            className="prose dark:prose-invert max-w-none p-4 focus:outline-none"
            style={{ minHeight, maxHeight }}
          />
        )}

        {/* 上传中遮罩 */}
        {isUploading && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center">
            <div className="text-sm text-gray-600 dark:text-gray-400">上传中...</div>
          </div>
        )}
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}

export default RichTextEditor;
