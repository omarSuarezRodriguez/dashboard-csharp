const listEl = document.getElementById("conversation-list");
const messagesEl = document.getElementById("messages");
const searchEl = document.getElementById("search");
const titleEl = document.getElementById("chat-title");
const subtitleEl = document.getElementById("chat-subtitle");
const chatAvatarEl = document.getElementById("chat-avatar");
const brandAvatarEl = document.getElementById("brand-avatar");
const restaurantEl = document.getElementById("restaurant-name");
const syncEl = document.getElementById("sync-status");
const formEl = document.getElementById("send-form");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const waMain = document.getElementById("wa-main");
const btnNewChat = document.getElementById("btn-new-chat");
const btnRenameChat = document.getElementById("btn-rename-chat");
const modalNewChat = document.getElementById("modal-new-chat");
const modalRenameChat = document.getElementById("modal-rename-chat");
const formNewChat = document.getElementById("form-new-chat");
const formRenameChat = document.getElementById("form-rename-chat");
const inputNewPhone = document.getElementById("new-chat-phone");
const inputNewName = document.getElementById("new-chat-name");
const inputRenameName = document.getElementById("rename-chat-name");
const renamePhoneHint = document.getElementById("rename-chat-phone");
const contextMenuEl = document.getElementById("chat-context-menu");

let selectedPhone = null;
let contextMenuPhone = null;
let conversations = [];
let listFingerprintCache = "";
let messagesCache = {}; // phone -> { fingerprint, ids: Set }

const POLL_MS = 2000;
const SCROLL_BOTTOM_THRESHOLD = 80;

function initials(name) {
  const parts = (name || "?").replace(/whatsapp:/gi, "").trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const digits = name.replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(-2);
  return (name[0] || "?").toUpperCase();
}

function avatarColorClass(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i)) % 8;
  return `wa-avatar--c${hash}`;
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function formatMessageHtml(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
}

function fmtListTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return "Ayer";
  }
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });
}

function fmtBubbleTime(iso) {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setSyncLabel(text) {
  if (syncEl) syncEl.textContent = text;
}

function listFingerprint(list) {
  return list
    .map((c) => `${c.userPhone}|${c.updatedAt}|${c.preview}|${c.displayName}`)
    .join("\n");
}

function messagesFingerprint(messages) {
  if (!messages?.length) return "";
  return messages.map((m) => `${m.id}:${m.createdAt}`).join("|");
}

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
}

function scrollToBottom(smooth) {
  if (smooth) {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
  } else {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body != null && options.body !== "") {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function loadHealth() {
  const h = await api("/api/health");
  const name = h.restaurant ?? "Panel WhatsApp";
  restaurantEl.textContent = name;
  brandAvatarEl.textContent = initials(name);
}

async function loadConversations() {
  const data = await api("/api/conversations");
  conversations = data.conversations ?? [];
  renderList();
  setSyncLabel("Actualizado " + new Date().toLocaleTimeString("es-CO"));
}

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  const filtered = conversations.filter(
    (c) =>
      !q ||
      c.displayName.toLowerCase().includes(q) ||
      c.preview.toLowerCase().includes(q),
  );

  const fp = listFingerprint(filtered);

  if (fp === listFingerprintCache && listEl.querySelector(".wa-conv")) {
    listEl.querySelectorAll(".wa-conv").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.phone === selectedPhone);
      const conv = filtered.find((c) => c.userPhone === btn.dataset.phone);
      if (!conv) return;
      const timeEl = btn.querySelector(".wa-conv-time");
      const previewEl = btn.querySelector(".wa-conv-preview");
      const nameEl = btn.querySelector(".wa-conv-name");
      if (timeEl) timeEl.textContent = fmtListTime(conv.updatedAt);
      if (nameEl) nameEl.textContent = conv.displayName;
      if (previewEl) {
        previewEl.textContent =
          conv.preview + (conv.messageCount ? ` · ${conv.messageCount} msgs` : "");
      }
    });
    return;
  }

  listFingerprintCache = fp;

  const fragment = document.createDocumentFragment();

  if (!filtered.length) {
    const li = document.createElement("li");
    li.className = "wa-chats-empty";
    li.innerHTML =
      "No hay conversaciones.<br />Los mensajes de WhatsApp aparecerán aquí al sincronizar.";
    fragment.appendChild(li);
    listEl.replaceChildren(fragment);
    return;
  }

  for (const c of filtered) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.phone = c.userPhone;
    btn.className = "wa-conv" + (c.userPhone === selectedPhone ? " active" : "");
    btn.innerHTML = `
      <div class="wa-avatar ${avatarColorClass(c.userPhone)}">${escapeHtml(initials(c.displayName))}</div>
      <div class="wa-conv-body">
        <div class="wa-conv-top">
          <span class="wa-conv-name">${escapeHtml(c.displayName)}</span>
          <span class="wa-conv-time">${fmtListTime(c.updatedAt)}</span>
        </div>
        <span class="wa-conv-preview">${escapeHtml(c.preview)}${c.messageCount ? ` · ${c.messageCount} msgs` : ""}</span>
      </div>
    `;
    btn.onclick = () => selectChat(c.userPhone, c.displayName);
    li.appendChild(btn);
    fragment.appendChild(li);
  }

  listEl.replaceChildren(fragment);
}

function createMessageRow(m, animate) {
  const row = document.createElement("div");
  row.className = `wa-msg-row ${m.direction}` + (animate ? " wa-msg-row--new" : "");
  row.dataset.messageId = m.id;
  row.innerHTML = `
    <div class="wa-bubble ${m.direction}">
      <div class="wa-bubble-text">${formatMessageHtml(m.body)}</div>
      <div class="wa-bubble-footer">
        <time class="wa-bubble-time">${fmtBubbleTime(m.createdAt)}</time>
      </div>
    </div>
  `;
  return row;
}

function showMessagesEmpty() {
  messagesEl.replaceChildren();
  const p = document.createElement("p");
  p.className = "wa-messages-empty";
  p.innerHTML = "No hay mensajes en este chat.<br />Envía el primero abajo.";
  messagesEl.appendChild(p);
}

function showMessagesLoading() {
  messagesEl.replaceChildren();
  const p = document.createElement("p");
  p.className = "wa-messages-loading";
  p.textContent = "Cargando mensajes…";
  messagesEl.appendChild(p);
}

function renderAllMessages(messages, phone, fp, scrollOpts) {
  const { wasAtBottom, smooth } = scrollOpts;

  messagesEl.replaceChildren();
  messagesCache[phone] = {
    fingerprint: fp,
    ids: new Set(messages.map((m) => m.id)),
  };

  if (!messages.length) {
    showMessagesEmpty();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const m of messages) {
    fragment.appendChild(createMessageRow(m, false));
  }
  messagesEl.appendChild(fragment);

  if (wasAtBottom) scrollToBottom(smooth);
}

function appendNewMessages(messages, phone, fp, newMessages, scrollOpts) {
  const { wasAtBottom } = scrollOpts;
  const empty = messagesEl.querySelector(".wa-messages-empty");
  const loading = messagesEl.querySelector(".wa-messages-loading");
  if (empty) empty.remove();
  if (loading) loading.remove();

  const fragment = document.createDocumentFragment();
  for (const m of newMessages) {
    fragment.appendChild(createMessageRow(m, true));
  }
  messagesEl.appendChild(fragment);

  messagesCache[phone] = {
    fingerprint: fp,
    ids: new Set(messages.map((m) => m.id)),
  };

  if (wasAtBottom) scrollToBottom(true);
}

async function refreshMessages(options = {}) {
  const { force = false, smoothScroll = false } = options;
  if (!selectedPhone) return;

  const phone = selectedPhone;
  const wasAtBottom = isNearBottom(messagesEl);

  const data = await api(
    `/api/conversations/${encodeURIComponent(phone)}/messages`,
  );
  const messages = data.messages ?? [];
  const total = data.total ?? messages.length;
  if (selectedPhone === phone) {
    subtitleEl.textContent =
      total === 1 ? "1 mensaje" : `${total.toLocaleString("es-CO")} mensajes`;
  }
  const fp = messagesFingerprint(messages);
  const cache = messagesCache[phone];

  if (!force && cache && cache.fingerprint === fp) {
    return;
  }

  if (!force && cache && messages.length >= cache.ids.size) {
    const newMessages = messages.filter((m) => !cache.ids.has(m.id));
    if (newMessages.length > 0 && newMessages.length < messages.length) {
      appendNewMessages(messages, phone, fp, newMessages, { wasAtBottom });
      return;
    }
    if (newMessages.length === 0 && messages.length === cache.ids.size) {
      messagesCache[phone].fingerprint = fp;
      return;
    }
  }

  renderAllMessages(messages, phone, fp, {
    wasAtBottom: force ? true : wasAtBottom,
    smooth: smoothScroll,
  });
}

function showChatPanel(show) {
  waMain.classList.toggle("has-chat", show);
}

function closeChatView() {
  selectedPhone = null;
  showChatPanel(false);
  messagesEl.replaceChildren();
  titleEl.textContent = "Contacto";
  subtitleEl.textContent = "mensajes de WhatsApp";
  chatAvatarEl.textContent = "?";
  listFingerprintCache = "";
  renderList();
}

function hideContextMenu() {
  contextMenuPhone = null;
  if (contextMenuEl) contextMenuEl.hidden = true;
}

function showContextMenu(clientX, clientY, phone) {
  if (!contextMenuEl) return;
  contextMenuPhone = phone;
  contextMenuEl.hidden = false;
  const menuW = 200;
  const menuH = 48;
  const x = Math.min(clientX, window.innerWidth - menuW - 8);
  const y = Math.min(clientY, window.innerHeight - menuH - 8);
  contextMenuEl.style.left = `${Math.max(8, x)}px`;
  contextMenuEl.style.top = `${Math.max(8, y)}px`;
}

async function deleteChat(phone) {
  const conv = conversations.find((c) => c.userPhone === phone);
  const label = conv?.displayName ?? phone;
  const ok = confirm(
    `¿Eliminar el chat con ${label}?\n\nSe borrarán todos los mensajes del panel. No volverá a aparecer al sincronizar con Twilio.`,
  );
  if (!ok) return;

  hideContextMenu();
  await api(`/api/conversations/${encodeURIComponent(phone)}`, { method: "DELETE" });
  delete messagesCache[phone];
  conversations = conversations.filter((c) => c.userPhone !== phone);
  if (selectedPhone === phone) closeChatView();
  listFingerprintCache = "";
  await loadConversations();
}

async function selectChat(phone, name) {
  selectedPhone = phone;
  titleEl.textContent = name;
  subtitleEl.textContent = "Cargando historial…";
  chatAvatarEl.textContent = initials(name);
  chatAvatarEl.className = `wa-avatar ${avatarColorClass(phone)}`;
  showChatPanel(true);
  renderList();

  if (!messagesCache[phone]) {
    showMessagesLoading();
    await refreshMessages({ force: true, smoothScroll: false });
  } else {
    await refreshMessages({ force: true, smoothScroll: false });
  }
}

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = inputEl.value.trim();
  if (!body || !selectedPhone) return;

  const phone = selectedPhone;
  const tempId = `pending-${Date.now()}`;
  const wasAtBottom = isNearBottom(messagesEl);

  const empty = messagesEl.querySelector(".wa-messages-empty, .wa-messages-loading");
  if (empty) empty.remove();

  const optimistic = {
    id: tempId,
    direction: "outbound",
    body,
    createdAt: new Date().toISOString(),
  };
  messagesEl.appendChild(createMessageRow(optimistic, true));
  if (wasAtBottom) scrollToBottom(true);

  inputEl.value = "";
  inputEl.style.height = "auto";
  sendBtn.disabled = true;

  try {
    await api(`/api/conversations/${encodeURIComponent(phone)}/send`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    delete messagesCache[phone];
    const row = messagesEl.querySelector(`[data-message-id="${tempId}"]`);
    if (row) row.remove();
    await refreshMessages({ force: false, smoothScroll: true });
    await loadConversations();
  } catch (err) {
    const row = messagesEl.querySelector(`[data-message-id="${tempId}"]`);
    if (row) row.remove();
    alert(err.message || "Error al enviar");
  } finally {
    sendBtn.disabled = false;
  }
});

listEl?.addEventListener("contextmenu", (e) => {
  const btn = e.target.closest(".wa-conv");
  if (!btn?.dataset.phone) return;
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, btn.dataset.phone);
});

contextMenuEl?.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
  const phone = contextMenuPhone;
  hideContextMenu();
  if (!phone) return;
  try {
    await deleteChat(phone);
  } catch (err) {
    alert(err.message || "No se pudo eliminar el chat");
  }
});

document.addEventListener("click", (e) => {
  if (contextMenuEl?.hidden) return;
  if (e.target.closest("#chat-context-menu")) return;
  hideContextMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideContextMenu();
});

listEl?.addEventListener("scroll", hideContextMenu, { passive: true });

searchEl.addEventListener("input", () => {
  listFingerprintCache = "";
  renderList();
});

btnNewChat?.addEventListener("click", () => {
  inputNewPhone.value = "";
  inputNewName.value = "";
  modalNewChat.showModal();
  inputNewPhone.focus();
});

document.getElementById("new-chat-cancel")?.addEventListener("click", () => {
  modalNewChat.close();
});

formNewChat?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const phone = inputNewPhone.value.trim();
  const displayName = inputNewName.value.trim();
  if (!phone) return;

  try {
    const created = await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        phone,
        displayName: displayName || undefined,
      }),
    });
    modalNewChat.close();
    listFingerprintCache = "";
    await loadConversations();
    await selectChat(created.userPhone, created.displayName);
  } catch (err) {
    alert(err.message || "No se pudo crear el chat");
  }
});

btnRenameChat?.addEventListener("click", () => {
  if (!selectedPhone) return;
  const conv = conversations.find((c) => c.userPhone === selectedPhone);
  inputRenameName.value = conv?.displayName ?? titleEl.textContent;
  renamePhoneHint.textContent = conv?.userPhone ?? selectedPhone;
  modalRenameChat.showModal();
  inputRenameName.focus();
  inputRenameName.select();
});

document.getElementById("rename-chat-cancel")?.addEventListener("click", () => {
  modalRenameChat.close();
});

formRenameChat?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedPhone) return;
  const displayName = inputRenameName.value.trim();
  if (!displayName) return;

  try {
    await api(`/api/conversations/${encodeURIComponent(selectedPhone)}`, {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    });
    modalRenameChat.close();
    titleEl.textContent = displayName;
    chatAvatarEl.textContent = initials(displayName);
    listFingerprintCache = "";
    await loadConversations();
  } catch (err) {
    alert(err.message || "No se pudo guardar el nombre");
  }
});

titleEl?.addEventListener("dblclick", () => btnRenameChat?.click());

let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await loadConversations();
    if (selectedPhone) {
      await refreshMessages({ force: false, smoothScroll: true });
    }
  } catch {
    setSyncLabel("Sin conexión");
  } finally {
    ticking = false;
  }
}

loadHealth()
  .then(() => tick())
  .catch((err) => {
    restaurantEl.textContent = "Error";
    alert(err.message);
  });

setInterval(tick, POLL_MS);
