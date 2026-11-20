export const API_URL =
  typeof API_URL_GLOBAL !== "undefined" ? API_URL_GLOBAL : "http://localhost:3000";
export const GOODS_URL = `${API_URL}/api/goods`;
export const CATEGORY_URL = `${API_URL}/api/categories`;
export const TOTAL_PRICE_URL = `${API_URL}/api/total`;

/**
 * Собирает абсолютный URL изображения.
 * В БД хранится относительный путь вида "image/123.jpg",
 * поэтому его нужно дополнить адресом бэкенда.
 */
export const imageUrl = (path) => {
  if (!path) return "";
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  return `${API_URL}/${String(path).replace(/^\/+/, "")}`;
};
export const appData = {
  lastUrl: GOODS_URL,
};

const btn = document.querySelector(".panel__add-goods");
const table = document.querySelector(".table__body");
const modal = document.querySelector(".overlay");
const checkbox = document.querySelector(".modal__checkbox");
const discont = document.querySelector(".modal__input_discount");
const formelems = document.querySelectorAll(".modal__input");
const form = document.querySelector(".modal__form");
const price = document.querySelector("#price");
const count = document.querySelector("#count");
const span = document.querySelector(".vendor-code__id");
const overlay = document.querySelector(".overlay");

export default {
  btn,
  table,
  modal,
  checkbox,
  discont,
  formelems,
  form,
  price,
  count,
  span,
  overlay,
};
