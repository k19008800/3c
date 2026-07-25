/**
 * 敏感词测试工具
 * POST /api/v1/admin/sensitive-words/test
 */
import { Router, Request, Response } from 'express';
import { db } from '@/db';
import { sensitiveWords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { authMiddleware, requirePerm } from '@/middleware/auth';

const router = Router();

router.post('/test', authMiddleware, requirePerm('sensitive_words:test'), async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ code: -1, message: '请提供待检测文本' });
    }

    const words = await db.select({
      word: sensitiveWords.word,
      category: sensitiveWords.category,
    })
      .from(sensitiveWords)
      .where(eq(sensitiveWords.enabled, true));

    const matches: Array<{ word: string; category: string; position: number }> = [];
    const lowerText = text.toLowerCase();

    for (const w of words) {
      const lowerWord = w.word.toLowerCase();
      let idx = lowerText.indexOf(lowerWord);
      while (idx !== -1) {
        matches.push({ word: w.word, category: w.category, position: idx });
        idx = lowerText.indexOf(lowerWord, idx + 1);
      }
    }

    res.json({
      code: 0,
      data: {
        hasMatch: matches.length > 0,
        matches,
        totalWords: words.length,
      },
    });
  } catch (err) {
    console.error('[SensitiveWordsTest] Error:', err);
    res.status(500).json({ code: -1, message: '检测失败' });
  }
});

export default router;
