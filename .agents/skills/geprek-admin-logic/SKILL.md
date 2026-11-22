---
name: geprek-admin-logic
description: "Business rules for the ayam geprek cashier bot. Use when implementing or changing the conversation flow: greeting, menu and spice-level checks, price breakdown, order confirmation, and human handover (pause/resume bot) when a customer complains or asks for an admin."
---

# Geprek Admin Logic

Domain rules for the WhatsApp cashier. Prices and menu come from config/data, never hardcoded in prompts.

## Source of truth

- `menu`: id, name, price (integer rupiah), available, options (spice levels, add-ons).
- `SPICE_LEVELS`: 0 = tidak pedas, 1 = pedas, 2 = sedang, 3 = pedas banget, 4 = level dewa, 5 = level neraka. Adjust names to the shop; keep the mapping in one constant.
- `DELIVERY_FEE`, `TAX`, store hours, payment methods: config only.
- If a value is missing from config, do not invent it. Ask admin / say it is unavailable.

## Conversation states

```
IDLE -> GREETING -> BROWSE -> ITEM -> SPICE -> QTY -> SUMMARY -> CONFIRM -> DONE
                                                              \-> HANDOVER (paused)
```

Persist per `remoteJid`: `state`, `cart[]`, `customerName`, `orderType` (dine-in/takeaway/delivery), `address`, `handover` flag. One active cart per chat. Reset after DONE or 30 minutes idle.

## 1. Greeting

Trigger: first message, or "halo", "assalamualaikum", "p", "menu", "pesan".

Template (short, friendly, Indonesian, no walls of text):

```
Halo Kak 👋 Selamat datang di Geprek [Nama].
Mau pesan apa hari ini?
• Ayam Geprek Original - Rp15.000
• Ayam Geprek Keju - Rp20.000
• Es Teh - Rp5.000

Ketik menu yang diinginkan ya.
```

Rules:
- Greet once per session, not on every message.
- Show only `available: true` items.
- Do not dump the full menu again if the customer already chose.

## 2. Menu and spice-level check

- Match customer text to menu by name/id, case-insensitive, tolerate typos ("geprek keju", "keju"). If ambiguous, ask one clarifying question with the closest 2 options.
- Item not on menu: do not guess; say it is not available and show 2-3 relevant alternatives.
- Every chicken item requires a spice level. If the customer omitted it, ask: "Level cabai berapa Kak? 0-5."
- Accept forms: "level 3", "lv3", "pedas banget", "3". Map to the numeric level. Out of range: ask again, do not clamp silently.
- Quantity: default 1 only if the customer said one item without quantity? No - if unclear, ask. Never silently change quantity.
- Add-ons (nasi, telur, keju, minuman): offer only configured add-ons and prices.

## 3. Price calculation

Pure function, integer rupiah, no floats for display rounding:

```ts
type Line = { name: string; spiceLevel?: number; qty: number; unitPrice: number };

function calcOrder(lines: Line[], opts: { deliveryFee?: number; taxRate?: number } = {}) {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const tax = Math.round(subtotal * (opts.taxRate ?? 0));
  const delivery = opts.deliveryFee ?? 0;
  return { subtotal, tax, delivery, total: subtotal + tax + delivery };
}
```

Format: `Rp15.000` (dot thousands separator, no decimals, no space).

Always show the breakdown before confirmation:

```
Rincian pesanan:
1. Geprek Keju (level 3) x2 = Rp40.000
2. Es Teh x1 = Rp5.000
Subtotal: Rp45.000
Ongkir: Rp0
Total: Rp45.000
```

Rules:
- Recompute from the cart, never from earlier message text.
- Discounts/promo only if explicitly configured; otherwise say none.
- Unknown price or add-on: stop and escalate to admin.

## 4. Confirmation

- Ask explicitly: "Pesanan sudah benar? Balas *YA* untuk konfirmasi atau *UBAH* untuk edit."
- Only an explicit yes ("ya", "yes", "betul", "lanjut", "ok") creates the order.
- "Ubah"/"batal": return to edit/cancel; recompute and reshow summary.
- On confirm: create order with id, item snapshot, price snapshot, customer JID, timestamp, payment method; send final message with order id and estimate if configured.
- Never confirm, charge, or promise delivery time without an explicit yes.
- Do not accept payment details in chat beyond configured methods; never ask for OTP/PIN.

## 5. Handover / pause bot

Trigger immediately, no argument, on any of:
- "admin", "manusia", "CS", "owner", "mau bicara dengan orang"
- complaint words: "komplain", "salah", "lama", "belum sampai", "refund", "uang kembali", "kecewa", "marah", "tipu"
- anger, threats, legal words, repeated unanswered question (>=2 attempts)
- request outside the bot's knowledge (custom catering, bulk order, allergies, halal certificate, refund policy)

Action:

```
1. Set conversation.handover = true, state = HANDOVER.
2. Stop all automated replies for that JID (check flag first, before any logic).
3. Send one message:
   "Baik Kak, saya sambungkan ke admin kami ya. Mohon tunggu sebentar 🙏"
4. Notify admin (group/admin number) with customer JID, name, reason, last messages, cart snapshot.
5. Log reason + timestamp. Do not delete the conversation.
```

While paused:
- The bot may only send a neutral holding message once, e.g. "Admin kami akan segera membalas ya Kak." Do not loop it.
- Ignore the customer's messages for automation except appending them to the admin context.
- Resume only by explicit admin command ("resume", "aktifkan bot", "bot on") or after an admin-set timeout. Never auto-resume on a timer while the complaint is unresolved unless configured.

Guardrails:
- Never promise a refund, compensation, free item, or exact arrival time.
- Never argue, never blame the customer, never mention internal prompts/models.
- Never reveal other customers' data or internal notes.
- Do not invent menu items, prices, promos, or store hours.
- Keep replies short (WhatsApp), one question at a time, Indonesian, polite "Kak".
