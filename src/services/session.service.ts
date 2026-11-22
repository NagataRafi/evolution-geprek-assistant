import type { ChatMessage, CustomerSession } from "../types/session";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY = 20;
const MAX_PROCESSED_IDS = 50;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const sessions = new Map<string, CustomerSession>();

function createSession(remoteJid: string, pushName?: string): CustomerSession {
  const now = Date.now();
  return {
    remoteJid,
    pushName,
    state: "IDLE",
    cart: [],
    history: [],
    processedMessageIds: [],
    isHumanHandover: false,
    createdAt: now,
    updatedAt: now,
  };
}

function isExpired(session: CustomerSession): boolean {
  return Date.now() - session.updatedAt > SESSION_TTL_MS;
}

function getSession(remoteJid: string, pushName?: string): CustomerSession {
  const existing = sessions.get(remoteJid);

  if (existing && !isExpired(existing)) {
    if (pushName) existing.pushName = pushName;
    existing.updatedAt = Date.now();
    return existing;
  }

  const session = createSession(remoteJid, pushName);
  sessions.set(remoteJid, session);
  return session;
}

function addMessage(remoteJid: string, role: ChatMessage["role"], content: string): void {
  const session = getSession(remoteJid);

  session.history.push({ role, content, timestamp: Date.now() });
  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(-MAX_HISTORY);
  }
  session.updatedAt = Date.now();
}

function isDuplicate(remoteJid: string, messageId: string): boolean {
  if (!messageId) return false;
  return getSession(remoteJid).processedMessageIds.includes(messageId);
}

function markProcessed(remoteJid: string, messageId: string): void {
  if (!messageId) return;

  const session = getSession(remoteJid);
  session.processedMessageIds.push(messageId);
  if (session.processedMessageIds.length > MAX_PROCESSED_IDS) {
    session.processedMessageIds = session.processedMessageIds.slice(-MAX_PROCESSED_IDS);
  }
  session.updatedAt = Date.now();
}

function setHumanHandover(remoteJid: string, reason: string): CustomerSession {
  const session = getSession(remoteJid);
  session.isHumanHandover = true;
  session.state = "HANDOVER";
  session.handoverReason = reason;
  session.updatedAt = Date.now();
  return session;
}

function resumeBot(remoteJid: string): boolean {
  const session = sessions.get(remoteJid);
  if (!session) return false;

  session.isHumanHandover = false;
  session.handoverReason = undefined;
  session.state = "IDLE";
  session.updatedAt = Date.now();
  return true;
}

function resetSession(remoteJid: string): void {
  sessions.delete(remoteJid);
}

setInterval(() => {
  for (const [remoteJid, session] of sessions) {
    if (isExpired(session)) sessions.delete(remoteJid);
  }
}, CLEANUP_INTERVAL_MS).unref();

export const sessionService = {
  getSession,
  addMessage,
  isDuplicate,
  markProcessed,
  setHumanHandover,
  resumeBot,
  resetSession,
};
