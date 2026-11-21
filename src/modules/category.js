import { CATEGORY_URL } from "./const";

/**
 * Загружает категории и обновляет подсказки (datalist) у полей ввода.
 * Вызывается в том числе при каждом открытии окна редактирования,
 * поэтому старые списки удаляются, чтобы не копились дубликаты.
 */
export const fetchCategories = async () => {
  try {
    const categoriesResponse = await fetch(CATEGORY_URL, {
      method: "GET",
    });

    if (!categoriesResponse.ok) return;

    const categories = await categoriesResponse.json();

    document
      .querySelectorAll("#category-list-id, #category-list")
      .forEach((list) => list.remove());

    const fillDatalist = (input, datalistId) => {
      if (!input) return;

      const datalist = document.createElement("datalist");
      datalist.id = datalistId;

      categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        datalist.append(option);
      });

      input.setAttribute("list", datalistId);
      document.body.append(datalist);
    };

    fillDatalist(document.getElementById("categoryId"), "category-list-id");
    fillDatalist(document.getElementById("category"), "category-list");
  } catch (error) {
    console.error("Не удалось загрузить категории:", error);
  }
};
