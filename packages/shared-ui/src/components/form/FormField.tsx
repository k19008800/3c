import React from "react";
import "./FormField.css";

/**
 * 表单字段包装器属性
 */
export interface FormFieldProps {
  /** 字段标签文字 */
  label: string;
  /** 是否必填（标签前显示红色 *） */
  required?: boolean;
  /** 错误提示文字（显示在字段下方，红色） */
  error?: string;
  /** 帮助提示文字（显示在字段下方，灰色小字） */
  help?: string;
  /** 表单控件（input / select / textarea 等） */
  children: React.ReactNode;
}

/**
 * FormField — 表单字段包装器
 *
 * 提供统一的标签、必填标记、错误提示和帮助文字。
 *
 * 当 error 存在时，给包裹元素添加 `data-error` 属性，
 * CSS 通过 `[data-error] input` / `[data-error] select` / `[data-error] textarea`
 * 自动为内部控件添加红色边框。
 *
 * @example
 * ```tsx
 * <FormField label="用户名" required error="用户名不能为空">
 *   <input type="text" placeholder="请输入用户名" />
 * </FormField>
 * ```
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  error,
  help,
  children,
}) => {
  return (
    <div className="sfc-form-field" data-error={error || undefined}>
      <label className="sfc-form-field__label">
        {required && <span className="sfc-form-field__required">*</span>}
        {label}
      </label>
      <div className="sfc-form-field__control">{children}</div>
      {error && <p className="sfc-form-field__error">{error}</p>}
      {help && !error && <p className="sfc-form-field__help">{help}</p>}
    </div>
  );
};
