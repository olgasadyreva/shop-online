import { readFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./pool.js";
import { imageDir } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Корень репозитория (локально) и корень серверной папки (на хостинге с Root Directory = server)
const REPO_ROOT = resolve(__dirname, "../../..");
const SERVER_ROOT = resolve(__dirname, "../..");

/**
 * Ищет файл в нескольких возможных местах и возвращает первый существующий.
 */
function findFile(name, dirs) {
  for (const dir of dirs) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return join(dirs[0], name);
}

const GOODS_JSON = findFile("db_goods.json", [SERVER_ROOT, REPO_ROOT]);
const CATEGORY_JSON = findFile("db_category.json", [SERVER_ROOT, REPO_ROOT]);

// Изображения: рабочий каталог (по умолчанию server/image) и исходный src/image (если доступен)
const IMG_DIR = imageDir;
const SRC_IMAGE_DIR = join(REPO_ROOT, "src", "image");

// DDL-схемы
const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY
);

CREATE SEQUENCE IF NOT EXISTS goods_id_seq START 1000;

CREATE TABLE IF NOT EXISTS goods (
  id          BIGINT       PRIMARY KEY DEFAULT nextval('goods_id_seq'),
  title       TEXT         NOT NULL,
  price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT         NOT NULL DEFAULT '',
  category    TEXT         NOT NULL REFERENCES categories(name),
  discount    INT          NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
  count       INT          NOT NULL DEFAULT 0 CHECK (count >= 0),
  units       TEXT         NOT NULL DEFAULT 'шт',
  image       TEXT
);

CREATE INDEX IF NOT EXISTS idx_goods_category ON goods(category);
CREATE INDEX IF NOT EXISTS idx_goods_discount ON goods(discount) WHERE discount > 0;

-- Резервная копия загруженных изображений: на Render диск контейнера
-- эфемерный, поэтому файл в ./image может исчезнуть после перезапуска.
CREATE TABLE IF NOT EXISTS goods_images (
  goods_id BIGINT PRIMARY KEY REFERENCES goods(id) ON DELETE CASCADE,
  mime     TEXT NOT NULL,
  data     TEXT NOT NULL
);
`;

/**
 * Синхронизирует изображения в рабочий каталог server/image.
 * Вызывается при каждом старте, т.к. на хостингах (Render) файловая
 * система контейнера эфемерна и очищается при перезапуске.
 */
function syncImages() {
  if (!existsSync(IMG_DIR)) {
    mkdirSync(IMG_DIR, { recursive: true });
  }

  // Исходные изображения могут лежать в server/image (закоммичены)
  // и/или в src/image (локальная разработка)
  const imageSources = [IMG_DIR, SRC_IMAGE_DIR].filter(
    (p) => p && existsSync(p),
  );

  for (const src of imageSources) {
    const files = readdirSync(src);
    let copied = 0;
    for (const file of files) {
      const dest = join(IMG_DIR, file);
      if (src !== IMG_DIR && !existsSync(dest)) {
        copyFileSync(join(src, file), dest);
        copied++;
      }
    }
    if (copied > 0) {
      console.log(`Скопировано ${copied} изображений из ${src} в ${IMG_DIR}`);
    }
  }
}

/**
 * Идемпотентная инициализация БД:
 * 1. Создаёт таблицы и индексы (если отсутствуют).
 * 2. Если таблица goods пуста — импортирует данные из JSON.
 * 3. Всегда синхронизирует изображения в server/image.
 */
async function initDB() {
  // Изображения нужны всегда, независимо от того, есть ли данные в БД
  syncImages();

  const client = await connect();
  try {
    console.log("Инициализация схемы...");
    await client.query(SCHEMA);

    // Проверка: нужно ли импортировать данные?
    const { rows } = await client.query("SELECT COUNT(*)::int AS cnt FROM goods");
    if (rows[0].cnt > 0) {
      console.log(`В таблице goods уже ${rows[0].cnt} записей. Импорт пропущен.`);
      return;
    }

    // Читаем JSON
    const categories = JSON.parse(readFileSync(CATEGORY_JSON, "utf8"));
    const goods = JSON.parse(readFileSync(GOODS_JSON, "utf8"));

    console.log(`Импорт ${categories.length} категорий и ${goods.length} товаров...`);

    // Импорт категорий
    for (const name of categories) {
      await client.query(
        "INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING",
        [name],
      );
    }

    // Импорт товаров
    for (const g of goods) {
      await client.query(
        `INSERT INTO goods (id, title, price, description, category, discount, count, units, image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          g.id,
          g.title,
          g.price,
          g.description,
          g.category,
          g.discount,
          g.count,
          g.units,
          g.image,
        ],
      );
    }

    // Обновляем sequence, чтобы следующий id не конфликтовал с импортированными
    const maxIdResult = await client.query("SELECT MAX(id)::bigint AS max_id FROM goods");
    const maxId = maxIdResult.rows[0].max_id || 999;
    await client.query(
      "SELECT setval('goods_id_seq', $1)",
      [Number(maxId) + 1],
    );

    console.log("Импорт завершён.");
  } finally {
    client.release();
  }
}

export { initDB };
