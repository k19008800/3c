// ============================================================
//  3cloud (3C) — 代码片段生成服务
//  为一键复制功能提供多语言 SDK 示例代码。
// ============================================================

export interface SnippetContext {
  baseUrl: string
  apiKeyPreview: string   // 仅展示前后 4 位，如 "sk-b6...a1f2"
  modelName: string       // 默认模型
}

export function generateCodeSnippets(ctx: SnippetContext): Record<string, string> {
  const maskedKey = ctx.apiKeyPreview

  return {
    curl: `curl ${ctx.baseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ${maskedKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${ctx.modelName}","messages":[{"role":"user","content":"你好"}]}'`,

    python: `import requests\n\nresponse = requests.post(\n    "${ctx.baseUrl}/v1/chat/completions",\n    headers={\n        "Authorization": "Bearer ${maskedKey}",\n        "Content-Type": "application/json"\n    },\n    json={\n        "model": "${ctx.modelName}",\n        "messages": [{"role": "user", "content": "你好"}]\n    }\n)\nprint(response.json())`,

    javascript: `const response = await fetch("${ctx.baseUrl}/v1/chat/completions", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer ${maskedKey}",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    model: "${ctx.modelName}",\n    messages: [{ role: "user", content: "你好" }]\n  })\n})\nconst data = await response.json()\nconsole.log(data)`,

    go: `package main\n\nimport (\n  "bytes"\n  "encoding/json"\n  "fmt"\n  "net/http"\n)\n\nfunc main() {\n  body := map[string]any{\n    "model": "${ctx.modelName}",\n    "messages": []any{map[string]string{"role": "user", "content": "你好"}},\n  }\n  b, _ := json.Marshal(body)\n  req, _ := http.NewRequest("POST", "${ctx.baseUrl}/v1/chat/completions", bytes.NewReader(b))\n  req.Header.Set("Authorization", "Bearer ${maskedKey}")\n  req.Header.Set("Content-Type", "application/json")\n\n  resp, _ := http.DefaultClient.Do(req)\n  defer resp.Body.Close()\n\n  var result map[string]any\n  json.NewDecoder(resp.Body).Decode(&result)\n  fmt.Printf("%+v\\n", result)\n}`,
  }
}

export type SnippetLanguage = keyof ReturnType<typeof generateCodeSnippets>

export const LANGUAGE_LABELS: Record<SnippetLanguage, string> = {
  curl: 'cURL',
  python: 'Python',
  javascript: 'JavaScript',
  go: 'Go',
}
