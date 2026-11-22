# Changelog

Semua perubahan penting pada proyek ini dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/),
dan versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

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
