import Redis from "ioredis";

const redis = new Redis({ host: "localhost", port: 6379 });

// Check all risk keys
const riskKeys = await redis.keys("risk:*");
console.log("All risk keys:", JSON.stringify(riskKeys));

// Show type of each key
for (const k of riskKeys) {
  const type = await redis.type(k);
  let val;
  if (type === "string") {
    val = await redis.get(k);
  } else if (type === "zset") {
    val = `zcard=${await redis.zcard(k)}`;
  } else {
    val = `type=${type}`;
  }
  console.log(`  ${k} => type=${type} ${val}`);
}

// Clear all risk keys
if (riskKeys.length > 0) {
  await redis.del(...riskKeys);
  console.log(`\nCleared ${riskKeys.length} risk keys`);
} else {
  console.log("\nNo risk keys to clear");
}

// Also check fail keys for user 6 specifically
const failKeys = await redis.keys("risk:fail:*");
console.log("\nFail keys remaining:", failKeys.length);

await redis.quit();
console.log("Done - all login risk data cleared");
