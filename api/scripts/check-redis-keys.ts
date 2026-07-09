import { createClient } from "redis";

const client = createClient({ url: "redis://localhost:6379" });
client.on("error", (e: any) => console.error("redis err:", e.message));
await client.connect();

const riskKeys = await client.keys("risk:*");
console.log("risk keys:", JSON.stringify(riskKeys));
for (const k of riskKeys) {
  const v = await client.get(k);
  console.log(" ", k, "=>", v);
}

const banIpKeys = await client.keys("risk:ban:ip:*");
console.log("\nban IP keys:", JSON.stringify(banIpKeys));

const banUserKeys = await client.keys("risk:ban:user:*");
console.log("ban user keys:", JSON.stringify(banUserKeys));

await client.quit();
