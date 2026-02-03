const socket = io();

const sections = document.querySelectorAll(".section");
const navButtons = document.querySelectorAll(".nav button");
const sectionTitle = document.getElementById("section-title");
const toast = document.getElementById("toast");

const productForm = document.getElementById("product-form");
const productTable = document.getElementById("product-table");
const productBusiness = document.getElementById("product-business");
const productPreview = document.getElementById("product-preview");
const productImages = document.getElementById("product-images");
const productSelectAll = document.getElementById("product-select-all");

const userForm = document.getElementById("user-form");
const userTable = document.getElementById("user-table");
const userBusiness = document.getElementById("user-business");

const businessForm = document.getElementById("business-form");
const businessTable = document.getElementById("business-table");

let state = { user: null, businesses: [], users: [], products: [] };
let lastProductAction = "create";

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function switchSection(target) {
  sections.forEach((section) => section.classList.remove("active"));
  document.getElementById(target).classList.add("active");
  navButtons.forEach((btn) => btn.classList.remove("active"));
  document.querySelector(`[data-section="${target}"]`).classList.add("active");
  sectionTitle.textContent =
    target === "products" ? "Productos" : target === "users" ? "Usuarios" : "Negocios";
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchSection(btn.dataset.section));
});

function resetProductForm() {
  productForm.reset();
  productForm.id.value = "";
  productForm.img1.value = "";
  productForm.img2.value = "";
  productForm.img3.value = "";
  productForm.img4.value = "";
  productPreview.innerHTML = "";
  lastProductAction = "create";
}

function resetUserForm() {
  userForm.reset();
  userForm.id.value = "";
}

function resetBusinessForm() {
  businessForm.reset();
  businessForm.id.value = "";
}

function renderBusinesses() {
  businessTable.innerHTML = state.businesses
    .map(
      (business) => `
      <tr>
        <td>${business.id}</td>
        <td>${business.name}</td>
        <td class="row-actions">
          <button class="icon-btn" data-action="edit" data-id="${business.id}">
            ${editIcon()}
          </button>
          <button class="icon-btn" data-action="delete" data-id="${business.id}">
            ${trashIcon()}
          </button>
        </td>
      </tr>
    `
    )
    .join("");

  productBusiness.innerHTML = buildBusinessOptions();
  userBusiness.innerHTML = buildBusinessOptions(true);
}

function renderUsers() {
  userTable.innerHTML = state.users
    .map(
      (user) => `
      <tr>
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td>${user.business_id || "Root"}</td>
        <td class="row-actions">
          <button class="icon-btn" data-action="edit" data-id="${user.id}">
            ${editIcon()}
          </button>
          <button class="icon-btn" data-action="delete" data-id="${user.id}">
            ${trashIcon()}
          </button>
        </td>
      </tr>
    `
    )
    .join("");
}

function renderProducts() {
  productTable.innerHTML = state.products
    .map(
      (prod) => `
      <tr>
        <td><input type="checkbox" class="product-check" value="${prod.id}" /></td>
        <td>${prod.id}</td>
        <td>${prod.title}</td>
        <td>${Number(prod.prec).toFixed(2)}</td>
        <td>${prod.active ? "Sí" : "No"}</td>
        <td>${prod.business_id}</td>
        <td class="row-actions">
          <button class="icon-btn" data-action="edit" data-id="${prod.id}">${editIcon()}</button>
          <button class="icon-btn" data-action="copy" data-id="${prod.id}">${copyIcon()}</button>
          <button class="icon-btn" data-action="delete" data-id="${prod.id}">${trashIcon()}</button>
        </td>
      </tr>
    `
    )
    .join("");
}

function buildBusinessOptions(includeNull = false) {
  const options = [];
  if (includeNull) {
    options.push('<option value="">Root</option>');
  }
  state.businesses.forEach((business) => {
    options.push(`<option value="${business.id}">${business.name}</option>`);
  });
  return options.join("");
}

function editIcon() {
  return `
    <svg viewBox="0 0 24 24">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04c.39-.39.39-1.02 0-1.41l-2.5-2.5a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.99-1.67z" />
    </svg>
  `;
}

function trashIcon() {
  return `
    <svg viewBox="0 0 24 24">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3.5-9h1v7h-1V10zm4 0h1v7h-1V10zM15.5 4l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  `;
}

function copyIcon() {
  return `
    <svg viewBox="0 0 24 24">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
  `;
}

productImages.addEventListener("change", () => {
  productPreview.innerHTML = "";
  Array.from(productImages.files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = document.createElement("img");
      img.src = event.target.result;
      productPreview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
});

function fillProductForm(product) {
  productForm.title.value = product.title;
  productForm.prec.value = product.prec;
  productForm.active.value = product.active ? "true" : "false";
  productForm.business_id.value = product.business_id;
  productForm.description.value = product.description || "";
  productForm.id.value = product.id;
  productForm.img1.value = product.img1 || "";
  productForm.img2.value = product.img2 || "";
  productForm.img3.value = product.img3 || "";
  productForm.img4.value = product.img4 || "";
  productPreview.innerHTML = "";
  [product.img1, product.img2, product.img3, product.img4]
    .filter(Boolean)
    .forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      productPreview.appendChild(img);
    });
}

async function uploadImages(businessId) {
  if (!productImages.files.length) {
    return [];
  }
  const formData = new FormData();
  formData.append("business_id", businessId);
  Array.from(productImages.files).slice(0, 4).forEach((file) => formData.append("images", file));
  const response = await fetch("/api/upload", { method: "POST", body: formData });
  if (!response.ok) {
    showToast("Error al subir imágenes");
    return [];
  }
  const payload = await response.json();
  return payload.paths || [];
}

function getSelectedProductIds() {
  return Array.from(document.querySelectorAll(".product-check:checked")).map((input) =>
    Number(input.value)
  );
}

productSelectAll.addEventListener("change", () => {
  const checked = productSelectAll.checked;
  document.querySelectorAll(".product-check").forEach((checkbox) => {
    checkbox.checked = checked;
  });
});

productTable.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const product = state.products.find((item) => item.id === id);

  if (action === "edit" && product) {
    fillProductForm(product);
    lastProductAction = "update";
    return;
  }
  if (action === "copy" && product) {
    fillProductForm(product);
    productForm.id.value = "";
    productForm.img1.value = "";
    productForm.img2.value = "";
    productForm.img3.value = "";
    productForm.img4.value = "";
    productPreview.innerHTML = "";
    lastProductAction = "create";
    socket.emit("product:copy", { id });
    return;
  }
  if (action === "delete") {
    if (confirm("¿Seguro que deseas eliminar este producto?")) {
      socket.emit("product:delete", { id });
    }
  }
});

businessTable.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const business = state.businesses.find((item) => item.id === id);
  if (action === "edit" && business) {
    businessForm.name.value = business.name;
    businessForm.id.value = business.id;
  }
  if (action === "delete") {
    if (confirm("¿Eliminar negocio?")) {
      socket.emit("business:delete", { id });
    }
  }
});

userTable.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const user = state.users.find((item) => item.id === id);
  if (action === "edit" && user) {
    userForm.username.value = user.username;
    userForm.password.value = user.password;
    userForm.business_id.value = user.business_id || "";
    userForm.id.value = user.id;
  }
  if (action === "delete") {
    if (confirm("¿Eliminar usuario?")) {
      socket.emit("user:delete", { id });
    }
  }
});

document.getElementById("product-save").addEventListener("click", async () => {
  const businessId = productForm.business_id.value || state.user.business_id;
  const uploaded = await uploadImages(businessId);
  const images = [
    uploaded[0] || productForm.img1.value,
    uploaded[1] || productForm.img2.value,
    uploaded[2] || productForm.img3.value,
    uploaded[3] || productForm.img4.value,
  ];

  const payload = {
    id: productForm.id.value ? Number(productForm.id.value) : undefined,
    title: productForm.title.value.trim(),
    description: productForm.description.value.trim(),
    prec: productForm.prec.value,
    active: productForm.active.value === "true",
    business_id: businessId ? Number(businessId) : null,
    img1: images[0],
    img2: images[1],
    img3: images[2],
    img4: images[3],
  };

  if (!payload.title || !payload.prec) {
    showToast("Completa el formulario");
    return;
  }

  if (payload.id) {
    socket.emit("product:update", payload);
  } else {
    socket.emit("product:create", payload);
  }
  resetProductForm();
});

document.getElementById("product-clear").addEventListener("click", resetProductForm);

document.getElementById("product-delete-selected").addEventListener("click", () => {
  const ids = getSelectedProductIds();
  if (!ids.length) {
    showToast("Sin productos seleccionados");
    return;
  }
  if (confirm(`¿Eliminar ${ids.length} productos?`)) {
    socket.emit("product:delete_many", { ids });
  }
});

document.getElementById("user-save").addEventListener("click", () => {
  const payload = {
    id: userForm.id.value ? Number(userForm.id.value) : undefined,
    username: userForm.username.value.trim(),
    password: userForm.password.value,
    business_id: userForm.business_id.value || null,
  };
  if (!payload.username || !payload.password) {
    showToast("Completa el formulario");
    return;
  }
  if (payload.id) {
    socket.emit("user:update", payload);
  } else {
    socket.emit("user:create", payload);
  }
  resetUserForm();
});

document.getElementById("user-clear").addEventListener("click", resetUserForm);

document.getElementById("business-save").addEventListener("click", () => {
  const payload = {
    id: businessForm.id.value ? Number(businessForm.id.value) : undefined,
    name: businessForm.name.value.trim(),
  };
  if (!payload.name) {
    showToast("Completa el formulario");
    return;
  }
  if (payload.id) {
    socket.emit("business:update", payload);
  } else {
    socket.emit("business:create", payload);
  }
  resetBusinessForm();
});

document.getElementById("business-clear").addEventListener("click", resetBusinessForm);

socket.on("init_data", (payload) => {
  state = payload;
  renderBusinesses();
  renderUsers();
  renderProducts();
  if (!state.user || state.user.id !== 1) {
    document.querySelector('[data-section="users"]').classList.add("hidden");
    document.querySelector('[data-section="businesses"]').classList.add("hidden");
  }
});

socket.on("refresh", (payload) => {
  state = payload;
  renderBusinesses();
  renderUsers();
  renderProducts();
});

socket.on("action_result", (payload) => {
  showToast(payload.message || "Acción realizada");
});

socket.on("connect", () => {
  socket.emit("init");
});

document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  window.location.href = "/admin/public";
});
