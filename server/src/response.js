import { ServerResponse } from "node:http";

/**
 * Отправляет JSON-ответ.
 * @param {ServerResponse} res
 * @param {number} status — HTTP-код
 * @param {*} data — сериализуемые данные
 */
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Отправляет ошибку в едином формате { error: "..." }.
 * @param {ServerResponse} res
 * @param {number} status
 * @param {string} message
 */
function sendError(res, status, message) {
  sendJSON(res, status, { error: message });
}

export { sendJSON, sendError };
