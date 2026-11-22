import express, { type NextFunction, type Request, type Response } from "express";

import { env } from "./config";
import { webhookController } from "./controllers/webhook.controller";

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use("/webhook", webhookController);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const reason = error instanceof Error ? error.message : String(error);
  console.error("[server] Unhandled error:", reason);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  console.info(`[server] Geprek webhook bot listening on port ${env.port}`);
});
