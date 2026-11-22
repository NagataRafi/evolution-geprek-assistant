import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";

import { env, getStoreConfig } from "../config";
import { evolutionService } from "../services/evolution.service";
import { sessionService } from "../services/session.service";
import { aiService } from "../services/ai.service";
import type { EvolutionWebhookPayload } from "../types/evolution";
import type { CustomerSession } from "../types/session";
import {
  extractText,
  isGroupJid,
  isHandoverRequest,
  isStatusBroadcast,
  normalizeEvent,
  splitOrderConfirmation,
  toPhoneNumber,
} from "../utils/message";

const router = Router();
const FALLBACK_REPLY = "Maaf Kak, sistem sedang sibuk. Coba kirim pesan lagi sebentar ya 🙏";
const ORDER_RECEIVED_REPLY = "Baik Kak, pesanan sudah kami catat ya 🙏";
const HELP_TEXT = [
  "Perintah admin:",
  "#status - daftar sesi handover aktif",
  "#resume [nomor] - aktifkan bot kembali",
  "#help - daftar perintah",
].join("\n");

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

function formatHandoverList(sessions: CustomerSession[]): string {
  if (sessions.length === 0) return "Tidak ada sesi handover aktif.";

  const lines = sessions.map((session, index) => {
    const minutes = Math.max(0, Math.round((Date.now() - session.updatedAt) / 60_000));
    return [
      `${index + 1}. ${session.pushName ?? "-"} (${toPhoneNumber(session.remoteJid)})`,
      `   Alasan: ${session.handoverReason ?? "-"}`,
      `   Terakhir aktif: ${minutes} menit lalu - keranjang: ${session.cart.length} item`,
    ].join("\n");
  });

  return [`Sesi handover aktif (${sessions.length}):`, ...lines].join("\n");
}

async function resumeSession(remoteJid: string, targetNumber?: string): Promise<void> {
  const number = targetNumber ? toPhoneNumber(targetNumber) : toPhoneNumber(remoteJid);
  const resumed = await sessionService.resumeBot(`${number}@s.whatsapp.net`);

  await evolutionService.sendText(
    remoteJid,
    resumed
      ? `Bot diaktifkan kembali untuk ${number}.`
      : `Sesi ${number} tidak ditemukan atau sudah kedaluwarsa.`,
  );
}

async function handleAdminCommand(
  remoteJid: string,
  text: string,
): Promise<boolean> {
  const commandText = text.trim();
  if (!commandText.startsWith("#")) return false;

  if (!isAdmin(remoteJid)) {
    log("info", `Perintah admin ditolak dari ${remoteJid}`);
    return true;
  }

  const [rawCommand, rawArg] = commandText.slice(1).split(/\s+/);
  const command = (rawCommand ?? "").toLowerCase();

  if (command === "resume") {
    await resumeSession(remoteJid, rawArg);
    return true;
  }

  if (command === "status") {
    const sessions = await sessionService.listHandoverSessions();
    await evolutionService.sendText(remoteJid, formatHandoverList(sessions));
    return true;
  }

  await evolutionService.sendText(remoteJid, HELP_TEXT);
  return true;
}

async function handleConfirmedOrder(
  remoteJid: string,
  pushName: string | undefined,
  receipt: string,
): Promise<void> {
  await sessionService.completeOrder(remoteJid);

  notifyAdmin(
    [
      "Pesanan dikonfirmasi pelanggan.",
      `Pelanggan: ${pushName ?? "-"} (${toPhoneNumber(remoteJid)})`,
      "",
      receipt,
    ].join("\n"),
  );

  log("info", `Pesanan dikonfirmasi untuk ${remoteJid}`);
}

async function processIncoming(
  payload: EvolutionWebhookPayload,
  text: string,
): Promise<void> {
  const data = payload.data;
  const remoteJid = data.key.remoteJid;
  const session = await sessionService.getSession(remoteJid, data.pushName);

  if (await handleAdminCommand(remoteJid, text)) return;

  if (session.isHumanHandover) {
    await sessionService.addMessage(remoteJid, "user", text);
    log("info", `Handover aktif, pesan dari ${remoteJid} tidak dibalas bot`);
    return;
  }

  const updatedSession = await sessionService.addMessage(remoteJid, "user", text);

  if (isHandoverRequest(text)) {
    const store = getStoreConfig();
    await sessionService.setHumanHandover(remoteJid, text);
    await evolutionService.sendText(remoteJid, store.handoverMessage);
    notifyAdmin(
      `Handover diperlukan.\nPelanggan: ${data.pushName ?? "-"} (${remoteJid})\nAlasan: ${text}`,
    );
    log("info", `Handover diaktifkan untuk ${remoteJid}`);
    return;
  }

  await evolutionService.sendTyping(remoteJid);

  try {
    const reply = await aiService.generateReply(updatedSession);
    const { visible, receipt } = splitOrderConfirmation(reply);
    const customerReply = visible || (receipt ? ORDER_RECEIVED_REPLY : reply);

    await evolutionService.sendText(remoteJid, customerReply, {
      key: data.key,
      message: data.message ?? {},
    });
    await sessionService.addMessage(remoteJid, "assistant", customerReply);

    if (receipt) await handleConfirmedOrder(remoteJid, data.pushName, receipt);
  } catch (error) {
    log("error", `Gagal membuat balasan untuk ${remoteJid}`, error);
    await evolutionService.sendText(remoteJid, FALLBACK_REPLY).catch((sendError) =>
      log("error", "Gagal mengirim fallback", sendError),
    );
  }
}

router.post("/", async (req: Request, res: Response) => {
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

  try {
    const isNewMessage = await sessionService.claimMessage(key.remoteJid, key.id);
    if (!isNewMessage) {
      res.status(200).json({ received: true, ignored: "duplicate" });
      return;
    }
  } catch (error) {
    log("error", "Gagal mencatat deduplikasi di Redis", error);
    res.status(503).json({ error: "Session store unavailable" });
    return;
  }

  res.status(200).json({ received: true });

  void processIncoming(payload, text).catch((error) =>
    log("error", "Gagal memproses pesan masuk", error),
  );
});

export const webhookController = router;
