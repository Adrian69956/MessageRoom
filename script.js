// ===================== MessageRoom: основная логика =====================

// ---------- Состояние ----------
let me = null;            // текущий пользователь { id }
let profiles = {};        // id -> { id, display_name, username }
let chats = [];           // чаты текущего пользователя
let currentId = null;     // открытый чат
let showArchive = false;  // показываем архив?
let searchResults = [];   // найденные люди
let channel = null;       // подписка на события в реальном времени
let reloadTimer = null;
let searchTimer = null;
let menuIndex = null;
let menuShownAt = 0;

const PIN_ICON = '<svg viewBox="0 0 24 24"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>';

// ---------- Элементы страницы ----------
const app = document.getElementById("app");
const chatList = document.getElementById("chatList");
const search = document.getElementById("search");
const messagesBox = document.getElementById("messages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const backBtn = document.getElementById("backBtn");
const headAvatar = document.getElementById("headAvatar");
const headName = document.getElementById("headName");
const headStatus = document.getElementById("headStatus");
const menu = document.getElementById("contextMenu");
const chatEl = document.querySelector(".chat");
const chatMenu = document.createElement("div");   // меню чата (закрепить, архив)
chatMenu.className = "context-menu";
document.body.append(chatMenu);

// ---------- Вспомогательные функции ----------
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function initial(s) { return (s || "?")[0].toUpperCase(); }
function currentChat() { return chats.find((c) => c.id === currentId); }
function nameOf(id) { const p = profiles[id]; return p ? p.display_name : "Пользователь"; }
function otherUserId(c) { return c.members.find((id) => id !== me.id); }
function chatTitle(c) { return c.type === "private" ? nameOf(otherUserId(c)) : (c.title || "Чат"); }
function fmtTime(iso) { return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }); }
function lastMessage(c) { return c.messages[c.messages.length - 1]; }
function lastTime(c) { const m = lastMessage(c); return m ? new Date(m.created_at).getTime() : c.createdAt; }
function unreadCount(c) {
  return c.messages.filter((m) => m.sender_id !== me.id && new Date(m.created_at).getTime() > c.lastRead).length;
}
function sortChats() {
  chats.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return lastTime(b) - lastTime(a);
  });
}

// ---------- Загрузка данных из Supabase ----------
async function loadAll() {
  const { data: rows, error } = await sb.from("chat_members")
    .select("chat_id, user_id, pinned, archived, last_read_at, chats(id, type, title, created_at)");
  if (error) { console.error(error); return; }

  const ids = [...new Set(rows.map((r) => r.chat_id))];
  const userIds = [...new Set(rows.map((r) => r.user_id).concat(me.id))];

  const { data: profs } = await sb.from("profiles").select("id, display_name, username, bio, allow_dm").in("id", userIds);
  (profs || []).forEach((p) => { profiles[p.id] = p; });

  let msgs = [];
  if (ids.length) {
    const res = await sb.from("messages")
      .select("id, chat_id, sender_id, text, created_at, edited_at")
      .in("chat_id", ids).order("created_at", { ascending: false }).limit(500);
    msgs = res.data || [];
  }

  chats = ids.map((id) => {
    const group = rows.filter((r) => r.chat_id === id);
    const mine = group.find((r) => r.user_id === me.id);
    if (!mine) return null;
    const others = group.filter((r) => r.user_id !== me.id);
    return {
      id: id,
      type: mine.chats.type,
      title: mine.chats.title,
      createdAt: new Date(mine.chats.created_at).getTime(),
      pinned: mine.pinned,
      archived: mine.archived,
      lastRead: new Date(mine.last_read_at).getTime(),
      otherRead: others.length ? Math.max(...others.map((o) => new Date(o.last_read_at).getTime())) : 0,
      members: group.map((r) => r.user_id),
      messages: msgs.filter((m) => m.chat_id === id).reverse()
    };
  }).filter(Boolean);

  sortChats();
  if (currentId && !currentChat()) currentId = null;
  renderChatList();
  renderHeader();
  renderMessages();
}

function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(loadAll, 300);
}

// ---------- Список чатов ----------
function chatItem(c) {
  const title = chatTitle(c);
  const last = lastMessage(c);
  const unread = unreadCount(c);
  const item = el("div", "chat-item" + (c.id === currentId ? " active" : ""));
  item.dataset.id = c.id;
  item.append(el("div", "avatar", initial(title)));
  const info = el("div", "chat-info");
  const top = el("div", "chat-top");
  top.append(el("div", "chat-name", title));
  const date = el("div", "chat-date", last ? fmtDate(last.created_at) : "");
  if (c.pinned) { const pin = el("span", "pin"); pin.innerHTML = PIN_ICON; date.append(pin); }
  top.append(date);
  const bottom = el("div", "chat-bottom");
  bottom.append(el("div", "chat-last", last ? (last.sender_id === me.id ? "Вы: " : "") + last.text : "Нет сообщений"));
  if (unread > 0 && c.id !== currentId) bottom.append(el("div", "badge", String(unread)));
  info.append(top, bottom);
  item.append(info);
  item.addEventListener("click", () => openChat(c.id));
  return item;
}

function personItem(p) {
  const item = el("div", "chat-item");
  item.append(el("div", "avatar", initial(p.display_name)));
  const info = el("div", "chat-info");
  info.append(el("div", "chat-name", p.display_name), el("div", "chat-last", p.username ? "@" + p.username : ""));
  item.append(info);
  item.addEventListener("click", () => startChatWith(p.id));
  return item;
}

function renderChatList() {
  const q = search.value.trim().toLowerCase().replace(/^@/, "");
  chatList.innerHTML = "";

  if (showArchive) {
    const back = el("div", "list-note link", "← Назад к чатам");
    back.addEventListener("click", () => { showArchive = false; renderChatList(); });
    chatList.append(back);
  }
  const archivedCount = chats.filter((c) => c.archived).length;
  if (!showArchive && archivedCount > 0 && !q) {
    const row = el("div", "list-note link", "Архив (" + archivedCount + ")");
    row.addEventListener("click", () => { showArchive = true; renderChatList(); });
    chatList.append(row);
  }

  const visible = chats.filter((c) => c.archived === showArchive && chatTitle(c).toLowerCase().includes(q));
  visible.forEach((c) => chatList.append(chatItem(c)));
  if (!visible.length && !q) {
    chatList.append(el("div", "list-note",
      showArchive ? "Архив пуст" : "Чатов пока нет. Введите имя или @юзернейм в поиске, чтобы найти человека."));
  }

  if (q.length >= 2 && searchResults.length) {
    chatList.append(el("div", "list-title", "Люди"));
    searchResults.forEach((p) => chatList.append(personItem(p)));
  }
}

// ---------- Поиск людей ----------
async function searchPeople() {
  const q = search.value.trim().replace(/^@/, "").replace(/[,()%*_\\]/g, "");
  if (q.length < 2) { searchResults = []; renderChatList(); return; }
    const { data } = await sb.from("profiles").select("id, display_name, username, bio, allow_dm")
    .or("username.ilike.*" + q + "*,display_name.ilike.*" + q + "*")
    .neq("id", me.id).limit(10);
  searchResults = data || [];
  searchResults.forEach((p) => { profiles[p.id] = p; });
  renderChatList();
}
search.addEventListener("input", () => {
  renderChatList();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchPeople, 300);
});

async function startChatWith(userId) {
  const { data, error } = await sb.rpc("start_private_chat", { other_user: userId });
  if (error) { alert(error.message.includes("dm_not_allowed") ? "Этот пользователь не принимает новые чаты" : "Не удалось открыть чат: " + error.message); return; }
  search.value = "";
  searchResults = [];
  await loadAll();
  openChat(data);
}

// ---------- Шапка и сообщения ----------
function renderHeader() {
  const c = currentChat();
  if (!c) { headName.textContent = ""; headStatus.textContent = ""; headAvatar.textContent = ""; return; }
  const title = chatTitle(c);
  headName.textContent = title;
  headAvatar.textContent = initial(title);
  if (c.type === "private") {
    const p = profiles[otherUserId(c)];
    headStatus.textContent = p && p.username ? "@" + p.username : "";
  } else {
    headStatus.textContent = c.members.length + " участн.";
  }
  headStatus.className = "status";
}

function renderMessages() {
  messagesBox.innerHTML = "";
  const c = currentChat();
  if (!c) return;
  c.messages.forEach((m, index) => {
    const mine = m.sender_id === me.id;
    const div = el("div", "message " + (mine ? "mine" : "their"));
    div.dataset.index = index;
    if (!mine && c.type !== "private") div.append(el("div", "sender", nameOf(m.sender_id)));
    div.append(el("div", "", m.text));
    const meta = el("div", "meta", (m.edited_at ? "изм. " : "") + fmtTime(m.created_at));
    if (mine) {
      const read = c.otherRead >= new Date(m.created_at).getTime();
      meta.append(el("span", "ticks" + (read ? " read" : ""), read ? "✓✓" : "✓"));
    }
    div.append(meta);
    messagesBox.append(div);
  });
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

function openChat(id) {
  currentId = id;
  app.classList.add("in-chat");
  renderHeader();
  renderMessages();
  markRead();
  renderChatList();
}

async function markRead() {
  const c = currentChat();
  if (!c || unreadCount(c) === 0) return;
  const last = lastMessage(c);
  c.lastRead = new Date(last.created_at).getTime();
  renderChatList();
  await sb.from("chat_members").update({ last_read_at: last.created_at })
    .eq("chat_id", c.id).eq("user_id", me.id);
}

// ---------- Отправка, правка, удаление ----------
function addMessage(m) {
  const c = chats.find((x) => x.id === m.chat_id);
  if (!c) { scheduleReload(); return; }
  if (c.messages.some((x) => x.id === m.id)) return;
  c.messages.push(m);
  c.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  sortChats();
  if (c.id === currentId) { renderMessages(); markRead(); }
  renderChatList();
}

async function sendMessage() {
  const c = currentChat();
  const text = input.value.trim();
  if (!c || !text) return;
  input.value = "";
  input.focus();
  const { data, error } = await sb.from("messages").insert({ chat_id: c.id, text: text }).select().single();
  if (error) { alert("Не отправилось: " + error.message); input.value = text; return; }
  addMessage(data);
}
sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

async function editMessage(index) {
  const m = currentChat().messages[index];
  const text = prompt("Изменить сообщение", m.text);
  if (text === null || text.trim() === "" || text.trim() === m.text) return;
  const edited = new Date().toISOString();
  const { error } = await sb.from("messages").update({ text: text.trim(), edited_at: edited }).eq("id", m.id);
  if (error) { alert("Не удалось изменить: " + error.message); return; }
  m.text = text.trim();
  m.edited_at = edited;
  renderMessages();
  renderChatList();
}

async function deleteMessage(index) {
  const c = currentChat();
  const m = c.messages[index];
  const { error } = await sb.from("messages").delete().eq("id", m.id);
  if (error) { alert("Не удалось удалить: " + error.message); return; }
  c.messages.splice(index, 1);
  renderMessages();
  renderChatList();
}

// ---------- Закрепление и архив ----------
async function setChatFlag(c, field, value) {
  c[field] = value;
  sortChats();
  renderChatList();
  const { error } = await sb.from("chat_members").update({ [field]: value })
    .eq("chat_id", c.id).eq("user_id", me.id);
  if (error) { alert("Не получилось: " + error.message); scheduleReload(); }
}

// ---------- Контекстные меню ----------
function placeMenu(m, x, y) {
  m.style.display = "block";
  m.style.left = Math.max(8, Math.min(x, window.innerWidth - m.offsetWidth - 8)) + "px";
  m.style.top = Math.max(8, Math.min(y, window.innerHeight - m.offsetHeight - 8)) + "px";
  menuShownAt = Date.now();
}
function hideMenus() { menu.style.display = "none"; chatMenu.style.display = "none"; }

function showMenu(x, y, index) {      // меню сообщения
  menuIndex = index;
  const mine = currentChat().messages[index].sender_id === me.id;
  menu.querySelector('[data-action="edit"]').style.display = mine ? "flex" : "none";
  menu.querySelector('[data-action="delete"]').style.display = mine ? "flex" : "none";
  chatMenu.style.display = "none";
  placeMenu(menu, x, y);
}

function showChatMenu(x, y, c) {      // меню чата
  chatMenu.innerHTML = "";
  const pin = el("button", "", c.pinned ? "Открепить" : "Закрепить");
  pin.addEventListener("click", () => { setChatFlag(c, "pinned", !c.pinned); hideMenus(); });
  const arch = el("button", "", c.archived ? "Вернуть из архива" : "В архив");
  arch.addEventListener("click", () => { setChatFlag(c, "archived", !c.archived); hideMenus(); });
  chatMenu.append(pin, arch);
  menu.style.display = "none";
  placeMenu(chatMenu, x, y);
}

function onLongPress(container, selector, callback) {   // долгое нажатие на телефоне
  let timer = null;
  container.addEventListener("touchstart", (e) => {
    const target = e.target.closest(selector);
    if (!target) return;
    const t = e.touches[0];
    timer = setTimeout(() => callback(target, t.clientX, t.clientY), 500);
  });
  ["touchend", "touchmove", "touchcancel"].forEach((ev) => {
    container.addEventListener(ev, () => clearTimeout(timer));
  });
}

messagesBox.addEventListener("contextmenu", (e) => {
  const msg = e.target.closest(".message");
  if (!msg) return;
  e.preventDefault();
  showMenu(e.clientX, e.clientY, Number(msg.dataset.index));
});
onLongPress(messagesBox, ".message", (t, x, y) => showMenu(x, y, Number(t.dataset.index)));

chatList.addEventListener("contextmenu", (e) => {
  const item = e.target.closest(".chat-item[data-id]");
  if (!item) return;
  e.preventDefault();
  showChatMenu(e.clientX, e.clientY, chats.find((c) => c.id === item.dataset.id));
});
onLongPress(chatList, ".chat-item[data-id]", (t, x, y) =>
  showChatMenu(x, y, chats.find((c) => c.id === t.dataset.id)));

menu.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  const action = btn && btn.dataset.action;
  if (!action) return;
  if (action === "edit") editMessage(menuIndex);
  else if (action === "delete") deleteMessage(menuIndex);
  else alert("Эта функция появится позже");
  hideMenus();
});
document.addEventListener("click", (e) => {
  if (Date.now() - menuShownAt < 400) return;
  if (!menu.contains(e.target) && !chatMenu.contains(e.target)) hideMenus();
});

// ---------- Назад (стрелка и свайп вправо) ----------
backBtn.addEventListener("click", () => app.classList.remove("in-chat"));
let startX = 0, startY = 0;
chatEl.addEventListener("touchstart", (e) => {
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
});
chatEl.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - startX;
  const dy = e.changedTouches[0].clientY - startY;
  if (dx > 90 && Math.abs(dy) < 50) app.classList.remove("in-chat");
});

// ---------- Реальное время ----------
function onMessageChange(payload) {
  if (payload.eventType === "INSERT") {
    addMessage(payload.new);
  } else if (payload.eventType === "UPDATE") {
    chats.forEach((c) => c.messages.forEach((m) => {
      if (m.id === payload.new.id) { m.text = payload.new.text; m.edited_at = payload.new.edited_at; }
    }));
    renderMessages();
    renderChatList();
  } else if (payload.eventType === "DELETE") {
    const id = payload.old.id;
    chats.forEach((c) => { c.messages = c.messages.filter((m) => m.id !== id); });
    renderMessages();
    renderChatList();
  }
}

function subscribeRealtime() {
  unsubscribeRealtime();
  channel = sb.channel("messageroom")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, onMessageChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, scheduleReload)
    .subscribe();
}
function unsubscribeRealtime() {
  if (channel) { sb.removeChannel(channel); channel = null; }
}

// ---------- Запуск и остановка (вызываются из auth.js) ----------
async function startApp(user) {
  me = { id: user.id };
  showArchive = false;
  searchResults = [];
  search.value = "";
  await loadAll();
  subscribeRealtime();
  if (window.innerWidth > 768) {
    const first = chats.find((c) => !c.archived);
    if (first) openChat(first.id);
  }
}

function stopApp() {
  unsubscribeRealtime();
  me = null;
  profiles = {};
  chats = [];
  currentId = null;
  searchResults = [];
  search.value = "";
  chatList.innerHTML = "";
  messagesBox.innerHTML = "";
  headName.textContent = "";
  headStatus.textContent = "";
  headAvatar.textContent = "";
  app.classList.remove("in-chat");
}

// ---------- Тема и настройки ----------
const overlay = document.getElementById("settingsOverlay");
const themeBtns = document.querySelectorAll(".theme-btn");

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtns.forEach((b) => b.classList.toggle("active", b.dataset.theme === theme));
  try { localStorage.setItem("theme", theme); } catch (e) {}
}
themeBtns.forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme)));
document.getElementById("menuBtn").addEventListener("click", () => overlay.classList.add("open"));
document.getElementById("closeSettings").addEventListener("click", () => overlay.classList.remove("open"));
let savedTheme = "light";
try { savedTheme = localStorage.getItem("theme") || "light"; } catch (e) {}
setTheme(savedTheme);
// ===================== Профиль собеседника =====================
const infoPanel = document.getElementById("infoPanel");
const infoAvatar = document.getElementById("infoAvatar");
const infoName = document.getElementById("infoName");
const infoSub = document.getElementById("infoSub");
const infoBio = document.getElementById("infoBio");
const infoBioRow = document.getElementById("infoBioRow");
const infoHandle = document.getElementById("infoHandle");
const infoHandleRow = document.getElementById("infoHandleRow");
const infoPin = document.getElementById("infoPin");
const infoCopy = document.getElementById("infoCopy");

function openInfo() { infoPanel.classList.add("open"); refreshInfo(); }
function closeInfo() { infoPanel.classList.remove("open"); }

function refreshInfo() {
  if (!infoPanel.classList.contains("open")) return;
  const c = currentChat();
  if (!c) { closeInfo(); return; }
  const p = c.type === "private" ? profiles[otherUserId(c)] : null;
  const title = chatTitle(c);
  infoAvatar.textContent = initial(title);
  infoName.textContent = title;
  infoSub.textContent = c.type === "private" ? "" : c.members.length + " участн.";
  infoBio.textContent = p && p.bio ? p.bio : "";
  infoBioRow.style.display = p && p.bio ? "block" : "none";
  infoHandle.textContent = p && p.username ? "@" + p.username : "";
  infoHandleRow.style.display = p && p.username ? "block" : "none";
  infoPin.textContent = c.pinned ? "Открепить чат" : "Закрепить чат";
  infoCopy.textContent = "Скопировать @юзернейм";
  infoCopy.style.display = p && p.username ? "block" : "none";
}

document.querySelector(".chat-header").addEventListener("click", (e) => {
  if (e.target.closest("#backBtn")) return;
  if (currentChat()) openInfo();
});
document.getElementById("infoClose").addEventListener("click", closeInfo);
infoPin.addEventListener("click", () => {
  const c = currentChat();
  if (!c) return;
  setChatFlag(c, "pinned", !c.pinned);
  refreshInfo();
});
infoCopy.addEventListener("click", () => {
  const c = currentChat();
  const p = c && profiles[otherUserId(c)];
  if (!p || !p.username) return;
  navigator.clipboard.writeText("@" + p.username).then(() => {
    infoCopy.textContent = "Скопировано";
    setTimeout(refreshInfo, 1500);
  }).catch(() => {});
});

// при смене чата обновляем открытую панель
const baseOpenChat = openChat;
openChat = function (id) { baseOpenChat(id); refreshInfo(); };

// ===================== Настройки аккаунта =====================
const setName = document.getElementById("setName");
const setHandle = document.getElementById("setHandle");
const setBio = document.getElementById("setBio");
const setDm = document.getElementById("setDm");
const setMsg = document.getElementById("setMsg");
const setScale = document.getElementById("setScale");

function showSetMsg(text, isError) {
  setMsg.textContent = text;
  setMsg.className = "settings-msg" + (isError ? " error" : "");
}

function fillSettings() {
  if (!me) return;
  const p = profiles[me.id] || {};
  setName.value = p.display_name || "";
  setHandle.value = p.username || "";
  setBio.value = p.bio || "";
  setDm.value = p.allow_dm || "everyone";
  showSetMsg("", false);
}
document.getElementById("menuBtn").addEventListener("click", fillSettings);

document.getElementById("saveProfile").addEventListener("click", async () => {
  const name = setName.value.trim();
  const handle = setHandle.value.trim().replace(/^@/, "");
  const bio = setBio.value.trim();
  if (!name) { showSetMsg("Введите имя", true); return; }
  if (!HANDLE_RULE.test(handle)) { showSetMsg(HANDLE_HELP, true); return; }

  const { error } = await sb.from("profiles")
    .update({ display_name: name, username: handle, bio: bio || null, allow_dm: setDm.value })
    .eq("id", me.id);
  if (error) {
    showSetMsg(error.code === "23505" ? "Этот юзернейм уже занят" : "Не сохранилось: " + error.message, true);
    return;
  }
  profiles[me.id] = Object.assign(profiles[me.id] || { id: me.id }, {
    display_name: name, username: handle, bio: bio || null, allow_dm: setDm.value
  });
  accountInfo.textContent = "Вы вошли как " + name + " (@" + handle + ")";
  showSetMsg("Сохранено", false);
  renderChatList();
  renderMessages();
});

// ---------- Масштаб сообщений ----------
function applyScale(v) {
  document.documentElement.style.setProperty("--msg-scale", v / 100);
  document.getElementById("scaleLabel").textContent = "Масштаб сообщений: " + v + "%";
  setScale.value = v;
}
setScale.addEventListener("input", () => {
  applyScale(Number(setScale.value));
  try { localStorage.setItem("scale", setScale.value); } catch (e) {}
});
let savedScale = 100;
try { savedScale = Number(localStorage.getItem("scale")) || 100; } catch (e) {}
applyScale(savedScale);