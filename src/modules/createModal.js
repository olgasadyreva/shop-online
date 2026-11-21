import { fetchCategories } from "./category.js";
import { getTotal } from "./summs.js";
import { toBase } from "./picture.js";
import { goodsItemUrl, imageUrl, appData } from "./const.js";
import { renderGoods } from "./render.js";

export const openEditModal = async ({
  id,
  title,
  price,
  category,
  count,
  units,
  discount,
  description,
  image,
}) => {
  fetchCategories();

  const modalContainer = document.createElement("div");
  modalContainer.classList.add("overlay", "active");

  modalContainer.addEventListener("click", (event) => {
    if (event.target === modalContainer) {
      closeModal();
    }
  });

  const modalContent = document.createElement("div");
  modalContent.classList.add("overlay__modal", "modal");

  const modalTop = document.createElement("div");
  modalTop.classList.add("modal_top");

  const modalTitle = document.createElement("h2");
  modalTitle.classList.add("modal__title");
  modalTitle.textContent = "Изменить";

  const vendorCode = document.createElement("div");
  vendorCode.classList.add("modal__vendor-code", "vendor-code");

  const vendorCodeWrapper = document.createElement("p");
  vendorCodeWrapper.classList.add("vendor-code__wrapper");
  vendorCodeWrapper.textContent = "id:";

  const vendorCodeId = document.createElement("span");
  vendorCodeId.classList.add("vendor-code__id");
  vendorCodeId.textContent = id;

  vendorCodeWrapper.append(vendorCodeId);
  vendorCode.append(vendorCodeWrapper);
  modalTop.append(modalTitle, vendorCode);

  const modalform = document.createElement("form");
  modalform.classList.add("modal__form");

  const fieldset = document.createElement("fieldset");
  fieldset.classList.add("modal__fieldset");

  const nameLabel = document.createElement("label");
  nameLabel.classList.add("modal__label", "modal__label_name");
  nameLabel.htmlFor = "edit-name";

  const nameText = document.createElement("span");
  nameText.classList.add("modal__text");
  nameText.textContent = "Наименование";

  const nameInput = document.createElement("input");
  nameInput.classList.add("modal__input");
  nameInput.type = "text";
  nameInput.name = "title";
  nameInput.id = "edit-name";
  nameInput.value = title;

  nameLabel.append(nameText, nameInput);

  const categoryLabel = document.createElement("label");
  categoryLabel.classList.add("modal__label", "modal__label_category");
  categoryLabel.htmlFor = "categoryId";

  const categoryText = document.createElement("span");
  categoryText.classList.add("modal__text");
  categoryText.textContent = "Категория";

  const categoryInput = document.createElement("input");
  categoryInput.classList.add("modal__input");
  categoryInput.type = "text";
  categoryInput.name = "categoryId";
  categoryInput.id = "categoryId";
  categoryInput.setAttribute("list", "category-list-id");
  categoryInput.value = category;

  categoryLabel.append(categoryText, categoryInput);

  const descriptionLabel = document.createElement("label");
  descriptionLabel.classList.add("modal__label", "modal__label_description");
  descriptionLabel.htmlFor = "edit-description";
  const descriptionText = document.createElement("span");
  descriptionText.classList.add("modal__text");
  descriptionText.textContent = "Описание";

  const descriptionTextarea = document.createElement("textarea");
  descriptionTextarea.classList.add("modal__input", "modal__input_textarea");
  descriptionTextarea.name = "description";
  descriptionTextarea.id = "edit-description";
  descriptionTextarea.value = description;

  descriptionLabel.append(descriptionText, descriptionTextarea);

  const unitsLabel = document.createElement("label");
  unitsLabel.classList.add("modal__label", "modal__label_units");
  unitsLabel.htmlFor = "edit-units";
  const unitsText = document.createElement("span");
  unitsText.classList.add("modal__text");
  unitsText.textContent = "Единицы измерения";
  const unitsInput = document.createElement("input");
  unitsInput.classList.add("modal__input");
  unitsInput.type = "text";
  unitsInput.name = "units";
  unitsInput.id = "edit-units";
  unitsInput.value = units;

  unitsLabel.append(unitsText, unitsInput);

  const discountLabel = document.createElement("div");
  discountLabel.classList.add("modal__label", "modal__label_discount_two");
  const discountText = document.createElement("label");
  discountText.classList.add("modal__text");
  discountText.htmlFor = "edit-discount";
  discountText.textContent = "Дисконт";

  const checkboxWrapper = document.createElement("div");
  checkboxWrapper.classList.add("modal__checkbox-wrapper");

  // Чекбокс отражает реальное состояние товара: скидка 0 — снят.
  const hasDiscount = Number(discount) > 0;

  const discountCheckbox = document.createElement("input");
  discountCheckbox.classList.add("modal__checkbox");
  discountCheckbox.type = "checkbox";
  discountCheckbox.name = "discount";
  discountCheckbox.id = "edit-discount";
  discountCheckbox.checked = hasDiscount;
  discountCheckbox.addEventListener("change", () => {
    discountInput.disabled = !discountCheckbox.checked;
    if (!discountCheckbox.checked) {
      discountInput.value = "";
    }
  });

  const discountInput = document.createElement("input");
  discountInput.classList.add("modal__input", "modal__input_discount");
  discountInput.type = "number";
  discountInput.name = "discount_count";
  discountInput.id = "edit-discount-count";
  discountInput.value = hasDiscount ? String(discount) : "";
  discountInput.disabled = !hasDiscount;

  checkboxWrapper.append(discountCheckbox, discountInput);
  discountLabel.append(discountText, checkboxWrapper);

  const countLabel = document.createElement("label");
  countLabel.classList.add("modal__label", "modal__label_count");
  countLabel.htmlFor = "edit-count";
  const countText = document.createElement("span");
  countText.classList.add("modal__text");
  countText.textContent = "Количество";
  const countInput = document.createElement("input");
  countInput.classList.add("modal__input");
  countInput.type = "number";
  countInput.name = "count";
  countInput.id = "edit-count";
  countInput.value = count;

  countLabel.append(countText, countInput);

  const priceLabel = document.createElement("label");
  priceLabel.classList.add("modal__label", "modal__label_price");
  priceLabel.htmlFor = "edit-price";
  const priceText = document.createElement("span");
  priceText.classList.add("modal__text");
  priceText.textContent = "Цена";
  const priceInput = document.createElement("input");
  priceInput.classList.add("modal__input");
  priceInput.type = "number";
  priceInput.name = "price";
  priceInput.id = "edit-price";
  priceInput.value = price;

  priceLabel.append(priceText, priceInput);

  const fileLabel = document.createElement("label");
  fileLabel.setAttribute("tabindex", "0");
  fileLabel.htmlFor = "image2";

  fileLabel.classList.add("modal__label", "modal__label_file");
  fileLabel.textContent = "Добавить изображение";

  const fileInput = document.createElement("input");
  fileInput.classList.add("modal__file_two", "visually-hidden");
  fileInput.type = "file";
  fileInput.id = "image2";

  const spacerContainer = document.createElement("div");
  spacerContainer.classList.add("spacer-container");

  fieldset.append(
    nameLabel,
    categoryLabel,
    descriptionLabel,
    unitsLabel,
    discountLabel,
    countLabel,
    priceLabel,
    fileLabel,
    fileInput,
    document.createElement("br"),
    spacerContainer,
  );

  const footer = document.createElement("div");
  footer.classList.add("modal__footer");

  const totalPriceLabel = document.createElement("label");
  totalPriceLabel.classList.add("modal__total");
  totalPriceLabel.textContent = "Итоговая стоимость: ";

  const totalPriceOutput = document.createElement("output");
  totalPriceOutput.classList.add("modal__total-price");
  totalPriceOutput.name = "total";
  totalPriceLabel.append(totalPriceOutput);

  // Итог в окне редактирования пересчитывается при изменении полей.
  const updateModalTotal = () => {
    const currentPrice = Number(priceInput.value) || 0;
    const currentCount = Number(countInput.value) || 0;
    const currentDiscount = discountCheckbox.checked
      ? Number(discountInput.value) || 0
      : 0;
    totalPriceOutput.textContent = `$${getTotal(
      currentPrice,
      currentCount,
      currentDiscount,
    ).toFixed(2)}`;
  };

  [priceInput, countInput, discountInput].forEach((input) =>
    input.addEventListener("input", updateModalTotal),
  );
  discountCheckbox.addEventListener("change", updateModalTotal);
  updateModalTotal();

  const submitButton = document.createElement("button");
  submitButton.classList.add("modal__submit");
  submitButton.type = "submit";
  submitButton.textContent = "Сохранить изменения";

  const modalImage = document.createElement("img");
  modalImage.classList.add("modal__image");
  spacerContainer.append(modalImage);

  const modalPic = async () => {
    try {
      const response = await fetch(goodsItemUrl(id));
      if (!response.ok) {
        throw new Error("Не удалось загрузить данные товара");
      }

      const data = await response.json();

      if (!data.image) {
        modalImage.remove();
        return;
      }

      modalImage.src = imageUrl(data.image);
      modalImage.alt = "Product Image";
    } catch (error) {
      console.error("Error retrieving image:", error);
      modalImage.remove();
    }
  };

  // Модальное окно редактирования создаётся заново при каждом открытии,
  // поэтому при закрытии убираем его из DOM (иначе копятся скрытые копии).
  const closeModal = () => {
    modalContainer.remove();
  };

  modalform.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(modalform);
    const product = Object.fromEntries(formData);

    const updatedData = {
      title: product.title,
      category: product.categoryId,
      description: product.description,
      units: product.units,
      count: Number(product.count) || 0,
      price: Number(product.price) || 0,
      discount: discountCheckbox.checked
        ? Number(product.discount_count) || 0
        : 0,
    };

    if (fileInput.files[0]) {
      updatedData.image = await toBase(fileInput.files[0]);
    }

    const saved = await saveChanges(id, updatedData);
    if (!saved) {
      return;
    }

    closeModal();

    await renderGoods(`${appData.lastUrl}`);
  });

  const closeButton = document.createElement("button");
  closeButton.classList.add("modal__close");
  closeButton.innerHTML = `
      <svg width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="m2 2 20 20M2 22 22 2" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      </svg>
    `;

  closeButton.addEventListener("click", closeModal);

  footer.append(totalPriceLabel, submitButton);

  modalform.append(fieldset, footer);

  modalContent.append(closeButton, modalTop, modalform);

  modalPic();
  modalContainer.append(modalContent);
  document.body.append(modalContainer);
};

export const saveChanges = async (id, updatedData) => {
  try {
    const response = await fetch(goodsItemUrl(id), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `Ошибка сохранения: ${response.status}`;
      console.error("PATCH /api/goods/:id:", errorMessage);
      window.alert(errorMessage);
      return false;
    }

    console.log("Changes saved successfully");
    return true;
  } catch (error) {
    console.error("Error saving changes:", error);
    window.alert("Сервер недоступен. Проверьте, запущен ли он.");
    return false;
  }
};

export const updateRow = (id, updatedData) => {
  const existingRow = document.querySelector(`tr[data-id="${id}"]`);
  if (existingRow) {
    const cellId = existingRow.querySelector(".table__cell-id");
    const cellName = existingRow.querySelector(".table__cell_name");
    const cellCategory = existingRow.querySelector(".table__cell_category");
    const cellUnits = existingRow.querySelector(".table__cell_units");
    const cellCount = existingRow.querySelector(".table__cell_count");
    const cellPrice = existingRow.querySelector(".table__cell_price");
    const cellTotal = existingRow.querySelector(".table__total");

    if (cellId) cellId.textContent = "ID: " + updatedData.id;
    if (cellName) cellName.textContent = updatedData.title;
    if (cellCategory) cellCategory.textContent = updatedData.category;
    if (cellUnits) cellUnits.textContent = updatedData.units;
    if (cellCount) cellCount.textContent = updatedData.count;
    if (cellPrice) cellPrice.textContent = updatedData.price;

    const total = getTotal(
      updatedData.count,
      updatedData.price,
      updatedData.discount,
    ).toFixed(2);
    if (cellTotal) cellTotal.textContent = total;
  } else {
    console.error(`Row with data-id "${id}" not found`);
  }
};
