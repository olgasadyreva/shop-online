# План разработки серверной части «ShopOnline»

Основание: [task.md](./task.md). Учтён фактический контракт существующего фронтенда
(`src/modules/*`): порт 3000, пути со слэшем, формат ответов, поля запросов.

## Шаги

### 1. Каркас проекта
- Папка `server/` с собственным `package.json` (скрипт `start`, зависимость `pg`).
- `server/.env.example`: `PORT=3000`, `DATABASE_URL`, `LIMIT`.
- `.gitignore` для `.env` и `image/`.
- Корневой скрипт `npm run server` для удобства разработки.

### 2. Слой БД
- Пул `pg` — `server/src/db/pool.js`.
- Схема `goods`: `id BIGINT PK`, `title`, `price NUMERIC`, `description`, `category TEXT`,
  `discount INT`, `count INT`, `units`, `image TEXT`.
- Схема `categories`: `name TEXT PK`.
- Идемпотентная инициализация и импорт из `db_goods.json` / `db_category.json` при пустой таблице.
- Перенос исходных картинок в `./image`.

### 3. HTTP-ядро на встроенном `http`
- Роутер (метод + путь + параметры), нормализация завершающего `/`.
- Парсер JSON-тела с лимитом под base64.
- Общий ответ JSON, обработчик ошибок 400/404/500 в формате `{ error }`.
- Единый `notFound` для неизвестных маршрутов.

### 4. CORS
- Заголовки `Access-Control-Allow-Origin` / `Methods` / `Headers`.
- Корректный ответ на `OPTIONS` (204) до маршрутизации.

### 5. Валидация входных данных
- Обязательные поля при `POST`.
- Типы и диапазоны: `price >= 0`, `count >= 0`, `discount 0..100`.
- Проверка base64: data URI, mime, декодируемость, лимит размера.
- Проверка существования категории.

### 6. Модуль изображений
- Декодирование base64, определение расширения по mime.
- Запись в `./image/<id>.<ext>`, сохранение относительного пути `image/<id>.<ext>` в БД.
- Раздача `GET /image/*` с `content-type` и защитой от path traversal.

### 7. CRUD товаров
- `GET /api/goods` — `search` по `title`/`description` через `ILIKE`, `page >= 1`,
  `limit 10`, ответ `{ goods, page, totalCount }`.
- `GET /api/goods/:id`.
- `POST /api/goods` — 201 + созданный товар.
- `PATCH /api/goods/:id` — частичное обновление, `image` опционален.
- `DELETE /api/goods/:id` — 204.
- Корректные 404 при отсутствии `id`.

### 8. Спецвыборки и категории
- `GET /api/categories` — массив строк.
- `GET /api/goods?discount=true` и `GET /api/goods/discount`.
- `GET /api/goods?category=<name>` и `GET /api/goods/category/:name`.
- `GET /api/total` — сумма `price*count*(1-discount/100)`, округление до 2 знаков,
  число в ответе.

### 9. README.md
- Установка, создание БД в PostgreSQL, настройка `.env`.
- Миграция/сидинг, `npm start`.
- Описание всех эндпоинтов с примерами `curl`.
- Деплой на хостинг.

### 10. Проверка
- Smoke-тесты всех эндпоинтов `curl` (успешные кейсы, 400/404/500, CORS, `OPTIONS`).
- Проверка пагинации и поиска.
- Загрузка/отдача изображения.
- Ручная проверка связки с существующим фронтендом на `localhost:3000`.

## Принятые решения

| Вопрос | Решение |
|---|---|
| Размещение кода | Отдельная папка `server/` со своим `package.json` — не ломает webpack-сборку фронта, позволяет деплоить бэкенд отдельно |
| Фреймворк | Чистый модуль `http` + собственный мини-роутер (ТЗ: без сторонних веб-фреймворков); единственная зависимость — `pg` |
| `id` товара | `BIGINT` (в `db_goods.json` id вида `2074454224`); при `POST` — `nextval` из sequence, чтобы не конфликтовать с импортированными |
| Сумма в `/api/total` | `ROUND(SUM(price * count * (1 - discount/100.0)), 2)` в SQL — без float-погрешностей в JS |
| Поиск | `ILIKE '%search%'` по `title` и `description` с экранированием `%` и `_` |

## Контракты, продиктованные фронтендом

- Порт **3000** (`API_URL = http://localhost:3000/` в `src/modules/const.js`).
- Пути вызываются **со слэшем в конце**: `api/goods/`, `api/categories/`, `api/total/`.
- `GET /api/goods` должен возвращать объект `{ goods, page, totalCount }`
  (используется в `render.js` и `pagination.js`), а не «голый» массив из ТЗ.
- `GET /api/total` возвращает **число** (`summs.js` вызывает `totalSum.toFixed(2)`).
- `GET /api/categories` возвращает **массив строк** (`category.js` → `option.value = category`).
- `PATCH /api/goods/:id` может присылать `discount: false` (чекбокс снят) и `image: null`
  (файл не выбран) — это валидные значения, а не ошибка.
- `POST /api/goods` может содержать лишние поля (`id`, `discont`) — игнорировать,
  `id` генерирует БД.
- `image` приходит как data URI (`FileReader.readAsDataURL`), лимит на клиенте — 1 МБ.
- Картинки раздаются с корня (`${API_URL}${data.image}`), в БД хранится `image/<id>.<ext>`.
