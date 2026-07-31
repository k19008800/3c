import "dotenv/config";
import { buildApp } from "./app";

const app = buildApp();
const port = Number(process.env.PORT) || 3000;

async function start() {
  try {
    await app.listen({ port, host: "0.0.0.0" });
    app.swagger(); // 生成 swagger JSON
    app.log.info(`API 已启动: http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

// graceful shutdown
process.on("SIGTERM", async () => {
  app.log.info("收到 SIGTERM，关闭中...");
  await app.close();
  process.exit(0);
});
process.on("SIGINT", async () => {
  app.log.info("收到 SIGINT，关闭中...");
  await app.close();
  process.exit(0);
});
