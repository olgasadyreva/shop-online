import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db/pool.js";
import { imageDir, limit as _limit, port } from "./config.js";
import Router from "./router.js";
import parseBody from "./body.js";
import { sendJSON, sendError } from "./response.js";
import { initDB } from "./db/init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Пути к статике
const IMG_DIR = imageDir;
// Резервный каталог с исходными изображениями (может отсутствовать на хостинге)
const SRC_IMG_DIR = resolve(__dirname, "../../src/image");

/**
 * CORS-обработчик. Вызывается до маршрутизации.
 */
function applyCORS(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

// Допустимые типы изображений и соответствующие расширения файлов
const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 1048576;
const IMAGE_NAME_RE = /^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|gif|webp)$/i;

/**
 * Проверяет и декодирует data URI изображения.
 * Бросает Error с понятным сообщением при любой проблеме.
 * @param {string} imageBase64 — строка вида data:image/jpeg;base64,....
 * @returns {{mime: string, ext: string, base64: string, buffer: Buffer}}
 */
function decodeImageData(imageBase64) {
  if (typeof imageBase64 !== "string") {
    throw new Error("ожидается строка в формате data URI (base64)");
  }
  const match = imageBase64.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new Error("некорректный формат base64 (data URI)");
  }
  const mime = match[1].toLowerCase();
  const ext = MIME_TO_EXT[mime];
  if (!ext) {
    throw new Error(`неподдерживаемый тип изображения: ${mime}`);
  }
  const base64 = match[2].replace(/\s+/g, "");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) {
    throw new Error("пустое изображение");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("размер файла превышает 1 МБ");
  }
  return { mime, ext, base64, buffer };
}

/**
 * Проверяет, что по пути лежит обычный файл.
 */
function isFile(filePath) {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Достаёт изображение из БД, если файла нет на диске
 * (на Render диск контейнера эфемерный и очищается при перезапуске).
 * @param {string} filename — имя вида <id>.<ext>
 * @returns {Promise<{buffer: Buffer, mime: string} | null>}
 */
async function loadImageFromDB(filename) {
  const match = filename.match(/^(\d+)\.(jpg|jpeg|png|gif|webp)$/i);
  if (!match) return null;

  const { rows } = await query(
    "SELECT mime, data FROM goods_images WHERE goods_id = $1",
    [match[1]],
  );
  if (rows.length === 0) return null;

  const buffer = Buffer.from(rows[0].data, "base64");
  if (buffer.length === 0) return null;

  // Заодно восстанавливаем файл на диске, чтобы не ходить в БД каждый раз.
  try {
    mkdirSync(IMG_DIR, { recursive: true });
    writeFileSync(resolve(IMG_DIR, filename), buffer);
  } catch (err) {
    console.error(`Не удалось закешировать изображение ${filename}:`, err.message);
  }

  return { buffer, mime: rows[0].mime };
}

/**
 * Раздача изображений: сначала рабочий каталог, затем БД, затем src/image.
 * Защищает от path traversal.
 */
async function serveImage(res, filename) {
  if (!IMAGE_NAME_RE.test(filename)) {
    sendError(res, 400, "Недопустимое имя файла");
    return;
  }
  const filePath = resolve(IMG_DIR, filename);
  if (!filePath.startsWith(IMG_DIR)) {
    sendError(res, 403, "Доступ запрещён");
    return;
  }
  if (isFile(filePath)) {
    sendImageFile(res, filePath);
    return;
  }

  const fromDb = await loadImageFromDB(filename);
  if (fromDb) {
    sendImageBuffer(res, fromDb.buffer, fromDb.mime);
    return;
  }

  const fallbackPath = resolve(SRC_IMG_DIR, filename);
  if (fallbackPath.startsWith(SRC_IMG_DIR) && isFile(fallbackPath)) {
    sendImageFile(res, fallbackPath);
    return;
  }

  sendError(res, 404, "Изображение не найдено");
}

/**
 * Отдаёт файл изображения с корректным Content-Type и кешированием.
 */
function sendImageFile(res, filePath) {
  const ext = extname(filePath).slice(1).toLowerCase();
  const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  res.writeHead(200, {
    "Content-Type": mimeMap[ext] || "application/octet-stream",
    "Content-Length": statSync(filePath).size,
    "Cache-Control": "public, max-age=86400",
  });
  createReadStream(filePath).pipe(res);
}

/**
 * Отдаёт изображение из памяти (когда файла на диске нет).
 */
function sendImageBuffer(res, buffer, mime) {
  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": buffer.length,
    "Cache-Control": "public, max-age=86400",
  });
  res.end(buffer);
}

/**
 * Сохранение изображения в ./image/<id>.<ext> и в БД (goods_images).
 * Копия в БД нужна, чтобы картинка пережила перезапуск контейнера на Render.
 * @param {number|string} id — идентификатор товара
 * @param {{buffer: Buffer, base64: string, mime: string, ext: string}} decoded
 * @returns {Promise<string>} относительный путь к файлу
 */
async function saveImage(id, decoded) {
  const filename = `${id}.${decoded.ext}`;
  const filePath = resolve(IMG_DIR, filename);

  try {
    mkdirSync(IMG_DIR, { recursive: true });
    writeFileSync(filePath, decoded.buffer);
  } catch (err) {
    // Файловая система может быть только для чтения — тогда работает
    // раздача из БД, поэтому не считаем это фатальной ошибкой.
    console.error(`Не удалось записать изображение на диск (${filePath}):`, err.message);
  }

  await query(
    `INSERT INTO goods_images (goods_id, mime, data) VALUES ($1, $2, $3)
     ON CONFLICT (goods_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data`,
    [id, decoded.mime, decoded.base64],
  );

  return `image/${filename}`;
}

/**
 * Идентификатор товара для SQL: только положительное число в пределах BIGINT.
 * @returns {string|null}
 */
const BIGINT_MAX = 9223372036854775807n;
function parseId(raw) {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  try {
    const value = BigInt(raw);
    if (value <= 0n || value > BIGINT_MAX) return null;
  } catch {
    return null;
  }
  return raw;
}

/**
 * Валидация категории: существует ли она в БД.
 */
async function validateCategory(category) {
  if (!category || typeof category !== "string" || category.trim().length === 0) {
    return "Поле category обязательно и должно быть непустой строкой";
  }
  const { rows } = await query("SELECT 1 FROM categories WHERE name = $1", [category]);
  if (rows.length === 0) {
    return `Категория не найдена: ${category}`;
  }
  return null;
}

/**
 * Валидация товара (для POST/PATCH).
 */
function validateGoodsBody(body, isPatch) {
  const errors = [];

  if (!isPatch) {
    if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      errors.push("title обязателен и должен быть непустой строкой");
    }
    if (body.price === undefined || body.price === null) {
      errors.push("price обязателен");
    }
  }

  if (body.price !== undefined && body.price !== null) {
    if (typeof body.price !== "number" || body.price < 0) {
      errors.push("price должно быть числом >= 0");
    }
  }

  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    errors.push("description должно быть строкой");
  }

  if (body.discount !== undefined && body.discount !== null) {
    const d = body.discount;
    if (d === false || d === "false") {
      body.discount = 0;
    } else if (typeof d !== "number" || d < 0 || d > 100) {
      errors.push("discount должно быть числом от 0 до 100");
    }
  }

  if (body.count !== undefined && body.count !== null) {
    const c = body.count;
    if (typeof c !== "number" || c < 0) {
      errors.push("count должно быть числом >= 0");
    }
  }

  if (body.units !== undefined && body.units !== null && typeof body.units !== "string") {
    errors.push("units должно быть строкой");
  }

  if (body.image !== undefined && body.image !== null && body.image !== false && body.image !== "false") {
    // Проверяем формат, тип и размер ДО записи в БД, иначе при ошибке
    // остаётся товар без изображения.
    try {
      decodeImageData(body.image);
    } catch (err) {
      errors.push("image: " + err.message);
    }
  }

  return errors;
}

/**
 * Создаёт HTTP-сервер и запускает его.
 */
async function start() {
  try {
    await initDB();
  } catch (err) {
    console.error("Ошибка инициализации БД:", err.message);
    process.exit(1);
  }

  const router = new Router();

  // ---- Категории ----
  const listCategories = async (req, res) => {
    try {
      const { rows } = await query("SELECT name FROM categories ORDER BY name");
      sendJSON(res, 200, rows.map((r) => r.name));
    } catch (err) {
      console.error("GET /api/categories error:", err);
      sendError(res, 500, "Ошибка сервера");
    }
  };
  router.add("GET", "/api/categories", listCategories);

  // ---- Товары: GET /api/goods (список) ----
  router.add("GET", "/api/goods", async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const search = url.searchParams.get("search") || "";
      // Некорректный page (не число) не должен превращаться в NaN и ронять запрос.
      const parsedPage = parseInt(url.searchParams.get("page") || "1", 10);
      const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
      const limit = _limit;
      const offset = (page - 1) * limit;

      let where = [];
      let params = [];

      if (search.trim()) {
        const escaped = search.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
        where.push(`(title ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)`);
        params.push(`%${escaped}%`);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

      const { rows: countRows } = await query(
        `SELECT COUNT(*)::int AS total FROM goods ${whereClause}`,
        params,
      );
      const totalCount = countRows[0].total;
      const totalPage = Math.max(1, Math.ceil(totalCount / limit));

      const { rows } = await query(
        `SELECT * FROM goods ${whereClause} ORDER BY id LIMIT $${where.length + 1} OFFSET $${where.length + 2}`,
        [...params, limit, offset],
      );

      sendJSON(res, 200, { goods: rows, page, totalCount, totalPage });
    } catch (err) {
      console.error("GET /api/goods error:", err);
      sendError(res, 500, "Ошибка сервера");
    }
  });

  // ---- Товары: POST /api/goods (создание) ----
  router.add("POST", "/api/goods", async (req, res) => {
    try {
      const body = await parseBody(req);
      const errors = validateGoodsBody(body, false);
      if (errors.length > 0) {
        sendError(res, 400, errors.join("; "));
        return;
      }

      const catErr = await validateCategory(body.category);
      if (catErr) {
        sendError(res, 400, catErr);
        return;
      }

      const values = [
        body.title,
        body.price,
        body.description || "",
        body.category,
        body.discount || 0,
        body.count || 0,
        body.units || "шт",
        null,
      ];

      const { rows } = await query(
        `INSERT INTO goods (title, price, description, category, discount, count, units, image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        values,
      );

      const item = rows[0];

      // Сохраняем изображение после получения id
      if (body.image && typeof body.image === "string" && body.image.startsWith("data:")) {
        let decoded;
        try {
          decoded = decodeImageData(body.image);
        } catch (e) {
          await query("DELETE FROM goods WHERE id = $1", [item.id]).catch(() => {});
          sendError(res, 400, "Ошибка сохранения изображения: " + e.message);
          return;
        }
        try {
          const image = await saveImage(item.id, decoded);
          await query("UPDATE goods SET image = $1 WHERE id = $2", [image, item.id]);
          item.image = image;
        } catch (e) {
          // Не оставляем товар-сироту без картинки.
          await query("DELETE FROM goods WHERE id = $1", [item.id]).catch(() => {});
          sendError(res, 400, "Ошибка сохранения изображения: " + e.message);
          return;
        }
      }

      sendJSON(res, 201, item);
    } catch (err) {
      if (err.message === "Тело запроса слишком большое") {
        sendError(res, 413, err.message);
      } else if (err.message === "Некорректный JSON в теле запроса") {
        sendError(res, 400, err.message);
      } else {
        console.error("POST /api/goods error:", err);
        sendError(res, 500, "Ошибка сервера");
      }
    }
  });

  // ---- Спецвыборки (регистрируются ДО /:id, чтобы не матчились как id) ----

  // Дисконтные товары: GET /api/goods/discount
  router.add("GET", "/api/goods/discount", async (req, res) => {
    try {
      const { rows } = await query("SELECT * FROM goods WHERE discount > 0 ORDER BY id");
      sendJSON(res, 200, rows);
    } catch (err) {
      console.error("GET /api/goods/discount error:", err);
      sendError(res, 500, "Ошибка сервера");
    }
  });

  // Товары по категории: GET /api/goods/categories/:category
  const goodsByCategory = async (req, res, params) => {
    try {
      const { rows } = await query("SELECT * FROM goods WHERE category = $1 ORDER BY id", [params.category]);
      sendJSON(res, 200, rows);
    } catch (err) {
      console.error("GET /api/goods/categories/:category error:", err);
      sendError(res, 500, "Ошибка сервера");
    }
  };
  // Список категорий: GET /api/goods/categories (без параметра)
  router.add("GET", "/api/goods/categories", listCategories);
  router.add("GET", "/api/goods/categories/:category", goodsByCategory);
  // Совместимость со старым адресом
  router.add("GET", "/api/goods/category/:category", goodsByCategory);

  // ---- Товар: GET /api/goods/:id ----
  router.add("GET", "/api/goods/:id", async (req, res, params) => {
    try {
      const id = parseId(params.id);
      if (!id) {
        sendError(res, 404, "Товар не найден");
        return;
      }
      const { rows } = await query("SELECT * FROM goods WHERE id = $1", [id]);
      if (rows.length === 0) {
        sendError(res, 404, "Товар не найден");
        return;
      }
      sendJSON(res, 200, rows[0]);
    } catch (err) {
      console.error("GET /api/goods/:id error:", err);
      sendError(res, 500, "Ошибка сервера");
    }
  });

  // ---- Товар: PATCH /api/goods/:id ----
  router.add("PATCH", "/api/goods/:id", async (req, res, params) => {
    try {
      const id = parseId(params.id);
      if (!id) {
        sendError(res, 404, "Товар не найден");
        return;
      }

      const body = await parseBody(req);
      const errors = validateGoodsBody(body, true);
      if (errors.length > 0) {
        sendError(res, 400, errors.join("; "));
        return;
      }

      const { rows: existing } = await query("SELECT * FROM goods WHERE id = $1", [id]);
      if (existing.length === 0) {
        sendError(res, 404, "Товар не найден");
        return;
      }

      const item = existing[0];

      if (body.category !== undefined && body.category !== null && body.category !== false) {
        const catErr = await validateCategory(body.category);
        if (catErr) {
          sendError(res, 400, catErr);
          return;
        }
      }

      const updates = [];
      const values = [];
      let idx = 1;

      for (const field of ["title", "price", "description", "category", "discount", "count", "units"]) {
        const val = body[field];
        if (val !== undefined && val !== null && val !== false && val !== "false") {
          updates.push(`${field} = $${idx++}`);
          values.push(val);
        }
      }

      if (body.image !== undefined && body.image !== null && body.image !== false && body.image !== "false") {
        if (typeof body.image === "string" && body.image.startsWith("data:")) {
          try {
            const decoded = decodeImageData(body.image);
            const newImage = await saveImage(item.id, decoded);
            updates.push(`image = $${idx++}`);
            values.push(newImage);
          } catch (e) {
            sendError(res, 400, "Ошибка сохранения изображения: " + e.message);
            return;
          }
        } else if (typeof body.image === "string") {
          sendError(res, 400, "image: строка должна быть в формате data URI (base64)");
          return;
        }
      }

      if (updates.length === 0) {
        sendJSON(res, 200, item);
        return;
      }

      values.push(item.id);
      const { rows } = await query(
        `UPDATE goods SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
        values,
      );
      sendJSON(res, 200, rows[0]);
    } catch (err) {
      if (err.message === "Тело запроса слишком большое") {
        sendError(res, 413, err.message);
      } else if (err.message === "Некорректный JSON в теле запроса") {
        sendError(res, 400, err.message);
      } else {
        console.error("PATCH /api/goods/:id error:", err);
        sendError(res, 500, "Ошибка сервера");
      }
    }
  });

  // ---- Товар: DELETE /api/goods/:id ----
  router.add("DELETE", "/api/goods/:id", async (req, res, params) => {
    try {
      const id = parseId(params.id);
      if (!id) {
        sendError(res, 404, "Товар не найден");
        return;
      }
      const { rows } = await query("DELETE FROM goods WHERE id = $1 RETURNING *", [id]);
      if (rows.length === 0) {
        sendError(res, 404, "Товар не найден");
        return;
      }
      res.writeHead(204);
      res.end();
    } catch (err) {
      console.error("DELETE /api/goods/:id error:", err);
      sendError(res, 500, "Ошибка сервера");
    }
  });

  // ---- Общая стоимость: GET /api/total ----
  router.add("GET", "/api/total", async (req, res) => {
    try {
      const { rows } = await query(
        "SELECT ROUND(COALESCE(SUM(price * count * (1 - COALESCE(discount, 0) / 100.0)), 0), 2)::float AS total FROM goods",
      );
      sendJSON(res, 200, rows[0].total);
    } catch (err) {
      console.error("GET /api/total error:", err);
      sendError(res, 500, "Ошибка сервера");
    }
  });

  // ---- HTTP-сервер ----
  const server = createServer(async (req, res) => {
    if (applyCORS(req, res)) return;

    try {
      // Раздача изображений: GET /image/<filename>
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (req.method === "GET" && url.pathname.startsWith("/image/")) {
        const filename = url.pathname.slice("/image/".length);
        await serveImage(res, filename);
        return;
      }

      // Маршрутизация
      const dispatched = await router.dispatch(req, res);
      if (!dispatched) {
        sendError(res, 404, "Маршрут не найден");
      }
    } catch (err) {
      console.error(`Ошибка на ${req.method} ${req.url}:`, err);
      if (!res.headersSent) {
        sendError(res, 500, "Внутренняя ошибка сервера");
      }
    }
  });

  server.listen(port, () => {
    console.log(`Сервер запущен: http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Не удалось запустить сервер:", err);
  process.exit(1);
});
