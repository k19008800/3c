/**
 * Playground 各 Tab 内部共享类型
 *
 * @module components/playground
 */

/** 对话消息（chat / messages 两个 Tab 复用） */
export interface MessageItem {
  role: "system" | "user" | "assistant";
  content: string;
}
