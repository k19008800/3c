// ============================================================
//  3cloud (3C) — DeepSeek 视觉模型 OCR 实现
//  利用 DeepSeek V4 Flash 的视觉能力识别身份证和营业执照
//  API: https://api.deepseek.com/chat/completions
// ============================================================

import type { OcrProvider, OcrResult, IdCardOcrResult, BusinessLicenseOcrResult } from "./provider.js";
import { registerOcrProvider } from "./provider.js";
import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export class DeepSeekOcrProvider implements OcrProvider {
  readonly name = 'deepseek';

  private readonly API_URL = 'https://api.deepseek.com/chat/completions';
  private readonly MODEL = 'deepseek-v4-flash';

  /**
   * 从 system_configs 表读取 API Key
   */
  private async getApiKey(): Promise<string> {
    const db = getDb();
    const rows = await db
      .select({ value: systemConfigs.value })
      .from(systemConfigs)
      .where(eq(systemConfigs.key, 'deepseek_api_key'))
      .limit(1);

    if (rows.length === 0 || !rows[0].value) {
      throw new Error('DeepSeek API Key 未配置，请在系统设置中配置 deepseek_api_key');
    }
    return rows[0].value;
  }

  /**
   * 根据 fileType 返回对应的 OCR 提取 Prompt
   */
  private getPrompt(fileType: string): string {
    switch (fileType) {
      case 'id_front':
        return `你是一个证件OCR识别专家。请仔细分析这张身份证正面图片，提取以下信息并以纯JSON格式返回（不要markdown代码块，不要额外文字）：

{
  "type": "id_card",
  "name": "姓名",
  "idNumber": "身份证号（18位，含最后一位X大写）",
  "gender": "性别",
  "nationality": "民族",
  "birthDate": "出生日期 yyyy-MM-dd格式",
  "address": "住址",
  "confidence": 0.95
}

注意：
- confidence 取值 0-1，反映你对识别结果的把握程度
- 如某字段无法识别则设为 null
- 身份证号需校验最后一位校验码是否合理`;

      case 'id_back':
        return `你是一个证件OCR识别专家。请仔细分析这张身份证反面图片，提取以下信息并以纯JSON格式返回（不要markdown代码块，不要额外文字）：

{
  "type": "id_card",
  "issuedBy": "签发机关",
  "validDate": "有效期限",
  "confidence": 0.95
}

注意：
- confidence 取值 0-1
- 有效期限格式保持原样，如 "2016.01.01-2036.01.01"`;

      case 'business_license':
        return `你是一个证件OCR识别专家。请仔细分析这张营业执照图片，提取以下信息并以纯JSON格式返回（不要markdown代码块，不要额外文字）：

{
  "type": "business_license",
  "companyName": "企业名称",
  "regNumber": "统一社会信用代码（18位）",
  "legalPerson": "法定代表人",
  "registeredCapital": "注册资本",
  "establishedDate": "成立日期",
  "validPeriod": "营业期限",
  "address": "注册地址",
  "businessScope": "经营范围",
  "confidence": 0.95
}

注意：
- confidence 取值 0-1
- 如某字段无法识别则设为 null
- 确保统一信用代码长度和格式正确`;

      default:
        throw new Error(`不支持的证件类型: ${fileType}`);
    }
  }

  async recognize(imageBase64: string, fileType: string): Promise<OcrResult> {
    const apiKey = await this.getApiKey();
    const prompt = this.getPrompt(fileType);

    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.01,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('DeepSeek 返回空结果');
    }

    // 解析 JSON（可能被 markdown 包裹）
    let jsonStr = content.trim();
    // 去掉可能的 ```json ``` 包裹
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const result = JSON.parse(jsonStr) as OcrResult;
      return result;
    } catch (parseErr) {
      // 如果解析失败，返回原始内容作为 rawResult
      return {
        type: fileType === 'business_license' ? 'business_license' as any : 'id_card',
        confidence: 0,
        rawResult: { rawContent: content },
      } as any;
    }
  }
}

// ── 注册到工厂 ──
registerOcrProvider('deepseek', DeepSeekOcrProvider);
