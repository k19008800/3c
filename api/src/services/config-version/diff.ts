// ============================================================
//  3cloud (3C) — 配置对比工具
// ============================================================

// ── 配置对比（diff） ──
export function diffConfigs(oldValue: any, newValue: any): {
  added: string[];
  removed: string[];
  changed: Array<{ key: string; old: any; new: any }>;
  unchanged: string[];
} {
  const result = {
    added: [] as string[],
    removed: [] as string[],
    changed: [] as Array<{ key: string; old: any; new: any }>,
    unchanged: [] as string[],
  };

  // 如果都是对象，进行深度对比
  if (typeof oldValue === "object" && typeof newValue === "object" && oldValue !== null && newValue !== null) {
    const oldKeys = Object.keys(oldValue);
    const newKeys = Object.keys(newValue);
    const allKeys = new Set([...oldKeys, ...newKeys]);

    for (const key of allKeys) {
      const inOld = key in oldValue;
      const inNew = key in newValue;

      if (!inOld && inNew) {
        result.added.push(key);
      } else if (inOld && !inNew) {
        result.removed.push(key);
      } else if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
        result.changed.push({ key, old: oldValue[key], new: newValue[key] });
      } else {
        result.unchanged.push(key);
      }
    }
  } else if (oldValue === undefined || oldValue === null) {
    // 新增配置
    if (typeof newValue === "object" && newValue !== null) {
      result.added = Object.keys(newValue);
    }
  } else if (newValue === undefined || newValue === null) {
    // 删除配置
    if (typeof oldValue === "object" && oldValue !== null) {
      result.removed = Object.keys(oldValue);
    }
  } else {
    // 简单值对比
    if (oldValue !== newValue) {
      result.changed.push({ key: "value", old: oldValue, new: newValue });
    } else {
      result.unchanged.push("value");
    }
  }

  return result;
}