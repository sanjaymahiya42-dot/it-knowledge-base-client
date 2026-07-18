const VITE_ENV = import.meta.env || {};
const API_BASE = VITE_ENV.VITE_API_BASE_URL || window.VITE_API_BASE_URL || localStorage.getItem("apiBaseUrl") || "http://localhost:5000/api";
const FALLBACK_CATEGORIES = [
  "Home", "Networking", "Windows", "Linux", "Cisco", "CCNA", "Firewall", "Switching", "Routing",
  "Cyber Security", "Cloud", "Virtualization", "Server", "VMware", "Azure", "AWS", "Microsoft 365",
  "Interview Questions", "Troubleshooting", "Tools", "Scripts", "Commands", "Projects", "Downloads",
  "Favorites", "Settings"
];

const state = {
  token: localStorage.getItem("kbToken"),
  user: null,
  categories: [],
  articles: [],
  uploads: [],
  page: 1,
  limit: 9,
  query: "",
  selectedCategory: "",
  filters: { status: "published", difficulty: "" }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initTinyMce();
  bindUi();
  await bootstrapData();
  if (state.token) await loadMe();
});

function authHeaders(json = true) {
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return headers;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(options.json !== false), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

async function bootstrapData() {
  await Promise.allSettled([loadCategories(), loadArticles(), loadStats()]);
  renderAll();
}

async function loadCategories() {
  try {
    const { categories } = await api("/categories");
    state.categories = categories;
  } catch {
    state.categories = FALLBACK_CATEGORIES.map((name) => ({ _id: name, name, icon: iconFor(name) }));
  }
}

async function loadArticles() {
  const params = new URLSearchParams({ page: state.page, limit: state.limit });
  if (state.query) params.set("q", state.query);
  if (state.selectedCategory && state.selectedCategory !== "Home") params.set("category", state.selectedCategory);
  if (state.filters.status) params.set("status", state.filters.status);
  if (state.filters.difficulty) params.set("difficulty", state.filters.difficulty);
  try {
    const data = await api(`/articles?${params}`);
    state.articles = data.articles;
    state.totalPages = data.totalPages || 1;
  } catch {
    state.articles = demoArticles();
    state.totalPages = 1;
  }
}

async function loadStats() {
  try {
    state.stats = await api("/articles/stats/overview");
  } catch {
    state.stats = { totalArticles: state.articles.length, totalCategories: state.categories.length, totalImages: 0, draftArticles: 0, publishedArticles: state.articles.length };
  }
}

async function loadMe() {
  try {
    const { user } = await api("/auth/me");
    state.user = user;
    $("#loginPanel").classList.add("d-none");
    $("#adminPanel").classList.remove("d-none");
    $("#logoutBtn").classList.remove("d-none");
    renderAdmin();
  } catch {
    localStorage.removeItem("kbToken");
    state.token = null;
  }
}

function renderAll() {
  renderCategories();
  renderStats();
  renderLists();
  renderArticleGrid();
  renderCategorySelect();
  renderAdmin();
}

function renderCategories() {
  const filter = $("#categorySearch").value?.toLowerCase() || "";
  $("#categoryNav").innerHTML = state.categories
    .filter((cat) => cat.name.toLowerCase().includes(filter))
    .map((cat) => `<button class="nav-item ${state.selectedCategory === cat.name ? "active" : ""}" data-category="${escapeHtml(cat.name)}"><i class="fa-solid ${cat.icon || iconFor(cat.name)}"></i><span>${escapeHtml(cat.name)}</span></button>`)
    .join("");
}

function renderStats() {
  const stats = state.stats || {};
  const cards = [
    ["fa-file-lines", stats.totalArticles || 0, "Total Articles"],
    ["fa-layer-group", stats.totalCategories || state.categories.length, "Total Categories"],
    ["fa-image", stats.totalImages || 0, "Total Images"],
    ["fa-clock-rotate-left", stats.draftArticles || 0, "Draft Articles"]
  ];
  $("#statsGrid").innerHTML = cards.map(([icon, value, label]) => statCard(icon, value, label)).join("");
  if ($("#adminStats")) {
    $("#adminStats").innerHTML = [
      ["fa-eye", stats.mostViewed?.views || 0, "Most Viewed"],
      ["fa-circle-check", stats.publishedArticles || 0, "Published"],
      ["fa-pen-to-square", stats.draftArticles || 0, "Drafts"]
    ].map(([icon, value, label]) => statCard(icon, value, label)).join("");
  }
}

function statCard(icon, value, label) {
  return `<div class="stat-card"><i class="fa-solid ${icon}"></i><strong>${value}</strong><span>${label}</span></div>`;
}

function renderLists() {
  const latest = [...state.articles].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
  const pinned = state.articles.filter((a) => a.isPinned).slice(0, 5);
  $("#latestList").innerHTML = listRows(latest);
  $("#pinnedList").innerHTML = listRows(pinned.length ? pinned : latest.slice(0, 3));
}

function listRows(items) {
  if (!items.length) return `<p class="meta">No articles found.</p>`;
  return items.map((article) => `<button class="list-row" data-open="${article._id}"><span><strong>${escapeHtml(article.title)}</strong><span>${escapeHtml(article.shortDescription || article.category?.name || "")}</span></span><i class="fa-solid fa-arrow-right"></i></button>`).join("");
}

function renderArticleGrid() {
  $("#articlesGrid").innerHTML = state.articles.length
    ? state.articles.map(articleCard).join("")
    : `<p class="meta">No matching articles yet. Login as admin and create the first one.</p>`;
  $("#pagination").innerHTML = Array.from({ length: state.totalPages || 1 }, (_, i) => `<button class="${state.page === i + 1 ? "active" : ""}" data-page="${i + 1}">${i + 1}</button>`).join("");
}

function articleCard(article) {
  const tags = (article.tags || []).slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  return `<article class="article-card">
    <div class="meta"><i class="fa-solid ${article.category?.icon || iconFor(article.category?.name || article.category)} me-1"></i>${escapeHtml(article.category?.name || article.category || "General")} / ${escapeHtml(article.subCategory || "Docs")}</div>
    <h3>${escapeHtml(article.title)}</h3>
    <p>${escapeHtml(article.shortDescription || "")}</p>
    <div class="tag-row">${tags}<span class="tag">${escapeHtml(article.difficulty || "Beginner")}</span></div>
    <div class="d-flex gap-2 flex-wrap">
      <button class="btn btn-sm btn-primary" data-open="${article._id}"><i class="fa-solid fa-book-open me-1"></i>Read</button>
      ${state.token ? `<button class="btn btn-sm btn-outline-primary" data-edit="${article._id}"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-danger" data-delete="${article._id}"><i class="fa-solid fa-trash"></i></button>` : ""}
    </div>
  </article>`;
}

function renderCategorySelect() {
  $("#categorySelect").innerHTML = `<option value="">Select category</option>` + state.categories
    .filter((cat) => !["Home", "Favorites", "Settings", "Logout"].includes(cat.name))
    .map((cat) => `<option value="${cat._id}">${escapeHtml(cat.name)}</option>`)
    .join("");
}

function renderAdmin() {
  $("#categoryManagerList").innerHTML = state.categories.map((cat) => `<div class="mini-item"><span><i class="fa-solid ${cat.icon || iconFor(cat.name)} me-2"></i>${escapeHtml(cat.name)}</span><span><button class="link-btn" data-cat-edit="${cat._id}">Edit</button> <button class="link-btn text-danger" data-cat-delete="${cat._id}">Delete</button></span></div>`).join("");
}

function bindUi() {
  $("#sidebarToggle").addEventListener("click", () => {
    if (innerWidth <= 820) $("#sidebar").classList.toggle("open");
    else $("#sidebar").classList.toggle("collapsed");
  });
  $("#themeToggle").addEventListener("click", toggleTheme);
  $("#adminBtn").addEventListener("click", () => showView("admin"));
  $("#printHome").addEventListener("click", () => window.print());
  $("#categorySearch").addEventListener("input", renderCategories);
  $("#globalSearch").addEventListener("input", debounce(async (event) => {
    state.query = event.target.value.trim();
    state.page = 1;
    await loadArticles();
    renderArticleGrid();
    renderLists();
  }, 250));
  $("#difficultyFilter").addEventListener("change", refreshFromFilters);
  $("#statusFilter").addEventListener("change", refreshFromFilters);
  document.addEventListener("click", handleClick);
  window.addEventListener("scroll", updateReadingProgress);
  $("#loginForm").addEventListener("submit", login);
  $("#categoryForm").addEventListener("submit", saveCategory);
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#articleForm").addEventListener("submit", saveArticle);
  $("#backupBtn").addEventListener("click", backupDatabase);
  $("#logoutBtn").addEventListener("click", logout);
  $("#newArticleBtn").addEventListener("click", clearEditor);
  $("#saveDraftLocal").addEventListener("click", saveLocalDraft);
  setupDropZone();
  setInterval(saveLocalDraft, 30000);
}

async function handleClick(event) {
  const target = event.target.closest("[data-view], [data-category], [data-open], [data-edit], [data-delete], [data-page], [data-cat-edit], [data-cat-delete], .copy-code, .doc-content img, #lightbox button");
  if (!target) return;
  if (target.dataset.view) showView(target.dataset.view);
  if (target.dataset.category) {
    state.selectedCategory = target.dataset.category === "Home" ? "" : target.dataset.category;
    state.page = 1;
    await loadArticles();
    renderAll();
    showView("home");
    $("#sidebar").classList.remove("open");
  }
  if (target.dataset.open) await openArticle(target.dataset.open);
  if (target.dataset.edit) editArticle(target.dataset.edit);
  if (target.dataset.delete) await deleteArticle(target.dataset.delete);
  if (target.dataset.page) {
    state.page = Number(target.dataset.page);
    await loadArticles();
    renderArticleGrid();
  }
  if (target.dataset.catEdit) editCategory(target.dataset.catEdit);
  if (target.dataset.catDelete) await deleteCategory(target.dataset.catDelete);
  if (target.classList.contains("copy-code")) copyCode(target);
  if (target.matches(".doc-content img")) openLightbox(target.src);
  if (target.matches("#lightbox button")) $("#lightbox").classList.remove("active");
}

function showView(name) {
  $$(".view").forEach((view) => view.classList.remove("active"));
  $(`#${name}View`).classList.add("active");
  scrollTo({ top: 0, behavior: "smooth" });
}

async function refreshFromFilters() {
  state.filters.difficulty = $("#difficultyFilter").value;
  state.filters.status = $("#statusFilter").value;
  state.page = 1;
  await loadArticles();
  renderArticleGrid();
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    state.token = data.token;
    localStorage.setItem("kbToken", data.token);
    toast("Logged in successfully.");
    await loadMe();
    await bootstrapData();
  } catch (error) {
    toast(error.message, "danger");
  }
}

function logout() {
  localStorage.removeItem("kbToken");
  state.token = null;
  state.user = null;
  $("#loginPanel").classList.remove("d-none");
  $("#adminPanel").classList.add("d-none");
  $("#logoutBtn").classList.add("d-none");
  toast("Logged out.");
  showView("home");
}

async function saveCategory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const method = values.id ? "PUT" : "POST";
  const path = values.id ? `/categories/${values.id}` : "/categories";
  try {
    await api(path, { method, body: JSON.stringify(values) });
    form.reset();
    await loadCategories();
    renderAll();
    toast("Category saved.");
  } catch (error) {
    toast(error.message, "danger");
  }
}

function editCategory(id) {
  const cat = state.categories.find((item) => item._id === id);
  if (!cat) return;
  const form = $("#categoryForm");
  form.elements.id.value = cat._id;
  form.elements.name.value = cat.name;
  form.elements.icon.value = cat.icon || "";
  form.elements.color.value = cat.color || "";
}

async function deleteCategory(id) {
  if (!confirm("Delete this category?")) return;
  await api(`/categories/${id}`, { method: "DELETE" });
  await loadCategories();
  renderAll();
  toast("Category deleted.");
}

async function saveSettings(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  await api("/auth/profile", { method: "PUT", body: JSON.stringify(payload) });
  event.currentTarget.reset();
  toast("Profile updated.");

}

async function saveArticle(event) {
  event.preventDefault();
  if (!state.token) return toast("Login is required to save articles.", "danger");
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  values.content = tinymce.get("richEditor")?.getContent() || values.content || "";
  values.tags = values.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  values.relatedArticles = values.relatedArticles.split(",").map((id) => id.trim()).filter(Boolean);
  values.images = state.uploads.filter((file) => file.kind === "image").map((file) => file._id);
  values.attachments = state.uploads.filter((file) => file.kind !== "image").map((file) => file._id);
  const method = values.id ? "PUT" : "POST";
  const path = values.id ? `/articles/${values.id}` : "/articles";
  try {
    await api(path, { method, body: JSON.stringify(values) });
    localStorage.removeItem("articleDraft");
    clearEditor();
    await bootstrapData();
    showView("home");
    toast("Article saved.");
  } catch (error) {
    toast(error.message, "danger");
  }
}

function editArticle(id) {
  const article = state.articles.find((item) => item._id === id);
  if (!article) return;
  const form = $("#articleForm");
  form.elements.id.value = article._id;
  form.elements.title.value = article.title || "";
  form.elements.category.value = article.category?._id || article.category || "";
  form.elements.subCategory.value = article.subCategory || "";
  form.elements.tags.value = (article.tags || []).join(", ");
  form.elements.difficulty.value = article.difficulty || "Beginner";
  form.elements.status.value = article.status || "published";
  form.elements.shortDescription.value = article.shortDescription || "";
  form.elements.videoLink.value = article.videoLink || "";
  form.elements.relatedArticles.value = (article.relatedArticles || []).map((item) => item._id || item).join(", ");
  form.elements.importantNotes.value = article.importantNotes || "";
  form.elements.commands.value = article.commands || "";
  form.elements.codeBlock.value = article.codeBlock || "";
  tinymce.get("richEditor")?.setContent(article.content || "");
  state.uploads = [...(article.images || []), ...(article.attachments || [])];
  renderUploads();
  showView("editor");
}

async function deleteArticle(id) {
  if (!confirm("Delete this article?")) return;
  await api(`/articles/${id}`, { method: "DELETE" });
  await bootstrapData();
  toast("Article deleted.");
}

async function openArticle(id) {
  let article = state.articles.find((item) => item._id === id);
  try {
    const data = await api(`/articles/${id}`);
    article = data.article;
  } catch {
    if (!article) return;
  }
  $("#articleDetail").innerHTML = renderArticleDetail(article);
  buildToc();
  enhanceCodeBlocks();
  showView("article");
}

function renderArticleDetail(article) {
  const tags = (article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const images = (article.images || []).map((img) => `<figure><img src="${assetUrl(img.url)}" alt="${escapeHtml(img.originalName || article.title)}" /><figcaption class="meta">${escapeHtml(img.originalName || "")}</figcaption></figure>`).join("");
  const commands = article.commands ? `<h2>Commands</h2><pre><code class="language-powershell">${escapeHtml(article.commands)}</code></pre>` : "";
  const code = article.codeBlock ? `<h2>Code Block</h2><pre><code>${escapeHtml(article.codeBlock)}</code></pre>` : "";
  const notes = article.importantNotes ? `<div class="note-box"><strong>Important Notes</strong><p>${escapeHtml(article.importantNotes)}</p></div>` : "";
  const video = article.videoLink ? `<p><a class="btn btn-outline-primary" href="${article.videoLink}" target="_blank" rel="noreferrer"><i class="fa-solid fa-video me-2"></i>Open Video</a></p>` : "";
  return `<header>
      <div class="meta">${escapeHtml(article.category?.name || "Documentation")} / ${escapeHtml(article.subCategory || "Guide")} / ${escapeHtml(article.difficulty || "Beginner")}</div>
      <h1>${escapeHtml(article.title)}</h1>
      <p class="lead">${escapeHtml(article.shortDescription || "")}</p>
      <div class="tag-row">${tags}</div>
      <div class="doc-actions">
        <button class="btn btn-sm btn-outline-primary" onclick="window.print()"><i class="fa-solid fa-print me-1"></i>Print</button>
        <button class="btn btn-sm btn-outline-primary" onclick="navigator.share?.({ title: document.title, url: location.href })"><i class="fa-solid fa-share-nodes me-1"></i>Share</button>
        <button class="btn btn-sm btn-outline-primary" onclick="localStorage.setItem('favorite-${article._id}', '1')"><i class="fa-solid fa-bookmark me-1"></i>Bookmark</button>
      </div>
    </header>
    ${article.content || ""}
    ${images}
    ${commands}
    ${code}
    ${notes}
    ${video}`;
}

function buildToc() {
  const headings = $$("#articleDetail h2, #articleDetail h3");
  $("#toc").innerHTML = headings.length ? `<strong>On this page</strong>` : "";
  headings.forEach((heading, index) => {
    heading.id = heading.id || `section-${index}`;
    $("#toc").insertAdjacentHTML("beforeend", `<a href="#${heading.id}">${escapeHtml(heading.textContent)}</a>`);
  });
}

function enhanceCodeBlocks() {
  $$("#articleDetail pre").forEach((pre) => {
    if (!pre.querySelector(".copy-code")) pre.insertAdjacentHTML("afterbegin", `<button class="copy-code">Copy</button>`);
  });
  window.Prism?.highlightAll();
}

function copyCode(button) {
  const code = button.parentElement.querySelector("code")?.innerText || "";
  navigator.clipboard.writeText(code);
  button.textContent = "Copied";
  setTimeout(() => (button.textContent = "Copy"), 1200);
}

function setupDropZone() {
  const dropZone = $("#dropZone");
  ["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
  }));
  dropZone.addEventListener("drop", (event) => uploadFiles(event.dataTransfer.files));
  $("#fileInput").addEventListener("change", (event) => uploadFiles(event.target.files));
}

async function uploadFiles(files) {
  if (!files.length) return;
  if (!state.token) return toast("Login is required to upload files.", "danger");
  const body = new FormData();
  [...files].forEach((file) => body.append("files", file));
  try {
    const response = await fetch(`${API_BASE}/uploads`, { method: "POST", headers: authHeaders(false), body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Upload failed");
    state.uploads.push(...data.files);
    renderUploads();
    toast("Files uploaded.");
  } catch (error) {
    toast(error.message, "danger");
  }
}

function renderUploads() {
  $("#uploadPreview").innerHTML = state.uploads.map((file) => `<div class="upload-tile">${file.kind === "image" ? `<img src="${assetUrl(file.url)}" alt="${escapeHtml(file.originalName)}" />` : `<div class="p-4 text-center"><i class="fa-solid fa-file fa-2x"></i></div>`}<span>${escapeHtml(file.originalName || file.filename || "Upload")}</span></div>`).join("");
}

function saveLocalDraft() {
  const form = $("#articleForm");
  if (!form.title?.value && !tinymce.get("richEditor")?.getContent()) return;
  const values = Object.fromEntries(new FormData(form));
  values.content = tinymce.get("richEditor")?.getContent() || "";
  localStorage.setItem("articleDraft", JSON.stringify(values));
  toast("Draft saved locally.");
}

function clearEditor() {
  $("#articleForm").reset();
  tinymce.get("richEditor")?.setContent("");
  state.uploads = [];
  renderUploads();
}

async function backupDatabase() {
  try {
    const data = await api("/backup");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `it-kb-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast(error.message, "danger");
  }
}

function initTinyMce() {
  if (!window.tinymce) return;
  tinymce.init({
    selector: "#richEditor",
    height: 420,
    menubar: false,
    plugins: "lists link image table code codesample autosave",
    toolbar: "undo redo | blocks | bold italic underline | bullist numlist | table link image codesample | info warning success danger note | code",
    setup(editor) {
      const blocks = [
        ["info", "Info Box", "info-box"],
        ["warning", "Warning Box", "warning-box"],
        ["success", "Success Box", "success-box"],
        ["danger", "Danger Box", "danger-box"],
        ["note", "Note Box", "note-box"]
      ];
      blocks.forEach(([name, text, cls]) => editor.ui.registry.addButton(name, {
        text,
        onAction: () => editor.insertContent(`<div class="${cls}"><strong>${text}</strong><p>Write details here.</p></div>`)
      }));
    }
  });
}

function initTheme() {
  document.documentElement.dataset.theme = localStorage.getItem("theme") || "light";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
}

function updateReadingProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const pct = max > 0 ? (scrollY / max) * 100 : 0;
  $("#readingProgress").style.width = `${pct}%`;
}

function openLightbox(src) {
  $("#lightbox img").src = src;
  $("#lightbox").classList.add("active");
}

function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className = "toast-card";
  el.style.borderLeftColor = type === "danger" ? "var(--danger)" : "var(--primary)";
  el.textContent = message;
  $("#toastHost").appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function assetUrl(url = "") {
  if (url.startsWith("http")) return url;
  return `${API_BASE.replace("/api", "")}${url}`;
}

function iconFor(name = "") {
  const key = name.toLowerCase();
  if (key.includes("windows")) return "fa-desktop";
  if (key.includes("linux")) return "fa-terminal";
  if (key.includes("aws")) return "fa-cloud";
  if (key.includes("cloud")) return "fa-cloud";
  if (key.includes("security") || key.includes("firewall")) return "fa-shield-halved";
  if (key.includes("routing")) return "fa-route";
  if (key.includes("switch")) return "fa-ethernet";
  if (key.includes("server")) return "fa-server";
  if (key.includes("command") || key.includes("script")) return "fa-terminal";
  if (key.includes("interview")) return "fa-comments";
  return "fa-book";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function demoArticles() {
  return [
    {
      _id: "demo-ip-conflict",
      title: "How to Fix Windows IP Conflict",
      category: { name: "Windows", icon: "fa-desktop" },
      subCategory: "Networking",
      tags: ["windows", "dhcp", "ipconfig"],
      difficulty: "Beginner",
      shortDescription: "Release and renew DHCP leases, identify duplicate static addresses, and validate DNS after repair.",
      isPinned: true,
      content: "<h2>Introduction</h2><p>Use this runbook when a Windows endpoint reports an IP address conflict.</p><h2>Symptoms</h2><ul><li>Intermittent network access</li><li>Duplicate IP warning</li></ul><h2>Solution</h2><div class=\"info-box\"><strong>Check DHCP first</strong><p>Confirm the address is issued from the correct scope.</p></div>",
      commands: "ipconfig /release\nipconfig /renew\nipconfig /flushdns",
      codeBlock: "Get-NetIPAddress | Sort-Object InterfaceAlias",
      status: "published",
      createdAt: new Date().toISOString()
    }
  ];
}
