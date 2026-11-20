import { createServer } from "node:http";
import { stat as _stat, createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db/pool.js";
import { limit as _limit, port } from "./config.js";
import Router from "./router.js";
import parseBody from "./body.js";
import { sendJSON, sendError } from "./response.js";
import { initDB } from "./db/init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Пути к статике
const IMG_DIR = resolve(__dirname, "../image");

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

/**
 * Раздача изображений из директории server/image.
 * Защищает от path traversal.
 */
function serveImage(req, res, filename) {
  if (!/^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
    sendError(res, 400, "Недопустимое имя файла");
    return;
  }
  const filePath = resolve(IMG_DIR, filename);
  if (!filePath.startsWith(IMG_DIR)) {
    sendError(res, 403, "Доступ запрещён");
    return;
  }
  _stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendError(res, 404, "Изображение не найдено");
      return;
    }
    const ext = extname(filePath).slice(1).toLowerCase();
    const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
    res.writeHead(200, {
      "Content-Type": mimeMap[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    });
    createReadStream(filePath).pipe(res);
  });
}

/**
 * Сохранение изображения: декодирует base64 (data URI), записывает в ./image/<id>.<ext>.
 * Возвращает относительный путь image/<id>.<ext>.
 * @param {number|string|null} id — идентификатор товара (null для новых, вставится после INSERT)
 * @param {string} imageBase64
 * @returns {Promise<string>} относительный путь к файлу
 */
async function saveImage(id, imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== "string") return null;
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Некорректный формат изображения (ожидается data URI)");

  const mimeType = match[1];
  const base64Data = match[2];
  const binary = Buffer.from(base64Data, "base64");

  const mimeToExt = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  const ext = mimeToExt[mimeType];
  if (!ext) throw new Error("Неподдерживаемый тип изображения: " + mimeType);

  const filename = `${id}.${ext}`;
  const filePath = resolve(IMG_DIR, filename);
  mkdirSync(IMG_DIR, { recursive: true });
  writeFileSync(filePath, binary);
  return `image/${filename}`;
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
    if (typeof body.image === "string") {
      if (body.image.startsWith("data:")) {
        try {
          const m = body.image.match(/^data:([^;]+);base64,(.+)$/);
          if (!m) {
            errors.push("image: некорректный формат base64 (data URI)");
          } else {
            const binary = Buffer.from(m[2], "base64");
            if (binary.length > 1048576) {
              errors.push("image: размер файла превышает 1 МБ");
            }
          }
        } catch {
          errors.push("image: некорректный формат base64");
        }
      } else {
        errors.push("image: строка должна быть в формате data URI (base64)");
      }
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
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
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
        try {
          const image = await saveImage(item.id, body.image);
          await query("UPDATE goods SET image = $1 WHERE id = $2", [image, item.id]);
          item.image = image;
        } catch (e) {
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
      const { rows } = await query("SELECT * FROM goods WHERE id = $1", [params.id]);
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
      const body = await parseBody(req);
      const errors = validateGoodsBody(body, true);
      if (errors.length > 0) {
        sendError(res, 400, errors.join("; "));
        return;
      }

      const { rows: existing } = await query("SELECT * FROM goods WHERE id = $1", [params.id]);
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
            const newImage = await saveImage(item.id, body.image);
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
      const { rows } = await query("DELETE FROM goods WHERE id = $1 RETURNING *", [params.id]);
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
        serveImage(req, res, filename);
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
