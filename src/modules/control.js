import create, { API_URL, GOODS_URL, imageUrl, appData } from "./const.js";
const { btn, table, modal, form, price, count, discont, formelems, checkbox } =
  create;
import { closeModal, openModal } from "./modal.js";
import { getTotal, allTotalTableSum } from "./summs.js";
import { addProductData, numbers, addProductPage } from "./table.js";
import { toBase } from "./picture.js";
import { loadGoods } from "./service.js";
import { renderGoods } from "./render.js";

export const formModal = () => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const newProduct = Object.fromEntries(formData);

    const payload = {
      title: newProduct.title,
      category: newProduct.category,
      description: newProduct.description,
      units: newProduct.units,
      count: Number(newProduct.count) || 0,
      price: Number(newProduct.price) || 0,
      discount: checkbox.checked ? Number(newProduct.discount_count) || 0 : 0,
    };

    const image = await toBase(newProduct.image);
    if (image) {
      payload.image = image;
    }

    const created = await addProductData(payload);
    if (!created) {
      return;
    }

    await allTotalTableSum();

    renderGoods(`${appData.lastUrl}`);
    form.reset();
    closeModal();
  });
};

const openConfirmationModal = async (id, target) => {
  const modal = document.createElement("div");
  modal.classList.add("overlay", "active");

  const modalContent = document.createElement("div");
  modalContent.classList.add("overlay__modal", "modal", "confirm-modal");

  const closeButton = document.createElement("button");
  closeButton.classList.add("modal__close");
  closeButton.setAttribute("aria-label", "Закрыть");
  closeButton.innerHTML = `
      <svg width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="m2 2 20 20M2 22 22 2" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      </svg>
    `;
  closeButton.addEventListener("click", () => modal.remove());

  const title = document.createElement("h2");
  title.classList.add("modal__title", "confirm-modal__title");
  title.textContent = "Удаление товара";

  const message = document.createElement("p");
  message.classList.add("confirm-modal__message");
  message.textContent = "Вы уверены, что хотите удалить этот товар?";

  const confirmButton = document.createElement("button");
  confirmButton.classList.add("modal__submit", "confirm-modal__btn");
  confirmButton.textContent = "Удалить";
  confirmButton.addEventListener("click", async () => {
    try {
      const response = await fetch(`${GOODS_URL}${id}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Ошибка удаления: ${response.status}`);
      }

      renderGoods(`${appData.lastUrl}`);
    } catch (error) {
      console.error("Failed to delete the product:", error);
    }

    modal.remove();
  });

  const cancelButton = document.createElement("button");
  cancelButton.classList.add(
    "confirm-modal__btn",
    "confirm-modal__btn_cancel",
  );
  cancelButton.textContent = "Отмена";
  cancelButton.addEventListener("click", () => {
    modal.remove();
  });

  const actions = document.createElement("div");
  actions.classList.add("confirm-modal__actions");
  actions.append(cancelButton, confirmButton);

  modalContent.append(closeButton, title, message, actions);
  modal.append(modalContent);
  document.body.append(modal);
};

export const tableNum = () => {
  table.addEventListener("click", (e) => {
    const target = e.target;
    if (target.closest(".table__btn_del")) {
      const connectId = target.closest("tr").dataset.id;
      openConfirmationModal(connectId, target);
    }
  });
};

export const openWindow = () => {
  table.addEventListener("click", async (e) => {
    const target = e.target;
    if (target.closest(".table__btn_pic")) {
      const row = target.closest("tr");
      const id = row.dataset.id;

      try {
        const response = await fetch(`${GOODS_URL}${id}`);
        if (!response.ok) {
          throw new Error("Image not found");
        }

        const data = await response.json();
        const pictureUrl = imageUrl(data.image);

        const w = screen.width / 2 - 400;
        const h = screen.height / 2 - 300;
        window.open(
          pictureUrl,
          "_blank",
          `width=800,height=600,left=${w},top=${h}`,
        );
      } catch (error) {
        console.error(error);
        window.alert(error.message); // Display the error message in a window alert
      }
    }
  });
};

export const modalBtn = () => {
  btn.addEventListener("click", () => {
    openModal();
  });
};

export const modalModal = () => {
  modal.addEventListener("click", (e) => {
    const target = e.target;
    if (target === modal || target.closest(".modal__close")) {
      closeModal();
    }
  });
};

export const totalModal = () => {
  formelems.forEach((elem) => {
    const modalTotal = document.querySelector(".modal__total-price");
    modalTotal.textContent = "0.00";
    elem.addEventListener("blur", () => {
      modalTotal.value = getTotal(
        price.value,
        count.value,
        discont.value,
      ).toFixed(2);
    });
  });
};

export const reqModal = () => {
  formelems.forEach((formelem) => {
    formelem.required = true;
  });
};

export const checkboxModal = () => {
  checkbox.addEventListener("click", () => {
    discont.disabled = checkbox.checked ? false : true;
    discont.value = "";
  });
};
