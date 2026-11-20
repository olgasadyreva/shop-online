import { IncomingMessage } from "node:http";
import { maxBodySize } from "./config.js";

/**
 * Читает тело запроса и парсит JSON.
 * Ограничивает размер config.maxBodySize байт.
 * @param {IncomingMessage} req
 * @returns {Promise<object>} распарсенный JSON
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodySize) {
        reject(new Error("Тело запроса слишком большое"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Некорректный JSON в теле запроса"));
      }
    });

    req.on("error", reject);
  });
}

export default parseBody;
