import Redis from "ioredis";

const redis = new Redis({ host: "localhost", port: 6379 });
redis.on("error", (e) => console.error("redis err:", e.message));

const riskKeys = await redis.keys("risk:*");
console.log("risk keys:", JSON.stringify(riskKeys));
for (const k of riskKeys) {
  const v = await redis.get(k);
  console.log(" ", k, "=>", v);
}

const rlKeys = await redis.keys("rl:*");
console.log("\nrl keys count:", rlKeys.length);

await redis.quit();
