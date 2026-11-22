import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";

import { env, getStoreConfig } from "../config";
import { evolutionService } from "../services/evolution.service";
import { sessionService } from "../services/session.service";
import { aiService } from "../services/ai.service";
import type { EvolutionWebhookPayload } from "../types/evolution";
import {
  extractText,
  isGroupJid,
  isHandoverRequest,
  isStatusBroadcast,
  normalizeEvent,
  toPhoneNumber,
} from "../utils/message";

const router = Router();
const FALLBACK_REPLY = "Maaf Kak, sistem sedang sibuk. Coba kirim pesan lagi sebentar ya 🙏";

function log(level: "info" | "error", message: string, meta?: unknown): void {
  const line = `[webhook] ${message}`;
  if (level === "error") {
    console.error(line, meta ?? "");
  } else {
    console.info(line, meta ?? "");
  }
}

function firstString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return String(value[0] ?? "");
  return "";
}

function isAuthorized(req: Request): boolean {
  if (!env.webhookSecret) return true;

  const provided =
    firstString(req.query.secret) || firstString(req.get("x-webhook-secret"));

  const expected = Buffer.from(env.webhookSecret);
  const actual = Buffer.from(provided);

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function isAdmin(remoteJid: string): boolean {
  return env.adminNumbers.includes(toPhoneNumber(remoteJid));
}

function notifyAdmin(message: string): void {
  const target = env.adminNotifyNumber || env.adminNumbers[0];
  if (!target) return;

  evolutionService
    .sendText(`${target}@s.whatsapp.net`, message)
    .catch((error) => log("error", "Gagal mengirim notifikasi admin", error));
}

async function handleAdminCommand(
  remoteJid: string,
  text: string,
): Promise<boolean> {
  if (!text.startsWith("#")) return false;

  if (!isAdmin(remoteJid)) {
    log("info", `Perintah admin ditolak dari ${remoteJid}`);
    return true;
  }

  const resumeMatch = text.match(/^#resume(?:\s+(\S+))?$/i);

  if (resumeMatch) {
    const targetNumber = resumeMatch[1]
      ? toPhoneNumber(resumeMatch[1])
      : toPhoneNumber(remoteJid);
    const targetJid = `${targetNumber}@s.whatsapp.net`;
    const resumed = sessionService.resumeBot(targetJid);

    await evolutionService.sendText(
      remoteJid,
      resumed
        ? `Bot diaktifkan kembali untuk ${targetNumber}.`
        : `Sesi ${targetNumber} tidak ditemukan atau sudah kedaluwarsa.`,
    );
    return true;
  }

  await evolutionService.sendText(
    remoteJid,
    "Perintah admin: #resume [nomor] untuk mengaktifkan bot kembali.",
  );
  return true;
}

async function processIncoming(
  payload: EvolutionWebhookPayload,
  text: string,
): Promise<void> {
  const data = payload.data;
  const remoteJid = data.key.remoteJid;
  const session = sessionService.getSession(remoteJid, data.pushName);

  if (await handleAdminCommand(remoteJid, text)) return;

  if (session.isHumanHandover) {
    sessionService.addMessage(remoteJid, "user", text);
    log("info", `Handover aktif, pesan dari ${remoteJid} tidak dibalas bot`);
    return;
  }

  sessionService.addMessage(remoteJid, "user", text);

  if (isHandoverRequest(text)) {
    const store = getStoreConfig();
    sessionService.setHumanHandover(remoteJid, text);
    await evolutionService.sendText(remoteJid, store.handoverMessage);
    notifyAdmin(
      `Handover diperlukan.\nPelanggan: ${data.pushName ?? "-"} (${remoteJid})\nAlasan: ${text}`,
    );
    log("info", `Handover diaktifkan untuk ${remoteJid}`);
    return;
  }

  await evolutionService.sendTyping(remoteJid);

  try {
    const reply = await aiService.generateReply(session);
    await evolutionService.sendText(remoteJid, reply, {
      key: data.key,
      message: data.message ?? {},
    });
    sessionService.addMessage(remoteJid, "assistant", reply);
  } catch (error) {
    log("error", `Gagal membuat balasan untuk ${remoteJid}`, error);
    await evolutionService.sendText(remoteJid, FALLBACK_REPLY).catch((sendError) =>
      log("error", "Gagal mengirim fallback", sendError),
    );
  }
}

router.post("/", (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = req.body as EvolutionWebhookPayload;

  if (normalizeEvent(payload?.event) !== "MESSAGES_UPSERT") {
    res.status(200).json({ received: true, ignored: "event" });
    return;
  }

  const data = payload.data;
  const key = data?.key;

  if (!key?.remoteJid || !key.id) {
    res.status(200).json({ received: true, ignored: "invalid-payload" });
    return;
  }

  if (key.fromMe === true) {
    res.status(200).json({ received: true, ignored: "from-me" });
    return;
  }

  if (isGroupJid(key.remoteJid) || isStatusBroadcast(key.remoteJid)) {
    res.status(200).json({ received: true, ignored: "group-or-status" });
    return;
  }

  const text = extractText(data.message);
  if (!text) {
    res.status(200).json({ received: true, ignored: "empty-text" });
    return;
  }

  if (sessionService.isDuplicate(key.remoteJid, key.id)) {
    res.status(200).json({ received: true, ignored: "duplicate" });
    return;
  }
  sessionService.markProcessed(key.remoteJid, key.id);

  res.status(200).json({ received: true });

  void processIncoming(payload, text).catch((error) =>
    log("error", "Gagal memproses pesan masuk", error),
  );
});

export const webhookController = router;
