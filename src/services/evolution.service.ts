import { env } from "../config";
import type {
  EvolutionKey,
  EvolutionMessage,
  SendTextResponse,
} from "../types/evolution";
import { toPhoneNumber } from "../utils/message";

const REQUEST_TIMEOUT_MS = 15_000;

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EvolutionApiError";
  }
}

async function request<T>(pathname: string, body: unknown): Promise<T> {
  if (!env.evolutionApiKey) {
    throw new EvolutionApiError("EVOLUTION_API_KEY belum diatur");
  }

  const response = await fetch(`${env.evolutionApiUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.evolutionApiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const raw = await response.text();
  let parsed: unknown = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = { raw };
  }

  if (!response.ok) {
    const detail = typeof raw === "string" ? raw.slice(0, 300) : "";
    throw new EvolutionApiError(
      `Evolution API ${response.status} pada ${pathname}: ${detail}`,
      response.status,
    );
  }

  return parsed as T;
}

const instancePath = `/message/sendText/${encodeURIComponent(env.evolutionInstance)}`;

export const evolutionService = {
  async sendText(
    remoteJid: string,
    text: string,
    quoted?: { key: EvolutionKey; message: EvolutionMessage },
  ): Promise<SendTextResponse> {
    return request<SendTextResponse>(instancePath, {
      number: toPhoneNumber(remoteJid),
      text,
      delay: 0,
      linkPreview: false,
      ...(quoted ? { quoted } : {}),
    });
  },

  async sendTyping(remoteJid: string, delayMs = 1200): Promise<void> {
    await request(`/chat/sendPresence/${encodeURIComponent(env.evolutionInstance)}`, {
      number: toPhoneNumber(remoteJid),
      presence: "composing",
      delay: Math.max(0, Math.min(delayMs, 5000)),
    });
  },

  async setWebhook(url: string, events: string[] = ["MESSAGES_UPSERT"]): Promise<unknown> {
    return request(`/webhook/set/${encodeURIComponent(env.evolutionInstance)}`, {
      webhook: {
        enabled: true,
        url,
        byEvents: false,
        base64: false,
        events,
      },
    });
  },
};
