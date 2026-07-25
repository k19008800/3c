import { getDb } from '../db/index.js';
import { campaigns } from '../db/schema/index.js';
import { eq, lte, and } from 'drizzle-orm';

export async function checkExpiredCampaigns() {
  const now = new Date();
  const db = getDb();
  const expired = await db.update(campaigns)
    .set({ status: 'ended' })
    .where(and(
      lte(campaigns.endAt, now),
      eq(campaigns.status, 'active')
    ))
    .returning({ id: campaigns.id, name: campaigns.name });

  if (expired.length > 0) {
    console.log(`[Cron] Auto-ended ${expired.length} campaigns:`, expired.map(c => c.name));
  }
  return expired;
}
