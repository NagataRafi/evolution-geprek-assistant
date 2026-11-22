import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import type { MenuConfig } from "../types/menu";
import type { StoreConfig } from "../types/store";

const CONFIG_DIR = process.env.CONFIG_DIR
  ? path.resolve(process.env.CONFIG_DIR)
  : path.resolve(process.cwd(), "config");

function readJsonFile<T>(fileName: string): T {
  const filePath = path.join(CONFIG_DIR, fileName);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Gagal membaca konfigurasi ${filePath}: ${reason}`);
  }
}

function parsePort(raw: string | undefined): number {
  const port = Number.parseInt(raw ?? "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT tidak valid: ${raw}`);
  }
  return port;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

function parsePhoneList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => normalizePhone(value.trim()))
    .filter((value) => value.length > 0);
}

const apiUrl = (process.env.EVOLUTION_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");

export const env = {
  port: parsePort(process.env.PORT),
  nodeEnv: process.env.NODE_ENV ?? "development",
  evolutionApiUrl: apiUrl,
  evolutionApiKey: process.env.EVOLUTION_API_KEY ?? "",
  evolutionInstance: process.env.EVOLUTION_INSTANCE ?? "geprek",
  webhookUrl: process.env.WEBHOOK_URL ?? "",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmBaseUrl: (process.env.LLM_BASE_URL ?? "").replace(/\/+$/, ""),
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  adminNumbers: parsePhoneList(process.env.ADMIN_NUMBERS),
  adminNotifyNumber: normalizePhone(process.env.ADMIN_NOTIFY_NUMBER ?? ""),
} as const;

export function getMenuConfig(): MenuConfig {
  const menu = readJsonFile<MenuConfig>("menu.json");

  if (!Array.isArray(menu.items) || !Array.isArray(menu.spiceLevels)) {
    throw new Error("config/menu.json harus memiliki array items dan spiceLevels");
  }

  return menu;
}

export function getStoreConfig(): StoreConfig {
  const store = readJsonFile<StoreConfig>("store.json");

  if (!store.name || !Array.isArray(store.operatingHours)) {
    throw new Error("config/store.json harus memiliki name dan operatingHours");
  }

  return store;
}
