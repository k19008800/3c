// ============================================================
//  3cloud (3C) — 敏感内容检测器
//  检测请求/响应中的敏感词、高风险内容
// ============================================================

/**
 * 基础敏感词分类列表
 * 在实际生产环境中应使用更完善的词库或 AI 检测服务
 */
const SENSITIVE_WORDS: Record<string, string[]> = {
  // 涉政敏感词
  political: [
    "法轮功", "法轮", "轮功", "法轮大法", "天安门", "六四", "六四事件",
    "1989", "天安门事件", "天安门广场", "藏独", "疆独", "台独",
    "分裂国家", "颠覆国家", "敏感政治", "反华", "邪教组织",
  ],
  // 色情/低俗内容
  pornographic: [
    "色情", "淫秽", "裸聊", "裸体", "成人电影", "AV", "黄色网站",
    "情色", "三级片", "艳照", "裸照", "约炮", "一夜情", "卖淫",
    "嫖娼", "援交", "包养", "招嫖", "迷奸", "催情",
  ],
  // 暴力/恐怖
  violence: [
    "杀人", "自杀", "恐怖袭击", "爆炸物", "枪支", "弹药", "毒品制造",
    "制毒", "贩毒", "绑架", "抢劫", "纵火", "暴力袭击",
  ],
  // 赌博
  gambling: [
    "赌博", "赌场", "赌博网站", "百家乐", "轮盘", "老虎机",
    "地下赌场", "网络赌博", "赌球", "赌马",
  ],
  // 诈骗
  fraud: [
    "诈骗", "传销", "庞氏骗局", "非法集资", "洗钱", "刷单",
    "刷信誉", "虚假广告", "钓鱼网站", "木马", "病毒",
    "破解版", "盗版", "非法破解", "外挂",
  ],
};

// 组合所有敏感词（用于快速检测）
const ALL_SENSITIVE_WORDS = Object.values(SENSITIVE_WORDS).flat();

// 高优先级敏感词（直接判定 high_risk）
const HIGH_PRIORITY_WORDS: string[] = [
  "法轮功", "六四", "天安门事件",
  "裸聊", "色情直播",
  "恐怖袭击", "枪支", "制毒",
  "诈骗", "非法集资", "洗钱",
];

export interface SensitiveDetectionResult {
  hasSensitive: boolean;
  tags: string[];
  highPriorityMatch: boolean;
}

/**
 * 检测文本中的敏感内容
 */
export function detectSensitiveContent(text: string): SensitiveDetectionResult {
  if (!text || text.length === 0) {
    return { hasSensitive: false, tags: [], highPriorityMatch: false };
  }

  const matchedTags: string[] = [];
  let highPriorityMatch = false;

  for (const [category, words] of Object.entries(SENSITIVE_WORDS)) {
    for (const word of words) {
      if (text.includes(word)) {
        const tag = `sensitive_${category}`;
        if (!matchedTags.includes(tag)) {
          matchedTags.push(tag);
        }
        if (HIGH_PRIORITY_WORDS.includes(word)) {
          highPriorityMatch = true;
        }
        // 找到分类中的匹配即可 break，避免重复标签
        break;
      }
    }
  }

  return {
    hasSensitive: matchedTags.length > 0,
    tags: matchedTags,
    highPriorityMatch,
  };
}

/**
 * 检测请求体中的敏感内容（递归检查字符串字段）
 */
export function detectSensitiveInObject(obj: unknown): SensitiveDetectionResult {
  const allTags = new Set<string>();
  let highPriorityFound = false;

  function walk(value: unknown): void {
    if (typeof value === "string") {
      if (value.length > 50000) {
        // 超长字符串只检查开头部分
        const result = detectSensitiveContent(value.slice(0, 50000));
        result.tags.forEach((t) => allTags.add(t));
        if (result.highPriorityMatch) highPriorityFound = true;
      } else {
        const result = detectSensitiveContent(value);
        result.tags.forEach((t) => allTags.add(t));
        if (result.highPriorityMatch) highPriorityFound = true;
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
    } else if (value && typeof value === "object") {
      for (const val of Object.values(value as Record<string, unknown>)) {
        walk(val);
      }
    }
  }

  walk(obj);

  return {
    hasSensitive: allTags.size > 0,
    tags: Array.from(allTags),
    highPriorityMatch: highPriorityFound,
  };
}
