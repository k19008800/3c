# 可逆恢复 reviewed-v1 草稿

- 机械恢复候选总数：849 条
- 输出为新的 reviewed-v1 草稿，未覆盖 canonical v2 CSV。
- 所有恢复条目在 notes 中保留转换方法和源行位置。
- `MECHANICAL_RECOVERY_REVIEW` 不是人工语义确认，也不是 PASS。

| 文件 | 总行数 | 机械恢复行数 |
|---|---:|---:|
| `core-finance-atomic-reviewed-v1.csv` | 4120 | 25 |
| `admin-portal-atomic-reviewed-v1.csv` | 3322 | 70 |
| `user-agent-atomic-reviewed-v1.csv` | 6494 | 754 |

## 使用边界

`reviewed-v1` 仅是机械恢复草稿。它不等于人工复核通过、需求验收通过、源码实现完成或测试证据成立；正式清单必须从人工复核表中明确 `APPROVE` 的条目另行生成。
