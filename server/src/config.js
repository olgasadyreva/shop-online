import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Загружает .env-файл из server/.env в process.env (если файл существует).
 * Не использует внешние зависимости.
 */
function loadEnv() {
  const envPath = resolve(__dirname, "../.env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

export const port = parseInt(process.env.PORT || "3000", 10);
export const databaseUrl =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/shop_online";
export const limit = parseInt(process.env.LIMIT || "10", 10);
export const maxBodySize = parseInt(process.env.MAX_BODY_SIZE || "2097152", 10);

// Каталог для изображений товаров. По умолчанию — ./image рядом с server/,
// но на хостинге с постоянным диском путь можно переопределить.
export const imageDir = process.env.IMAGE_DIR
  ? resolve(process.env.IMAGE_DIR)
  : resolve(__dirname, "../image");
