import { GOODS_URL, TOTAL_PRICE_URL } from "./const";

export const loadGoods = async (params = {}) => {
  const { url = GOODS_URL } = params;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить товары (код ${response.status})`);
  }

  return response.json();
};

export const loadTotalPrice = async (params = {}) => {
  const response = await fetch(TOTAL_PRICE_URL);

  if (!response.ok) {
    throw new Error(`Не удалось получить итоговую стоимость (код ${response.status})`);
  }

  return response.json();
};
