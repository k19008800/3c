-- 填充模型简介信息
-- 注意：test-model-* 跳过，不填充描述

UPDATE models SET description = 'OpenAI 旗舰多模态模型，支持文本和图像理解，推理能力强，适合复杂对话、内容生成、代码编写等场景。' WHERE name = 'gpt-4o' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI 轻量高效模型，性价比高，适合简单对话、分类、摘要等任务，速度快成本低。' WHERE name = 'gpt-4o-mini' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude 3.5 系列，优秀的推理和编程能力，长上下文支持，适合复杂分析、代码审查和安全场景。' WHERE name = 'claude-3.5-sonnet' AND (description IS NULL OR description = '');
UPDATE models SET description = 'DeepSeek 通用对话模型，中文能力出色，性价比优秀，适合各类对话和文本生成任务。' WHERE name = 'deepseek-chat' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI 文本嵌入模型，生成 1536 维向量，适合语义搜索、聚类、推荐等场景。' WHERE name = 'text-embedding-3-small' AND (description IS NULL OR description = '');
UPDATE models SET description = 'DeepSeek V4 Pro 旗舰模型，强大的推理和多步任务能力，适合复杂业务逻辑和深度分析。' WHERE name = 'DeepSeek-V4-Pro' AND (description IS NULL OR description = '');
UPDATE models SET description = 'DeepSeek V4 轻量版，高速推理，性能均衡，适合日常对话和简单任务。' WHERE name = 'deepseek-v4-flash' AND (description IS NULL OR description = '');

-- OspreyAI (枭毅) 模型系列
UPDATE models SET description = 'BGE-M3 多语言嵌入模型，支持 100+ 语言，适合多语言语义搜索和文本匹配。' WHERE name = 'bge_m3' AND (description IS NULL OR description = '');
UPDATE models SET description = 'BGE Reranker V3 重排序模型，对搜索结果进行精细排序，提升检索质量。' WHERE name = 'bge_reranker_v3' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude Fable 5 — 创意写作和故事生成优化版本，叙事能力出色。' WHERE name = 'claude-fable-5' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude Haiku 4.5 — 超轻量快速模型，极低延迟，适合实时对话和简单任务。' WHERE name = 'claude-haiku-4-5' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude Opus 4.8 — 旗舰推理模型，最高智能水平，适合复杂推理、长文分析和研究。' WHERE name = 'claude-opus-4-8' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude Opus 4.6 — 上一代旗舰模型，推理能力出色，稳定可靠。' WHERE name = 'claude-opus-4.6' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude Opus 4.7 — 企业级推理模型，强大的代码和数学推理能力。' WHERE name = 'claude-opus-4.7' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude Opus 4.7 Fast — Opus 4.7 快速推理版本，降低延迟，保留大部分推理能力。' WHERE name = 'claude-opus-4.7-fast' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude Sonnet 4.5 — 平衡性能和成本的优秀模型，适合大多数日常任务。' WHERE name = 'claude-sonnet-4.5' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude Sonnet 4.6 — 增强版 Sonnet 系列，推理和代码能力明显提升。' WHERE name = 'claude-sonnet-4.6' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Anthropic Claude Sonnet 5 — 新一代 Sonnet 旗舰，在各维度全面超越前代。' WHERE name = 'claude-sonnet-5' AND (description IS NULL OR description = '');
UPDATE models SET description = 'DeepSeek V4 Pro — 深度求索旗舰模型，强大的多步推理、编程和数学能力，适合企业级应用。' WHERE name = 'deepseek-v4-pro' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Google Gemini 3.1 Pro — 多模态模型，支持文本、代码、图像理解，长上下文能力强。' WHERE name = 'gemini-3.1-pro-preview' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Google Gemini 3.5 Flash — 高速轻量模型，低延迟高吞吐，适合实时应用。' WHERE name = 'gemini-3.5-flash' AND (description IS NULL OR description = '');
UPDATE models SET description = '智谱 GLM-4.6V Flash — 视觉语言模型，支持图文理解，推理速度快。' WHERE name = 'glm-4.6v-flash' AND (description IS NULL OR description = '');
UPDATE models SET description = '智谱 GLM 5.1 — 最新一代 GLM 大模型，出色的中文理解和生成能力。' WHERE name = 'glm-5.1' AND (description IS NULL OR description = '');
UPDATE models SET description = '智谱 GLM 5.1 FP8 — 量化加速版本，在保持质量的同时显著提升推理速度。' WHERE name = 'glm-5.1-fp8' AND (description IS NULL OR description = '');
UPDATE models SET description = '智谱 GLM 5.2 — 最新旗舰模型，推理和逻辑能力进一步提升。' WHERE name = 'glm-5.2' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI GPT 5.3 Codex — 专为代码生成和编程任务优化的版本，强大的代码理解和生成能力。' WHERE name = 'gpt-5.3-codex' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI GPT 5.4 — 最新通用模型，推理、创意、编程能力全面领先。' WHERE name = 'gpt-5.4' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI GPT 5.4 Pro — GPT 5.4 增强版，适用于高要求的专业和企业级任务。' WHERE name = 'gpt-5.4-pro' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI GPT 5.5 — 最新旗舰模型，在各基准测试中表现卓越。' WHERE name = 'gpt-5.5' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI GPT 5.5 Pro — 最高级别模型，面向最复杂的研究和推理任务。' WHERE name = 'gpt-5.5-pro' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI DALL-E 图像生成模型，根据文本描述生成高质量图片。' WHERE name = 'gpt-image-2' AND (description IS NULL OR description = '');
UPDATE models SET description = 'HappyHorse 图生视频模型，将静态图像转化为动态视频内容。' WHERE name = 'happyhorse-1.0-i2v' AND (description IS NULL OR description = '');
UPDATE models SET description = 'HappyHorse 文生视频模型，通过文本描述直接生成视频。' WHERE name = 'happyhorse-1.0-t2v' AND (description IS NULL OR description = '');
UPDATE models SET description = 'HappyHorse 视频编辑模型，对现有视频进行风格转换和内容编辑。' WHERE name = 'happyhorse-1.0-video-edit' AND (description IS NULL OR description = '');
UPDATE models SET description = 'MiniMax 最新通用模型，综合能力优秀，适合各类 AI 应用。' WHERE name = 'minimax-latest' AND (description IS NULL OR description = '');
UPDATE models SET description = 'MiniMax M2 通用模型，性能和成本均衡，适合日常业务集成。' WHERE name = 'minimax-m2' AND (description IS NULL OR description = '');
UPDATE models SET description = 'MiniMax M2 最新稳定版，持续优化的通用对话模型。' WHERE name = 'minimax-m2-latest' AND (description IS NULL OR description = '');
UPDATE models SET description = 'MiniMax M2.5 — 新一代模型，推理和指令跟随能力显著提升。' WHERE name = 'minimax-m2.5' AND (description IS NULL OR description = '');
UPDATE models SET description = 'MiniMax M2.5 HighSpeed — M2.5 高速推理版本，极低延迟。' WHERE name = 'minimax-m2.5-highspeed' AND (description IS NULL OR description = '');

-- LLMRouter → OpenAI 同名模型
UPDATE models SET description = 'OpenAI GPT 5.4 — 通过 LLMRouter 路由的 OpenAI 官方模型，同 GPT 5.4 性能。' WHERE name = 'openai/gpt-5.4' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI GPT 5.4 Pro — 通过 LLMRouter 路由的增强版本。' WHERE name = 'openai/gpt-5.4-pro' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI GPT 5.5 — 通过 LLMRouter 路由的 OpenAI 旗舰模型。' WHERE name = 'openai/gpt-5.5' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI GPT 5.5 Pro — 通过 LLMRouter 路由的最高级别模型。' WHERE name = 'openai/gpt-5.5-pro' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OspreyAI Ospery 1.1 Beta — 枭毅自研模型测试版，不断优化迭代中。' WHERE name = 'ospery-1.1-beta' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OspreyAI Osprey 1.0 Beta — 枭毅首发自研模型，面向通用对话场景。' WHERE name = 'osprey-1.0-beta' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Qwen TTS Flash — 阿里通义千问语音合成模型，文本转语音，速度快质量好。' WHERE name = 'qwen3-tts-flash' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Qwen3 VL 235B — 阿里通义千问视觉语言大模型，支持图文理解，235B 参数。' WHERE name = 'qwen3-vl-235b' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Qwen3 VL 30B — 阿里通义千问视觉语言模型轻量版，30B 参数，速度快。' WHERE name = 'qwen3-vl-30b' AND (description IS NULL OR description = '');
UPDATE models SET description = 'Qwen3.5 9B — 阿里通义千问 3.5 系列 9B 参数版本，轻量高效，适合资源受限场景。' WHERE name = 'Qwen3.5-9B' AND (description IS NULL OR description = '');
UPDATE models SET description = '豆包 Seedance 2.0 — 字节跳动视频生成模型，高质量文生视频。' WHERE name = 'seedance-2.0' AND (description IS NULL OR description = '');
UPDATE models SET description = '豆包 Seedance 2.0 Fast — 快速视频生成版本，降低生成时间。' WHERE name = 'seedance-2.0-fast' AND (description IS NULL OR description = '');
UPDATE models SET description = 'OpenAI Whisper — 语音识别模型，支持多语种音频转文字，准确率高。' WHERE name = 'whisper-1' AND (description IS NULL OR description = '');
UPDATE models SET description = 'HappyHorse 图生视频模型，参考图驱动视频生成。' WHERE name = 'happyhorse-1.0-r2v' AND (description IS NULL OR description = '');
