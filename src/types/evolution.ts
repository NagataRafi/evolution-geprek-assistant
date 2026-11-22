export interface EvolutionKey {
  remoteJid: string;
  fromMe?: boolean;
  id: string;
  participant?: string;
}

export interface EvolutionTextMessage {
  text?: string;
}

export interface EvolutionMediaMessage {
  caption?: string;
}

export interface EvolutionReplyMessage {
  selectedDisplayText?: string;
  title?: string;
}

export interface EvolutionMessage {
  conversation?: string;
  extendedTextMessage?: EvolutionTextMessage;
  imageMessage?: EvolutionMediaMessage;
  videoMessage?: EvolutionMediaMessage;
  documentMessage?: EvolutionMediaMessage;
  buttonsResponseMessage?: EvolutionReplyMessage;
  listResponseMessage?: EvolutionReplyMessage;
  templateButtonReplyMessage?: EvolutionReplyMessage;
  ephemeralMessage?: { message?: EvolutionMessage };
  viewOnceMessage?: { message?: EvolutionMessage };
  viewOnceMessageV2?: { message?: EvolutionMessage };
  protocolMessage?: unknown;
  senderKeyDistributionMessage?: unknown;
  [key: string]: unknown;
}

export interface EvolutionMessageData {
  key: EvolutionKey;
  pushName?: string;
  messageType?: string;
  message?: EvolutionMessage;
  messageTimestamp?: number | string;
  instanceId?: string;
  source?: string;
}

export interface EvolutionWebhookPayload {
  event: string;
  instance?: string;
  data: EvolutionMessageData;
  date_time?: string;
  sender?: string;
  apikey?: string;
}

export interface SendTextOptions {
  number: string;
  text: string;
  delay?: number;
  linkPreview?: boolean;
  quoted?: {
    key: EvolutionKey;
    message: EvolutionMessage;
  };
}

export interface SendTextResponse {
  key?: { id?: string };
  status?: string;
  [key: string]: unknown;
}

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  byEvents: boolean;
  base64: boolean;
  events: string[];
}
