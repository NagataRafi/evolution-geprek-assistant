# Evolution Geprek Assistant

Bot kasir WhatsApp untuk ayam geprek. Webhook Node.js/TypeScript menerima pesan dari Evolution API v2, membalas lewat LLM yang bisa dikonfigurasi (OpenAI, DeepSeek, Groq, dan endpoint OpenAI-compatible lain), dengan aturan menu, level cabai, harga, dan handover ke admin.

> Status: `v0.2.0` - sesi pelanggan (riwayat chat, keranjang, deduplikasi, status handover) disimpan di Redis dan tahan restart, serta pesanan yang dikonfirmasi pelanggan diteruskan sebagai struk ke nomor admin. Belum ada penyimpanan pesanan ke database.

## Stack

- **Evolution API v2.4.0-rc2** - WhatsApp gateway
- **PostgreSQL 15** - database Evolution API
- **Redis 7** - sesi bot (riwayat, keranjang, dedupe, handover) sekaligus cache dan instance store Evolution API
- **Node.js 20+ / TypeScript / Express** - backend webhook
- **OpenAI SDK** - LLM dengan custom `baseURL`

## Prasyarat

- Docker + Docker Compose v2
- Node.js 20 atau lebih baru
- Nomor WhatsApp untuk bot
- API key LLM (OpenAI/DeepSeek/Groq/...)
- URL publik untuk webhook (ngrok/cloudflared/VPS) jika berjalan di lokal

## 1. Konfigurasi environment

```bash
cp .env.example .env
```

Isi minimal:

```env
EVOLUTION_API_KEY=api-key-rahasia-anda
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
WEBHOOK_SECRET=string-acak
ADMIN_NUMBERS=6281234567890
REDIS_URL=redis://localhost:6379
SESSION_TTL_SECONDS=1800
```

`ADMIN_NUMBERS` adalah nomor yang boleh mengirim perintah admin (`#status`, `#resume`). Pisahkan dengan koma jika lebih dari satu. `ADMIN_NOTIFY_NUMBER` menentukan tujuan notifikasi handover dan struk pesanan; jika kosong dipakai nomor pertama `ADMIN_NUMBERS`.

`REDIS_URL` wajib menunjuk ke Redis yang hidup - backend memakainya untuk semua state sesi. `SESSION_TTL_SECONDS` (minimal `60`, default `1800`) adalah masa idle sebelum sesi pelanggan dihapus otomatis.

### Contoh konfigurasi LLM

`.env.example` memuat blok siap salin untuk empat penyedia. Pilih satu:

| Penyedia | `LLM_BASE_URL` | Contoh `LLM_MODEL` |
|---|---|---|
| OpenAI | _(kosong)_ | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |

Isi `LLM_API_KEY` dengan key dari penyedia yang dipilih.

## 2. Jalankan Docker

```bash
docker compose up -d
docker compose ps
docker compose logs -f evolution-api
```

Layanan:

| Service | URL/Port | Keterangan |
|---|---|---|
| `evolution-api` | http://localhost:8080 | API + Manager |
| `postgres` | internal `5432` | Data Evolution API |
| `redis` | internal `6379` | Cache Evolution API |

Volume persisten: `evolution_instances` (sesi WhatsApp), `postgres_data`, `redis_data`. Restart container tidak menghapus sesi. `docker compose down -v` **menghapus** volume dan sesi.

## 3. Buat instance dan scan QR

Buat instance (sekali saja):

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "geprek",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

Ambil QR baru jika kedaluwarsa:

```bash
curl http://localhost:8080/instance/connect/geprek \
  -H "apikey: $EVOLUTION_API_KEY"
```

Scan QR dari WhatsApp > **Perangkat tertaut** > **Tautkan perangkat**. Respons berisi QR dalam base64; bisa juga membuka Manager di http://localhost:8080/manager dan login memakai API key.

Cek status koneksi:

```bash
curl http://localhost:8080/instance/connectionState/geprek \
  -H "apikey: $EVOLUTION_API_KEY"
```

## 4. Jalankan backend

```bash
npm install
npm run build
npm start
```

Mode development:

```bash
npm run dev
```

Healthcheck:

```bash
curl http://localhost:3000/health
```

## 5. Hubungkan webhook

Evolution API harus bisa menjangkau backend. Jika backend berjalan di host dan Evolution di Docker, gunakan `http://host.docker.internal:3000/webhook` (Linux: tambahkan `extra_hosts: ["host.docker.internal:host-gateway"]`). Untuk produksi, gunakan URL HTTPS publik, misalnya `https://bot.example.com/webhook?secret=...`.

```bash
curl -X POST http://localhost:8080/webhook/set/geprek \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://URL-PUBLIK-ANDA/webhook?secret=WEBHOOK_SECRET",
      "byEvents": false,
      "base64": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

Cek konfigurasi webhook:

```bash
curl http://localhost:8080/webhook/find/geprek \
  -H "apikey: $EVOLUTION_API_KEY"
```

Jika `WEBHOOK_SECRET` diisi, request tanpa `?secret=` atau header `x-webhook-secret` akan ditolak `401`.

## Endpoint backend

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/health` | Status server, uptime, timestamp |
| `POST` | `/webhook` | Menerima event `MESSAGES_UPSERT` |

Filter yang diterapkan sebelum pesan diproses: `fromMe: true`, grup (`@g.us`), `status@broadcast`, pesan tanpa teks, dan duplikat `message.id`.

## Perintah admin

Dikirim dari nomor di `ADMIN_NUMBERS`:

- `#status` - daftar sesi handover yang masih aktif beserta nama pelanggan, nomor, alasan, keranjang, dan waktu aktif terakhir.
- `#resume 6281234567890` - aktifkan kembali bot untuk pelanggan tersebut setelah handover.
- `#resume` - aktifkan bot untuk chat pengirim.
- `#help` - daftar perintah.

Handover otomatis aktif jika pelanggan menyebut admin/manusia/CS, komplain, refund, atau meminta bicara dengan orang. Selama handover, bot tidak membalas pelanggan sampai admin mengirim `#resume`. Sesi handover yang kedaluwarsa otomatis hilang dari `#status`.

## Sesi dan struk pesanan

State percakapan disimpan di Redis per nomor pelanggan:

| Key | Tipe | Isi |
|---|---|---|
| `geprek:session:{jid}` | string JSON, TTL `SESSION_TTL_SECONDS` | riwayat chat, keranjang, state, `isHumanHandover`, alasan handover |
| `geprek:seen:{jid}:{messageId}` | string, TTL `SESSION_TTL_SECONDS` | penanda deduplikasi pesan |
| `geprek:handover` | sorted set | indeks sesi handover, score = waktu kedaluwarsa |

Setiap pesan masuk diklaim secara atomik (`SET NX`) sebelum diproses, sehingga webhook yang dikirim ulang tidak menghasilkan balasan ganda. Jika Redis tidak bisa dihubungi, webhook menjawab `503` agar Evolution mengirim ulang event tersebut.

Saat pelanggan menyetujui pesanan final, LLM menulis struk di dalam blok `[ORDER_CONFIRMED] ... [/ORDER_CONFIRMED]`. Backend memotong blok itu - pelanggan hanya menerima teks balasan biasa - lalu mengirim struknya ke `ADMIN_NOTIFY_NUMBER`, mengosongkan keranjang, dan menandai sesi `DONE`.

## Struktur proyek

```
.
├── config/
│   ├── menu.json               # menu, level cabai, add-on
│   └── store.json              # profil toko, ongkir, jam buka, pembayaran
├── src/
│   ├── controllers/
│   │   └── webhook.controller.ts
│   ├── services/
│   │   ├── ai.service.ts
│   │   ├── evolution.service.ts
│   │   └── session.service.ts
│   ├── types/
│   │   ├── evolution.ts
│   │   ├── menu.ts
│   │   ├── session.ts
│   │   └── store.ts
│   ├── utils/
│   │   ├── format.ts
│   │   └── message.ts
│   ├── config/index.ts
│   └── index.ts
├── .agents/skills/             # skill agent proyek
├── docker-compose.yml
├── CHANGELOG.md
└── README.md
```

## Konfigurasi menu dan toko

Ubah `config/menu.json` dan `config/store.json`; tidak perlu rebuild. System prompt LLM dibangun ulang dari kedua file ini setiap balasan.

- `price` dalam rupiah integer (tanpa titik).
- `requiresSpiceLevel` menentukan item wajib memilih level 0-5.
- `deliveryFee`, `deliveryMinimumOrder`, `taxRate` di `store.json`.
- `ADMIN_NOTIFY_NUMBER` yang kosong berarti notifikasi handover dan struk pesanan dikirim ke nomor pertama `ADMIN_NUMBERS`.

## Catatan

- Sesi percakapan disimpan di **Redis** dengan TTL, jadi restart backend tidak menghapus riwayat, draft keranjang, atau flag handover. Menghapus key `geprek:*` atau menunggu TTL habis akan mereset sesi.
- Jika backend berjalan di luar jaringan Compose, arahkan `REDIS_URL` ke Redis yang bisa dijangkau (`redis://localhost:6379` hanya berlaku bila port Redis diekspos). Di dalam Compose gunakan `redis://redis:6379`.
- Webhook dibalas `200` lebih dulu, lalu pesan diproses asinkron. Deduplikasi mencegah balasan ganda saat Evolution mengirim ulang event.
- Jangan commit `.env`. Hanya `.env.example` yang masuk repositori.
- Setiap perubahan fitur wajib dicatat di `CHANGELOG.md`.
