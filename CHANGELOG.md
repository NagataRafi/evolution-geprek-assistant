# Changelog

Semua perubahan penting pada proyek ini dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/),
dan versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

## [0.2.0] - 2026-11-22

### Added

- Persistensi sesi ke Redis melalui `ioredis`. Riwayat chat, draft keranjang, penanda deduplikasi, dan status handover kini bertahan saat backend di-restart, dengan masa idle diatur `SESSION_TTL_SECONDS` (default 1800 detik).
- Variabel `REDIS_URL` dan `SESSION_TTL_SECONDS` pada konfigurasi environment.
- Perintah admin `#status` untuk melihat daftar sesi handover yang masih aktif (nama, nomor, alasan, isi keranjang, waktu aktif terakhir). Perintah ini juga membersihkan entri handover yang sudah kedaluwarsa.
- Struk pesanan otomatis: saat pelanggan menyetujui pesanan final, LLM mengirim blok `[ORDER_CONFIRMED]` yang dipotong dari balasan pelanggan lalu diteruskan ke `ADMIN_NOTIFY_NUMBER` sebagai struk.
- Contoh konfigurasi empat penyedia LLM (OpenAI, DeepSeek, Groq, Gemini) di `.env.example`.

### Changed

- `session.service.ts` sekarang menyimpan seluruh state di Redis (JSON per nomor + sorted set indeks handover) dan seluruh API-nya menjadi asinkron.
- Deduplikasi pesan memakai `SET NX` atomik sehingga webhook yang dikirim ulang tidak bisa menghasilkan dua balasan pada saat bersamaan.
- Setelah pesanan dikonfirmasi, keranjang dikosongkan dan state sesi menjadi `DONE`.
- `config/menu.json` dirapikan formatnya sebagai template v0.2.0 (konsisten dengan `config/store.json`).

### Fixed

- Riwayat percakapan kini konsisten: pesan pelanggan terbaru ikut terkirim ke LLM setelah sesi dipindahkan ke Redis.

### Security

- Jika Redis tidak dapat dihubungi saat memproses webhook, server menjawab `503` agar Evolution mengirim ulang event, bukan memproses pesan tanpa deduplikasi.

### Notes

- Backend kini membutuhkan Redis yang hidup. Di Docker Compose gunakan `REDIS_URL=redis://redis:6379`; untuk backend di host, ekspos port Redis terlebih dahulu.
- Belum ada persistensi pesanan, pembayaran, atau laporan penjualan.

## [0.1.0] - 2026-11-22

### Added

- Inisialisasi agent skills proyek: `caveman`, `ponytail`, `codebase`, `evolution-api-webhook`, dan `geprek-admin-logic` di `.agents/skills/`.
- Setup Docker Compose: Evolution API `v2.4.0-rc2` pada port `8080`, PostgreSQL 15, Redis 7, healthcheck, dan volume persisten (`evolution_instances`, `postgres_data`, `redis_data`).
- Kerangka backend webhook modular Node.js + TypeScript + Express:
  - `src/index.ts` dengan endpoint `GET /health`.
  - `src/controllers/webhook.controller.ts` dengan filter `fromMe`, grup, `status@broadcast`, deduplikasi `message.id`, deteksi handover, dan perintah admin `#resume`.
  - `src/services/evolution.service.ts` untuk `/message/sendText/{instance}`, status `composing`, dan `/webhook/set/{instance}`.
  - `src/services/session.service.ts` untuk sesi per nomor, riwayat, draft keranjang, deduplikasi, dan flag `isHumanHandover`.
  - `src/services/ai.service.ts` untuk LLM OpenAI-compatible dengan system prompt dinamis dari konfigurasi.
  - Definisi tipe payload Evolution API v2, menu, keranjang, dan sesi.
- Konfigurasi domain: `config/menu.json` (menu, level cabai 0-5, add-on) dan `config/store.json` (profil toko, jam operasional, ongkir, pembayaran, template handover).
- Dokumen proyek: `README.md`, `.env.example`, `tsconfig.json`, `.gitignore`.

### Notes

- Sesi percakapan masih in-memory dan hilang saat backend restart.
- Belum ada persistensi pesanan, pembayaran, atau laporan penjualan.

## Cara mencatat perubahan

Setiap perubahan fitur, perbaikan bug, atau perubahan konfigurasi yang berdampak ke pengguna **wajib** dicatat sebelum commit:

1. Tambahkan entri di bawah `## [Unreleased]` pada kategori yang sesuai:
   - `### Added` untuk fitur baru.
   - `### Changed` untuk perubahan perilaku.
   - `### Fixed` untuk perbaikan bug.
   - `### Removed` untuk fitur yang dihapus.
   - `### Security` untuk perbaikan keamanan.
2. Tulis dalam bahasa yang menjelaskan **dampak ke pengguna**, bukan detail commit.
3. Saat rilis, ganti `Unreleased` menjadi versi dan tanggal, lalu buat section `Unreleased` baru.
