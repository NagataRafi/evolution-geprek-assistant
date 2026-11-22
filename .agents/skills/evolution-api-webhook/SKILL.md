---
name: evolution-api-webhook
description: Technical reference for Evolution API v2 WhatsApp integration. Use when implementing or debugging webhooks (MESSAGES_UPSERT), filtering incoming messages (including fromMe), authenticating with the apikey header, and sending replies via /message/sendText/{instance}.
---

# Evolution API v2 - WhatsApp Webhook

Reference only. Read alongside the project's existing integration module.

## Config contract

```env
EVOLUTION_API_URL=https://evolution.example.com   # no trailing slash
EVOLUTION_API_KEY=global-or-instance-api-key
EVOLUTION_INSTANCE=geprek
WEBHOOK_SECRET=random-shared-secret               # optional, for URL/header check
```

Every request to Evolution:

```http
apikey: <EVOLUTION_API_KEY>
Content-Type: application/json
```

Never log the key. Never expose it to the client/browser.

## Register the webhook

```http
POST {EVOLUTION_API_URL}/webhook/set/{instance}
apikey: ...
Content-Type: application/json

{
  "webhook": {
    "enabled": true,
    "url": "https://your-domain.com/webhook/evolution?secret=...",
    "byEvents": false,
    "base64": false,
    "events": ["MESSAGES_UPSERT"]
  }
}
```

- Inspect current config: `GET /webhook/find/{instance}`.
- v2 wraps the config in a `webhook` object. If the server rejects it, check its version with `GET /` and match its docs.
- `byEvents: false` sends all subscribed events to one URL; the body's `event` tells you which.
- Subscribe only to what you handle. Fewer events = fewer loops and less noise.

## Incoming payload (shape)

```json
{
  "event": "messages.upsert",
  "instance": "geprek",
  "data": {
    "key": {
      "remoteJid": "6281234567890@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C2F1A9B4"
    },
    "pushName": "Budi",
    "messageType": "conversation",
    "message": { "conversation": "menu" },
    "messageTimestamp": 1710000000
  },
  "date_time": "2026-11-22T10:00:00.000Z",
  "sender": "6281234567890@s.whatsapp.net",
  "apikey": "..."
}
```

Event naming differs by version: config uses `MESSAGES_UPSERT`; payloads may say `messages.upsert`. Normalize:

```ts
const event = String(body.event ?? "").toUpperCase().replace(/[.\s-]/g, "_");
if (event !== "MESSAGES_UPSERT") return ok(); // ack, ignore
```

Do not use the payload's `apikey` field as authentication; it is not a reliable signature. Use a secret in the webhook URL or a custom header, compared in constant time, plus network allowlisting where possible.

## Filter order (before any business logic)

```ts
function shouldHandle(data: any): boolean {
  const key = data?.key;
  if (!key?.remoteJid) return false;
  if (key.fromMe === true) return false;                 // 1. never reply to self
  if (key.remoteJid === "status@broadcast") return false; // 2. status updates
  if (key.remoteJid.endsWith("@g.us")) return false;      // 3. groups, unless supported
  if (!data.message) return false;                        // 4. protocol/empty
  if (data.message.protocolMessage || data.message.senderKeyDistributionMessage) return false;
  if (!extractText(data.message).trim()) return false;    // 5. media/sticker only
  return true;
}
```

Additional guards:

- Dedupe by `data.key.id` (in-memory LRU/TTL set or DB unique index). Evolution retries webhooks; duplicate replies are the most common bug.
- Ignore own instance echoes: `data.key.fromMe` is primary; also compare `data.key.remoteJid` to the connected number's JID if available.
- Ack fast: return `200` immediately, then process async. Evolution may time out and retry while you call OpenAI.

## Text extraction

```ts
function extractText(message: any): string {
  const m = message?.ephemeralMessage?.message
        ?? message?.viewOnceMessage?.message
        ?? message?.viewOnceMessageV2?.message
        ?? message;
  return (
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.imageMessage?.caption ??
    m?.videoMessage?.caption ??
    m?.documentMessage?.caption ??
    m?.buttonsResponseMessage?.selectedDisplayText ??
    m?.listResponseMessage?.title ??
    m?.templateButtonReplyMessage?.selectedDisplayText ??
    ""
  ).trim();
}
```

Keep the raw message for `quoted` replies. Media without caption: reply once with "Ketik pesan teks ya Kak" or ignore; never crash.

## Send text

```http
POST {EVOLUTION_API_URL}/message/sendText/{instance}
apikey: ...
Content-Type: application/json

{
  "number": "6281234567890",
  "text": "Halo Kak Budi 👋\nMau pesan geprek?",
  "delay": 1200,
  "linkPreview": false
}
```

- `number`: bare digits with country code. Normalize JID:

```ts
function toNumber(remoteJid: string): string {
  const digits = remoteJid.split("@")[0].replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}
```

- Reply quoting the incoming message (best for context):

```json
{
  "number": "6281234567890",
  "text": "...",
  "quoted": { "key": { "remoteJid": "...", "fromMe": false, "id": "..." }, "message": { "conversation": "..." } }
}
```

- `delay` is milliseconds typed before sending; keep it small (0-1500) so replies are not artificially slow.
- Response contains `key.id`; store it if you need delivery tracing.
- Success: HTTP 2xx with `status`. Treat 4xx as non-retryable (bad number/instance/key); retry 5xx/timeouts with backoff, cap attempts, then log and drop.

## Failure modes checklist

| Symptom | Likely cause |
|---|---|
| Bot answers itself | `fromMe: true` not filtered, or no dedupe |
| Duplicate replies | Webhook retried; no idempotency by `key.id` |
| 401/403 | Missing/wrong `apikey` header, instance mismatch |
| 404 on send | Wrong instance name or endpoint version (`/message/sendText/{instance}`) |
| No webhook calls | Webhook disabled, wrong URL (must be public HTTPS), event not subscribed |
| Replies to groups | `@g.us` not filtered |
| Empty messages | Text extraction missing nested message types |
| Timeout loops | Slow handler; ack 200 first, process async |
