import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing the HTTP server`);
  const forcedExit = setTimeout(() => process.exit(1), 15_000);
  forcedExit.unref();
  server.close((error) => {
    clearTimeout(forcedExit);
    if (error) {
      console.error("HTTP server shutdown failed");
      process.exit(1);
    }
    process.exit(0);
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
