import { request as _request } from "node:http";

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = _request(
      {
        hostname: "localhost",
        port: 3000,
        path,
        method,
        headers: data
          ? { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let chunks = "";
        res.on("data", (c) => (chunks += c));
        res.on("end", () => {
          let parsed = null;
          try { parsed = JSON.parse(chunks); } catch { parsed = chunks; }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} | ${name} | ${detail}`);
}

(async () => {
  // ---- Фронтенд-контракты ----

  // 1. GET /api/goods возвращает { goods, page, totalCount } — фронт делает data.goods, data.page
  let r = await request("GET", "/api/goods?page=1");
  check("Фронт: data.goods — массив", Array.isArray(r.body.goods), `type=${typeof r.body.goods}, len=${r.body.goods?.length}`);
  check("Фронт: data.page — число", typeof r.body.page === "number", `page=${r.body.page}`);
  check("Фронт: data.totalCount — число", typeof r.body.totalCount === "number", `totalCount=${r.body.totalCount}`);

  // 2. GET /api/total возвращает число — фронт делает totalSum.toFixed(2)
  r = await request("GET", "/api/total");
  check("Фронт: total — число", typeof r.body === "number", `body=${r.body}, toFixed=${Number(r.body).toFixed(2)}`);

  // 3. GET /api/categories возвращает массив строк — фронт делает option.value = category
  r = await request("GET", "/api/categories");
  check("Фронт: categories — массив строк", Array.isArray(r.body) && r.body.every((c) => typeof c === "string"), `len=${r.body.length}`);

  // 4. POST — фронт присылает лишние поля (id, discont) — не должно ломать
  r = await request("POST", "/api/goods", {
    title: "Фронт-товар",
    price: 100,
    description: "test",
    category: "Игрушки",
    discount: 5,
    count: 1,
    units: "шт",
    id: "12345",  // фронт присылает случайно сгенерированный id
    discont: "5", // фронт может прислать discont вместо discount
  });
  check("Фронт: POST с лишними полями (id, discont) — 201", r.status === 201, `status=${r.status}`);
  const frontId = r.body?.id;

  // 5. PATCH — фронт присылает discount: false и image: null
  r = await request("PATCH", `/api/goods/${frontId}`, {
    price: 200,
    discount: false,
    image: null,
  });
  check("Фронт: PATCH с discount:false и image:null — 200", r.status === 200 && r.body.discount === 0, `status=${r.status}, discount=${r.body.discount}`);

  // 6. PATCH — фронт присылает image: false (чекбокс снят)
  r = await request("PATCH", `/api/goods/${frontId}`, {
    discount: false,
    image: false,
  });
  check("Фронт: PATCH с image:false — 200", r.status === 200, `status=${r.status}`);

  // 7. DELETE — фронт вызывает fetch(GOODS_URL + id, { method: "DELETE" })
  r = await request("DELETE", `/api/goods/${frontId}`);
  check("Фронт: DELETE — 204", r.status === 204, `status=${r.status}`);

  // 8. GET /api/goods/:id — фронт для картинки: `${API_URL}${data.image}`
  r = await request("GET", "/api/goods/2074454224");
  check("Фронт: data.image для URL картинки", r.body.image === "image/2074454224.jpg", `image=${r.body.image}`);

  // 9. GET /image/<file> — фронт открывает картинку в новом окне
  r = await request("GET", "/image/2074454224.jpg");
  check("Фронт: GET /image/ — 200", r.status === 200, `status=${r.status}, content-type=${r.headers["content-type"]}`);

  // 10. Пагинация — фронт делает dataUrl.searchParams.set("page", page - 1)
  r = await request("GET", "/api/goods?page=2");
  check("Пагинация: page=2 — 5 товаров", r.body.goods.length === 5 && r.body.page === 2, `goods=${r.body.goods.length}`);

  // 11. Поиск по кириллице — фронт делает searchInput.value
  r = await request("GET", "/api/goods?search=" + encodeURIComponent("Смартфон"));
  check("Поиск кириллицей: найдено", r.body.totalCount > 0, `total=${r.body.totalCount}`);

  // 12. 404 на несуществующий товар — фронт обрабатывает response.status
  r = await request("GET", "/api/goods/9999999999");
  check("404 на несуществующий товар", r.status === 404 && r.body.error, `status=${r.status}`);

  // 13. PATCH на несуществующий товар — фронт обрабатывает 404
  r = await request("PATCH", "/api/goods/9999999999", { price: 1 });
  check("PATCH 404 на несуществующий товар", r.status === 404, `status=${r.status}`);

  // 14. OPTIONS — фронт не шлёт, но CORS должен работать
  const opts = await new Promise((resolve, reject) => {
    const req = _request({ hostname: "localhost", port: 3000, path: "/api/goods", method: "OPTIONS" }, (res) => {
      res.resume();
      res.on("end", () => resolve(res));
    });
    req.on("error", reject);
    req.end();
  });
  check("CORS: Access-Control-Allow-Origin", opts.headers["access-control-allow-origin"] === "*", `origin=${opts.headers["access-control-allow-origin"]}`);
  check("CORS: Access-Control-Allow-Methods", opts.headers["access-control-allow-methods"] === "GET, POST, PATCH, DELETE, OPTIONS", `methods=${opts.headers["access-control-allow-methods"]}`);

  // 15. Заголовок Content-Type у JSON-ответов
  r = await request("GET", "/api/total");
  check("JSON Content-Type", r.headers["content-type"] === "application/json; charset=utf-8", `ct=${r.headers["content-type"]}`);

  // 16. Слэш в конце — фронт шлёт /api/goods/, /api/categories/, /api/total/
  r = await request("GET", "/api/goods/");
  check("Trailing slash /api/goods/", r.status === 200 && Array.isArray(r.body.goods), `status=${r.status}`);

  r = await request("GET", "/api/categories/");
  check("Trailing slash /api/categories/", r.status === 200 && Array.isArray(r.body), `status=${r.status}`);

  r = await request("GET", "/api/total/");
  check("Trailing slash /api/total/", r.status === 200 && typeof r.body === "number", `status=${r.status}`);

  // 17. Валидация: price < 0
  r = await request("POST", "/api/goods", { title: "X", price: -1, category: "Игрушки" });
  check("POST price < 0 — 400", r.status === 400, `status=${r.status}, error=${r.body.error}`);

  // 18. Валидация: discount > 100
  r = await request("POST", "/api/goods", { title: "X", price: 100, category: "Игрушки", discount: 150 });
  check("POST discount > 100 — 400", r.status === 400, `status=${r.status}`);

  // 19. Валидация: count < 0
  r = await request("POST", "/api/goods", { title: "X", price: 100, category: "Игрушки", count: -5 });
  check("POST count < 0 — 400", r.status === 400, `status=${r.status}`);

  // 20. Base64 некорректный
  r = await request("POST", "/api/goods", { title: "X", price: 100, category: "Игрушки", image: "not-a-base64" });
  check("POST bad base64 — 400", r.status === 400, `status=${r.status}`);

  // 21. Изображение с некорректным mime
  r = await request("POST", "/api/goods", { title: "X", price: 100, category: "Игрушки", image: "data:application/octet-stream;base64,AA==" });
  check("POST unsupported image mime — 400", r.status === 400, `status=${r.status}`);

  // 22. GET /api/goods — пагинация > totalPage
  r = await request("GET", "/api/goods?page=100");
  check("Пагинация: page > totalPage — пустой goods, page=100", r.body.goods.length === 0 && r.body.page === 100, `goods=${r.body.goods.length}, page=${r.body.page}`);

  // 23. PATCH с пустым телом — 200 (ничего не менять)
  r = await request("PATCH", "/api/goods/2074454224", {});
  check("PATCH пустое тело — 200", r.status === 200, `status=${r.status}`);

  // Итог
  const failed = results.filter((x) => !x.ok);
  console.log(`\nИТОГО: ${results.length - failed.length}/${results.length} пройдено`);
  if (failed.length) {
    console.log("ПРОВАЛЕНО:", failed.map((f) => f.name).join(", "));
    failed.forEach((f) => console.log(`  → ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log("\nВсе фронтенд-контракты и edge-кейсы подтверждены.");
})().catch((e) => {
  console.error("TEST ERROR:", e.message);
  process.exit(1);
});
