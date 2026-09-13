import "./env.js";
import { PortfolioStore } from "./portfolio.js";
import { createApp } from "./app.js";
try {
  const portfolio = await PortfolioStore.create();
  const server = createApp(portfolio).listen(
    Number(process.env.PORT ?? 3001),
    () => console.log("Renograph API ready"),
  );
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    await portfolio.dispose();
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
  server.on("error", async (error) => {
    console.error(error);
    await shutdown();
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
