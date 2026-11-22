import type { EvolutionMessage } from "../types/evolution";

const HANDOVER_PATTERNS: RegExp[] = [
  /\badmin\b/,
  /\b(cs|owner)\b/,
  /\bmanusia\b/,
  /\b(komplain|refund|kecewa|marah|tipu|penipuan)\b/,
  /uang (kembali|saya)/,
  /belum (sampai|datang|diproses)/,
  /mau (bicara|ngobrol|telpon|telepon)/,
  /(salah|keliru) (pesanan|order|kirim|antar)/,
];

export function normalizeEvent(event: unknown): string {
  return String(event ?? "")
    .toUpperCase()
    .replace(/[.\s-]/g, "_");
}

export function isGroupJid(remoteJid: string): boolean {
  return remoteJid.endsWith("@g.us");
}

export function isStatusBroadcast(remoteJid: string): boolean {
  return remoteJid === "status@broadcast";
}

export function toPhoneNumber(remoteJid: string): string {
  const digits = remoteJid.split("@")[0].replace(/\D/g, "");

  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

export function extractText(message: EvolutionMessage | undefined): string {
  const content =
    message?.ephemeralMessage?.message ??
    message?.viewOnceMessage?.message ??
    message?.viewOnceMessageV2?.message ??
    message;

  const text =
    content?.conversation ??
    content?.extendedTextMessage?.text ??
    content?.imageMessage?.caption ??
    content?.videoMessage?.caption ??
    content?.documentMessage?.caption ??
    content?.buttonsResponseMessage?.selectedDisplayText ??
    content?.listResponseMessage?.title ??
    content?.templateButtonReplyMessage?.selectedDisplayText ??
    "";

  return text.trim();
}

const ORDER_BLOCK_PATTERN =
  /\[ORDER_CONFIRMED\]([\s\S]*?)(?:\[\/ORDER_CONFIRMED\]|$)/i;

export interface ParsedReply {
  visible: string;
  receipt?: string;
}

/**
 * Pisahkan balasan LLM menjadi teks untuk pelanggan dan struk pesanan untuk admin.
 * Penanda blok tidak boleh sampai ke pelanggan.
 */
export function splitOrderConfirmation(reply: string): ParsedReply {
  const match = reply.match(ORDER_BLOCK_PATTERN);
  if (!match) return { visible: reply.trim() };

  const visible = reply.slice(0, match.index).trim();
  const receipt = (match[1] ?? "").trim();

  return { visible, ...(receipt ? { receipt } : {}) };
}

export function isHandoverRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  return HANDOVER_PATTERNS.some((pattern) => pattern.test(normalized));
}
