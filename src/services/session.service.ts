import Redis from "ioredis";

import { env } from "../config";
import type { ChatMessage, CustomerSession } from "../types/session";

const MAX_HISTORY = 20;
const KEY_PREFIX = "geprek";
const HANDOVER_KEY = `${KEY_PREFIX}:handover`;

let client: Redis | null = null;

function sessionKey(remoteJid: string): string {
  return `${KEY_PREFIX}:session:${remoteJid}`;
}

function dedupeKey(remoteJid: string, messageId: string): string {
  return `${KEY_PREFIX}:seen:${remoteJid}:${messageId}`;
}

function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.redisUrl, {
      connectTimeout: 5_000,
      // Tunggu koneksi awal sebentar, tapi jangan menggantung saat Redis mati.
      enableOfflineQueue: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 200, 1_000)),
    });

    client.on("error", (error: Error) => {
      console.error("[redis] Koneksi bermasalah:", error.message);
    });
  }

  return client;
}

function createSession(remoteJid: string, pushName?: string): CustomerSession {
  const now = Date.now();
  return {
    remoteJid,
    pushName,
    state: "IDLE",
    cart: [],
    history: [],
    isHumanHandover: false,
    createdAt: now,
    updatedAt: now,
  };
}

function parseSession(raw: string): CustomerSession {
  try {
    return JSON.parse(raw) as CustomerSession;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Data sesi di Redis rusak: ${reason}`);
  }
}

async function saveSession(session: CustomerSession): Promise<void> {
  session.updatedAt = Date.now();
  await getRedis().set(
    sessionKey(session.remoteJid),
    JSON.stringify(session),
    "EX",
    env.sessionTtlSeconds,
  );
}

async function getSession(
  remoteJid: string,
  pushName?: string,
): Promise<CustomerSession> {
  const raw = await getRedis().get(sessionKey(remoteJid));
  const session = raw ? parseSession(raw) : createSession(remoteJid, pushName);

  if (pushName) session.pushName = pushName;
  await saveSession(session);
  return session;
}

async function addMessage(
  remoteJid: string,
  role: ChatMessage["role"],
  content: string,
): Promise<CustomerSession> {
  const session = await getSession(remoteJid);

  session.history.push({ role, content, timestamp: Date.now() });
  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(-MAX_HISTORY);
  }

  await saveSession(session);
  return session;
}

/**
 * Atomik: hanya pemanggil pertama untuk messageId yang sama yang mendapat `true`.
 * Mencegah balasan ganda saat Evolution mengirim ulang webhook.
 */
async function claimMessage(remoteJid: string, messageId: string): Promise<boolean> {
  if (!messageId) return true;

  const result = await getRedis().set(
    dedupeKey(remoteJid, messageId),
    "1",
    "EX",
    env.sessionTtlSeconds,
    "NX",
  );

  return result === "OK";
}

async function setHumanHandover(
  remoteJid: string,
  reason: string,
): Promise<CustomerSession> {
  const session = await getSession(remoteJid);
  session.isHumanHandover = true;
  session.state = "HANDOVER";
  session.handoverReason = reason;

  await saveSession(session);
  await getRedis().zadd(
    HANDOVER_KEY,
    Date.now() + env.sessionTtlSeconds * 1000,
    remoteJid,
  );
  return session;
}

async function resumeBot(remoteJid: string): Promise<boolean> {
  const raw = await getRedis().get(sessionKey(remoteJid));
  if (!raw) return false;

  const session = parseSession(raw);
  session.isHumanHandover = false;
  session.handoverReason = undefined;
  session.state = "IDLE";

  await saveSession(session);
  await getRedis().zrem(HANDOVER_KEY, remoteJid);
  return true;
}

async function completeOrder(remoteJid: string): Promise<CustomerSession | null> {
  const raw = await getRedis().get(sessionKey(remoteJid));
  if (!raw) return null;

  const session = parseSession(raw);
  session.cart = [];
  session.state = "DONE";

  await saveSession(session);
  return session;
}

async function listHandoverSessions(): Promise<CustomerSession[]> {
  const redis = getRedis();
  await redis.zremrangebyscore(HANDOVER_KEY, "-inf", String(Date.now()));

  const jids = await redis.zrange(HANDOVER_KEY, "0", "-1");
  if (jids.length === 0) return [];

  const rawSessions = await redis.mget(jids.map((jid) => sessionKey(jid)));
  const sessions: CustomerSession[] = [];

  for (let index = 0; index < jids.length; index += 1) {
    const raw = rawSessions[index];
    if (!raw) {
      await redis.zrem(HANDOVER_KEY, jids[index]);
      continue;
    }

    const session = parseSession(raw);
    if (session.isHumanHandover) sessions.push(session);
  }

  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function resetSession(remoteJid: string): Promise<void> {
  await getRedis().del(sessionKey(remoteJid));
  await getRedis().zrem(HANDOVER_KEY, remoteJid);
}

export const sessionService = {
  getSession,
  addMessage,
  claimMessage,
  setHumanHandover,
  resumeBot,
  completeOrder,
  listHandoverSessions,
  resetSession,
};
