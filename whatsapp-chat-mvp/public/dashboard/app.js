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
const waChatEl = document.getElementById("wa-chat");

/** Tu archivo: web_whatsapp.mp3 → public/dashboard/sounds/whatsapp-web.mp3 */
const NOTIFICATION_SOUND = "/sounds/whatsapp-web.mp3";

let selectedPhone = null;
let contextMenuPhone = null;
let conversations = [];
let listFingerprintCache = "";
let messagesCache = {}; // phone -> { fingerprint, ids: Set }

const POLL_MS = 2000;
const SCROLL_BOTTOM_THRESHOLD = 80;
const NOTIFY_DEBOUNCE_MS = 500;

let seenLastMessageId = new Map();
let seenLastInboundMessageId = new Map();
let notificationsArmed = false;
let audioUnlocked = false;
let notifyAudioWarm = null;
let suppressNotificationsUntil = 0;
let openingChatPhone = null;
let titleFlashTimer = null;
const unreadBlinkPhones = new Set();
const baseDocumentTitle = () => document.title;

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

function isNotificationSuppressed() {
  return Date.now() < suppressNotificationsUntil || openingChatPhone != null;
}

function initNotificationAudio() {
  if (notifyAudioWarm) return;
  notifyAudioWarm = new Audio(NOTIFICATION_SOUND);
  notifyAudioWarm.preload = "auto";
  notifyAudioWarm.load();
}

/** Primer clic en la página: desbloquea el navegador sin sonido audible. */
async function unlockNotifications() {
  if (audioUnlocked) return;
  initNotificationAudio();
  const audio = notifyAudioWarm;
  if (!audio) return;

  audio.muted = true;
  audio.volume = 1;
  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audioUnlocked = true;
  } catch {
    audioUnlocked = true;
  } finally {
    audio.muted = false;
  }
}

/** Siempre el mismo whatsapp-web.mp3 precargado (sin tono sintético). */
function playNotificationSound() {
  initNotificationAudio();
  const audio = notifyAudioWarm;
  if (!audio) return;

  audio.muted = false;
  audio.volume = 1;
  audio.pause();
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}

function blinkChatPanel() {
  if (!waChatEl) return;
  waChatEl.classList.remove("wa-chat--notify-pulse");
  void waChatEl.offsetWidth;
  waChatEl.classList.add("wa-chat--notify-pulse");
  window.setTimeout(() => waChatEl.classList.remove("wa-chat--notify-pulse"), 1600);
  if (waMain) {
    waMain.classList.remove("wa-main--notify");
    void waMain.offsetWidth;
    waMain.classList.add("wa-main--notify");
    window.setTimeout(() => waMain.classList.remove("wa-main--notify"), 1600);
  }
}

function isConversationUnread(phone) {
  return unreadBlinkPhones.has(phone) && phone !== selectedPhone;
}

function syncUnreadListStyles() {
  if (!listEl) return;
  listEl.querySelectorAll(".wa-conv").forEach((btn) => {
    btn.classList.toggle("wa-conv--unread", isConversationUnread(btn.dataset.phone));
  });
}

function conversationButtonClass(phone) {
  let cls = "wa-conv";
  if (phone === selectedPhone) cls += " active";
  else if (isConversationUnread(phone)) cls += " wa-conv--unread";
  return cls;
}

function stopTitleFlash() {
  if (!titleFlashTimer) return;
  clearInterval(titleFlashTimer);
  titleFlashTimer = null;
  document.title = baseDocumentTitle();
}

function startTitleFlash() {
  if (!document.hidden || unreadBlinkPhones.size === 0) return;
  if (titleFlashTimer) return;

  const original = baseDocumentTitle();
  let showAlt = true;

  const tick = () => {
    if (unreadBlinkPhones.size === 0) {
      stopTitleFlash();
      return;
    }
    const firstPhone = unreadBlinkPhones.values().next().value;
    const conv = conversations.find((c) => c.userPhone === firstPhone);
    const label = conv?.displayName ?? "Mensaje nuevo";
    const suffix =
      unreadBlinkPhones.size > 1
        ? `${unreadBlinkPhones.size} chats`
        : label;
    document.title = showAlt ? `● ${suffix}` : original;
    showAlt = !showAlt;
  };

  tick();
  titleFlashTimer = window.setInterval(tick, 800);
}

function markConversationUnread(phone) {
  if (phone === selectedPhone) return;
  unreadBlinkPhones.add(phone);
  syncUnreadListStyles();
  startTitleFlash();
}

function clearConversationUnread(phone) {
  if (!unreadBlinkPhones.has(phone)) return;
  unreadBlinkPhones.delete(phone);
  syncUnreadListStyles();
  if (unreadBlinkPhones.size === 0) stopTitleFlash();
}

const notifyCooldown = new Map();

function notifyNewMessage(phone) {
  if (isNotificationSuppressed()) return;
  if (openingChatPhone === phone) return;

  const now = Date.now();
  const last = notifyCooldown.get(phone) ?? 0;
  if (now - last < NOTIFY_DEBOUNCE_MS) return;
  notifyCooldown.set(phone, now);

  playNotificationSound();

  if (phone === selectedPhone && waMain.classList.contains("has-chat")) {
    blinkChatPanel();
  } else {
    markConversationUnread(phone);
  }

  if (document.hidden && unreadBlinkPhones.size > 0) {
    startTitleFlash();
  }
}

function seedSeenMessages(list) {
  for (const c of list) {
    if (c.lastMessageId) seenLastMessageId.set(c.userPhone, c.lastMessageId);
    if (c.lastInboundMessageId) {
      seenLastInboundMessageId.set(c.userPhone, c.lastInboundMessageId);
    }
  }
}

function syncSeenIdsFromConversation(c) {
  if (!c) return;
  if (c.lastMessageId) seenLastMessageId.set(c.userPhone, c.lastMessageId);
  if (c.lastInboundMessageId) {
    seenLastInboundMessageId.set(c.userPhone, c.lastInboundMessageId);
  }
}

/** Solo mensajes recibidos (inbound), no los que envías tú ni el bot. */
function detectNewInboundFromList(list) {
  if (!notificationsArmed) {
    seedSeenMessages(list);
    notificationsArmed = true;
    return;
  }

  if (isNotificationSuppressed()) {
    for (const c of list) syncSeenIdsFromConversation(c);
    return;
  }

  for (const c of list) {
    const prevInbound = seenLastInboundMessageId.get(c.userPhone);
    if (c.lastInboundMessageId && prevInbound !== c.lastInboundMessageId) {
      notifyNewMessage(c.userPhone);
    }
    syncSeenIdsFromConversation(c);
  }
}

function hasNewInboundMessages(messages, prevIds) {
  if (!notificationsArmed || !prevIds) return false;
  return messages.some((m) => m.direction === "inbound" && !prevIds.has(m.id));
}

function notifyFromMessageDelta(phone, messages, prevIds) {
  if (openingChatPhone === phone) return;
  if (!hasNewInboundMessages(messages, prevIds)) return;
  notifyNewMessage(phone);
}

function buildMessageCache(messages, fp) {
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  return {
    fingerprint: fp,
    ids: new Set(messages.map((m) => m.id)),
    lastId: messages.length ? messages[messages.length - 1].id : null,
    lastInboundId: lastInbound?.id ?? null,
  };
}

function syncSeenMessageIdForPhone(phone) {
  const conv = conversations.find((c) => c.userPhone === phone);
  if (conv) {
    syncSeenIdsFromConversation(conv);
    return;
  }
  const cache = messagesCache[phone];
  if (cache?.lastId) seenLastMessageId.set(phone, cache.lastId);
  if (cache?.lastInboundId) seenLastInboundMessageId.set(phone, cache.lastInboundId);
}

function listFingerprint(list) {
  return list
    .map(
      (c) =>
        `${c.userPhone}|${c.updatedAt}|${c.lastMessageId}|${c.preview}|${c.displayName}`,
    )
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
  detectNewInboundFromList(conversations);
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
      const phone = btn.dataset.phone;
      btn.className = conversationButtonClass(phone);
      const conv = filtered.find((c) => c.userPhone === phone);
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
    btn.className = conversationButtonClass(c.userPhone);
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
  messagesCache[phone] = buildMessageCache(messages, fp);

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

  messagesCache[phone] = buildMessageCache(messages, fp);

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
  const prevIds = cache?.ids ? new Set(cache.ids) : null;

  if (!force && cache && cache.fingerprint === fp) {
    return;
  }

  if (!force && cache && messages.length >= cache.ids.size) {
    const newMessages = messages.filter((m) => !cache.ids.has(m.id));
    if (newMessages.length > 0) {
      renderAllMessages(messages, phone, fp, {
        wasAtBottom,
        smooth: smoothScroll,
      });
      notifyFromMessageDelta(phone, messages, prevIds);
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

  if (!force) {
    notifyFromMessageDelta(phone, messages, prevIds);
  }
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
  clearConversationUnread(phone);
  await api(`/api/conversations/${encodeURIComponent(phone)}`, { method: "DELETE" });
  delete messagesCache[phone];
  conversations = conversations.filter((c) => c.userPhone !== phone);
  if (selectedPhone === phone) closeChatView();
  listFingerprintCache = "";
  await loadConversations();
}

async function selectChat(phone, name) {
  suppressNotificationsUntil = Date.now() + 3000;
  openingChatPhone = phone;
  const conv = conversations.find((c) => c.userPhone === phone);
  syncSeenIdsFromConversation(conv);

  clearConversationUnread(phone);
  selectedPhone = phone;
  titleEl.textContent = name;
  subtitleEl.textContent = "Cargando historial…";
  chatAvatarEl.textContent = initials(name);
  chatAvatarEl.className = `wa-avatar ${avatarColorClass(phone)}`;
  showChatPanel(true);
  renderList();

  try {
    if (!messagesCache[phone]) {
      showMessagesLoading();
    }
    await refreshMessages({ force: true, smoothScroll: false });
    syncSeenMessageIdForPhone(phone);
  } finally {
    openingChatPhone = null;
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
    if (selectedPhone) {
      await refreshMessages({ force: false, smoothScroll: true });
    }
    await loadConversations();
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

function trySilentAutounlock() {
  initNotificationAudio();
  const audio = notifyAudioWarm;
  if (!audio || audioUnlocked) return;
  audio.muted = true;
  audio.volume = 1;
  const p = audio.play();
  if (!p?.then) return;
  p.then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audioUnlocked = true;
  }).catch(() => {
    audio.muted = false;
  });
}

initNotificationAudio();
void trySilentAutounlock();

document.addEventListener(
  "pointerdown",
  () => {
    void unlockNotifications();
  },
  { once: true, passive: true },
);

listEl?.addEventListener(
  "mousedown",
  (e) => {
    const btn = e.target.closest(".wa-conv");
    if (!btn?.dataset.phone) return;
    suppressNotificationsUntil = Date.now() + 3000;
    const phone = btn.dataset.phone;
    const conv = conversations.find((c) => c.userPhone === phone);
    syncSeenIdsFromConversation(conv);
  },
  true,
);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && unreadBlinkPhones.size > 0) {
    startTitleFlash();
  } else {
    stopTitleFlash();
  }
});
