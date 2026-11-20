import { IncomingMessage } from "node:http";

/**
 * Мини-роутер для встроенного http-сервера.
 * Поддерживает параметры пути (:id), нормализует завершающий слэш.
 */
class Router {
  constructor() {
    /** @type {Array<{method: string, parts: string[], handler: Function}>} */
    this.routes = [];
  }

  /**
   * Регистрирует маршрут.
   * @param {string} method — HTTP-метод (GET, POST, PATCH, DELETE)
   * @param {string} pattern — путь с параметрами, напр. "/api/goods/:id"
   * @param {Function} handler — async (req, res, params) => void
   */
  add(method, pattern, handler) {
    const parts = pattern.split("/").filter(Boolean);
    this.routes.push({ method: method.toUpperCase(), parts, handler });
  }

  /**
   * Пытается найти обработчик для запроса.
   * @param {IncomingMessage} req
   * @returns {{ handler: Function, params: Record<string,string> } | null}
   */
  match(req) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    // Нормализуем: убираем завершающий слэш и разбиваем на части
    const reqParts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      if (route.parts.length !== reqParts.length) continue;

      const params = {};
      let matched = true;

      for (let i = 0; i < route.parts.length; i++) {
        const rp = route.parts[i];
        const qp = reqParts[i];

        if (rp.startsWith(":")) {
          params[rp.slice(1)] = decodeURIComponent(qp);
        } else if (rp !== qp) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return { handler: route.handler, params };
      }
    }

    return null;
  }

  /**
   * Выполняет обработчик для запроса (если найден).
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   * @returns {Promise<boolean>} true, если маршрут найден и выполнен
   */
  async dispatch(req, res) {
    const match = this.match(req);
    if (!match) return false;
    await match.handler(req, res, match.params);
    return true;
  }
}

export default Router;
