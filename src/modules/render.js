import create, { appData } from "./const.js";
const { table } = create;

import { numbers, createRow } from "./table.js";
import { allTotalTableSum } from "./summs.js";
import { loadGoods } from "./service.js";
import { renderPagination } from "./pagination.js";

let lastRequestId = 0;

export const renderGoods = async (url) => {
  const dataUrl = new URL(url);
  const requestId = ++lastRequestId;

  let data;
  try {
    data = await loadGoods({ url: dataUrl });
  } catch (error) {
    console.error("Не удалось загрузить товары:", error);
    if (requestId === lastRequestId) {
      table.textContent = "";
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.classList.add("table__cell");
      cell.colSpan = 8;
      cell.textContent = error.message;
      row.append(cell);
      table.append(row);
    }
    return;
  }

  // Пока шёл запрос, мог быть запущен более новый — его результат важнее.
  if (requestId !== lastRequestId) return;

  appData.lastUrl = dataUrl;
  table.textContent = "";
  data.goods.forEach((product) => {
    const {
      id,
      title,
      price,
      category,
      count,
      units,
      discount,
      description,
      image,
    } = product;

    const row = createRow({
      id,
      title,
      price,
      category,
      count,
      units,
      discount,
      description,
      image,
    });
    table.append(row);
  });

  numbers(data.page);

  renderPagination({
    ...data,
    dataUrl,
  });
  await allTotalTableSum();
};
