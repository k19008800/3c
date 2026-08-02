# Ollama 蒸馏版小模型不支持 Function Calling

**日期**：2026-07-01

**现象**：DeepSeek-R1 8B（distilled）接入 OpenClaw 后无法识别/调用工具。

**原因**：蒸馏版小模型（尤其是 8B 级别）设计为纯推理/文本模型，训练过程中没有加入函数调用（function calling）能力。这不是配置问题，是模型架构限制。

**验证方法**：
```bash
openclaw models list --provider ollama --json
openclaw infer model run --model ollama/deepseek-r1:8b --prompt "回复：ok"
```

**结论**：如果 Agent 场景需要工具调用能力，不要用蒸馏版小模型。最终方案是**删除所有 Ollama 本地模型**——既占磁盘空间，又无实际 Agent 用途。

**教训**：在引入新模型前，先确认其能力集是否覆盖目标使用场景（特别是 function calling / tool use）。
