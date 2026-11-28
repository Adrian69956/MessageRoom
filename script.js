// ===================== MessageRoom: основная логика =====================

// ---------- Состояние ----------
let me = null;              // { id, email }
let profiles = {};          // id -> профиль
let chats = [];
let currentId = null;
let searchResults = [];
let channel = null;
let typingChannels = {};    // chatId -> канал «печатает...»
let typingState = {};       // chatId -> { user, until }
let presence = {};          // userId -> { last_seen, approx }
let blocked = new Set();    // кого я заблокировал
let replyTo = null;         // сообщение, на которое отвечаем
let editing = null;         // сообщение, которое редактируем
let unreadFrom = 0;         // откуда начинаются непрочитанные в открытом чате
let reloadTimer = null, searchTimer = null, presenceTimer = null, lastTypingSent = 0;
let screenStack = ["scrChats"];

const prefs = Object.assign({ notifMsgs: true, sound: true, enterSend: true, wallpaper: 0, scale: 100, theme: "light" },
  (() => { try { return JSON.parse(localStorage.getItem("prefs") || "{}"); } catch (e) { return {}; } })());
try {   // настройки из старой версии сайта
  if (localStorage.getItem("theme")) prefs.theme = localStorage.getItem("theme");
  if (localStorage.getItem("scale")) prefs.scale = Number(localStorage.getItem("scale")) || 100;
} catch (e) {}
function savePrefs() { try { localStorage.setItem("prefs", JSON.stringify(prefs)); } catch (e) {} }

const ICONS = {
  pin: '<svg viewBox="0 0 24 24"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>',
  tick1: '<svg viewBox="0 0 18 12" class="tk"><path d="M1.5 6.5 5 10l7-8"/></svg>',
  tick2: '<svg viewBox="0 0 18 12" class="tk"><path d="M1.5 6.5 5 10l7-8"/><path d="M8.5 9.5 9 10l7-8"/></svg>',
  verified: '<svg viewBox="0 0 24 24" class="verified"><path d="M12 1l2.6 2.2 3.4-.4.9 3.3 3 1.7-1.4 3.2 1.4 3.2-3 1.7-.9 3.3-3.4-.4L12 23l-2.6-2.2-3.4.4-.9-3.3-3-1.7L3.5 13 2.1 9.8l3-1.7.9-3.3 3.4.4z"/><path d="m8 12 3 3 5-6" class="vcheck"/></svg>',
  logo: '<svg viewBox="0 0 24 24" class="logo"><path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
  archive: '<svg viewBox="0 0 24 24" class="logo"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
  reply: '<svg class="ic" viewBox="0 0 24 24"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
  edit: '<svg class="ic" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  copy: '<svg class="ic" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  trash: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  pinI: '<svg class="ic" viewBox="0 0 24 24"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>',
  archI: '<svg class="ic" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
  bell: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  bellOff: '<svg class="ic" viewBox="0 0 24 24"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/></svg>',
  read: '<svg class="ic" viewBox="0 0 24 24"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>',
  block: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>',
  at: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>',
  info: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  broom: '<svg class="ic" viewBox="0 0 24 24"><path d="m13 11 9-9"/><path d="M14.6 12.6c.8.8.9 2.1.2 3L10 22l-8-8 6.4-4.8c.9-.7 2.2-.6 3 .2Z"/><path d="m6.8 10.4 6.8 6.8"/></svg>'
};
const EMOJI = "😀😃😄😁😆😅😂🤣😊😇🙂😉😍🥰😘😋😛😜🤪😎🤩🥳😏😒😞😔😟😕🙁😣😖😫😩🥺😢😭😤😠😡🤯😳🥵🥶😱😨😰😥🤗🤔🤭🤫😶😐😑😬🙄😯😮😲🥱😴🤤😷🤒🤕🤑🤠😈👿💩🤡👻💀👽🤖🎃😺👍👎👌✌️🤞🤟🤘👏🙌🙏💪👋🤝❤️🧡💛💚💙💜🖤🤍💔💯🔥✨⭐🎉🎁🎂🌹🌸☀️🌙⚡☕🍕🍔🍺⚽🎮🎵📌✅❌❓❗";
const WALLPAPERS = ["default", "blue", "green", "pink", "sunset", "plain"];
const AV_COLORS = 7;

// ---------- Элементы ----------
const $ = (id) => document.getElementById(id);
const app = $("app");
const chatList = $("chatList"), archiveList = $("archiveList");
const search = $("search");
const messagesBox = $("messages");
const input = $("messageInput");
const headAvatar = $("headAvatar"), headName = $("headName"), headStatus = $("headStatus");
const ctxMenu = $("ctxMenu"), mainMenu = $("mainMenu");
const composer = $("composer"), composeBar = $("composeBar"), readonlyBar = $("readonlyBar");
const toBottom = $("toBottom");
const infoPanel = $("infoPanel");

// ---------- Вспомогательные функции ----------
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svgEl(html, className) { const s = el("span", className); s.innerHTML = html; return s; }
function initial(s) { return Array.from((s || "?").trim() || "?")[0].toUpperCase(); }
function colorIndex(id) { let h = 0; for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % AV_COLORS; }
function currentChat() { return chats.find((c) => c.id === currentId); }
function nameOf(id) { const p = profiles[id]; return p ? p.display_name : "Пользователь"; }
function otherUserId(c) { return c.members.find((id) => id !== me.id); }
function chatTitle(c) { return c.type === "private" ? nameOf(otherUserId(c)) : (c.title || "Чат"); }
function isBlockedChat(c) { return c.type === "private" && blocked.has(otherUserId(c)); }
function canWrite(c) { return (c.type !== "system" || window.appStatus.is_admin) && !isBlockedChat(c); }
function lastMessage(c) { return c.messages[c.messages.length - 1]; }
function fmtMs(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}
function previewOf(m) {
  if (!m) return "";
  if (m.text) return m.text.replace(/\s+/g, " ");
  if (m.voice_path) return "🎤 Голосовое сообщение" + (m.voice_ms ? " · " + fmtMs(m.voice_ms) : "");
  return "";
}
function lastTime(c) { const m = lastMessage(c); return m ? new Date(m.created_at).getTime() : c.createdAt; }
function unreadCount(c) { return c.unread || 0; }
function sortChats() { chats.sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : lastTime(b) - lastTime(a))); }
function isTyping(c) { const t = typingState[c.id]; return t && t.until > Date.now() ? t : null; }

function makeAvatar(c_or_p, size) {
  const a = el("div", "avatar" + (size ? " " + size : ""));
  let name, id, url;
  if (c_or_p.kind === "archive") { a.classList.add("av-archive"); a.innerHTML = ICONS.archive; return a; }
  if (c_or_p.members) {     // чат
    if (c_or_p.type === "system") { a.classList.add("av-system"); a.innerHTML = ICONS.logo; return a; }
    const p = c_or_p.type === "private" ? profiles[otherUserId(c_or_p)] : null;
    name = chatTitle(c_or_p); id = p ? p.id : c_or_p.id; url = p && p.avatar_url;
  } else { name = c_or_p.display_name; id = c_or_p.id; url = c_or_p.avatar_url; }
  a.classList.add("av" + colorIndex(id));
  if (url) { const img = el("img"); img.src = url; img.alt = ""; img.onerror = () => img.remove(); a.append(img); }
  a.append(el("span", "av-letter", initial(name)));
  return a;
}
function setAvatar(target, src) { const a = makeAvatar(src, ""); target.className = a.className + " " + Array.from(target.classList).filter((x) => ["big", "huge", "editable"].includes(x)).join(" "); target.innerHTML = a.innerHTML; }

const sameDay = (a, b) => a.toDateString() === b.toDateString();
function fmtTime(iso) { return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function fmtListTime(iso) {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return fmtTime(iso);
  if (now - d < 6 * 86400000) return d.toLocaleDateString("ru-RU", { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtDay(d) {
  const now = new Date(), y = new Date(now.getTime() - 86400000);
  if (sameDay(d, now)) return "Сегодня";
  if (sameDay(d, y)) return "Вчера";
  return d.toLocaleDateString("ru-RU", d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}
function lastSeenText(uid) {
  const p = presence[uid];
  if (!p) return "был(а) недавно";
  if (p.last_seen) {
    const t = new Date(p.last_seen), diff = Date.now() - t.getTime();
    if (diff < 120000) return "в сети";
    if (diff < 3600000) return "был(а) " + Math.floor(diff / 60000) + " мин. назад";
    if (sameDay(t, new Date())) return "был(а) в " + fmtTime(p.last_seen);
    if (sameDay(t, new Date(Date.now() - 86400000))) return "был(а) вчера в " + fmtTime(p.last_seen);
    return "был(а) " + t.toLocaleDateString("ru-RU");
  }
  return { recently: "был(а) недавно", week: "был(а) на этой неделе", month: "был(а) в этом месяце" }[p.approx] || "был(а) давно";
}
function isOnline(uid) { const p = presence[uid]; return !!(p && p.last_seen && Date.now() - new Date(p.last_seen).getTime() < 120000); }
function chatStatus(c) {
  if (c.type === "system") return { text: "служебные уведомления", online: false };
  if (c.type !== "private") return { text: c.members.length + " участн.", online: false };
  if (isTyping(c)) return { text: "печатает...", online: true };
  const uid = otherUserId(c);
  return { text: lastSeenText(uid), online: isOnline(uid) };
}
function appendText(target, text) {   // текст со ссылками
  const parts = text.split(/(https?:\/\/[^\s<]+)/g);
  parts.forEach((part, i) => {
    if (i % 2) { const a = el("a", "", part); a.href = part; a.target = "_blank"; a.rel = "noopener noreferrer"; target.append(a); }
    else if (part) target.append(document.createTextNode(part));
  });
}
let toastTimer = null;
function toast(text) {
  const t = $("toast"); t.textContent = text; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
function copyText(text, note) { navigator.clipboard.writeText(text).then(() => toast(note || "Скопировано")).catch(() => {}); }

// ---------- Загрузка данных ----------
const MSG_PAGE = 30;        // сколько сообщений одного чата грузим за раз
const MSG_COLUMNS = "id, chat_id, sender_id, text, created_at, edited_at, reply_to, voice_path, voice_ms, media_path, media_type, media_mime, media_size, media_duration_ms";

// Последние MSG_PAGE сообщений чата. before — подгрузить те, что старше указанной даты.
async function fetchMessages(chatId, before, clearedAt) {
  let query = sb.from("messages").select(MSG_COLUMNS)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MSG_PAGE);
  if (before) query = query.lt("created_at", before);
  if (clearedAt) query = query.gt("created_at", new Date(clearedAt).toISOString());
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return (data || []).reverse();
}

async function loadAll() {
  const { data: rows, error } = await sb.from("chat_members")
    .select("chat_id, user_id, pinned, archived, muted, cleared_at, last_read_at, chats(id, type, title, created_at)");
  if (error) { console.error(error); return; }
  const ids = [...new Set(rows.map((r) => r.chat_id))];
  const userIds = [...new Set(rows.map((r) => r.user_id).concat(me.id, [...blocked]))];
  await loadProfiles(userIds);

  chats = ids.map((id) => {
    const group = rows.filter((r) => r.chat_id === id);
    const mine = group.find((r) => r.user_id === me.id);
    if (!mine || !mine.chats) return null;
    const others = group.filter((r) => r.user_id !== me.id);
    const clearedAt = mine.cleared_at ? new Date(mine.cleared_at).getTime() : 0;
    return {
      id: id, type: mine.chats.type, title: mine.chats.title,
      createdAt: new Date(mine.chats.created_at).getTime(),
      pinned: mine.pinned, archived: mine.archived, muted: mine.muted, clearedAt: clearedAt,
      lastRead: new Date(mine.last_read_at).getTime(),
      otherRead: others.length ? Math.max(...others.map((o) => new Date(o.last_read_at).getTime())) : 0,
      members: group.map((r) => r.user_id),
      messages: [], hasMore: false, loadingOlder: false
    };
  }).filter(Boolean);
  // История грузится отдельно для каждого чата: раньше один общий лимит на 1000
  // сообщений «съедал» старые переписки, теперь у каждого чата своя страница.
  await Promise.all(chats.map(async (c) => {
    c.messages = await fetchMessages(c.id, null, c.clearedAt);
    c.hasMore = c.messages.length === MSG_PAGE;
    // Точное число непрочитанных берём у базы: в памяти лежит только страница истории
    const { count } = await sb.from("messages").select("id", { count: "exact", head: true })
      .eq("chat_id", c.id)
      .gt("created_at", new Date(c.lastRead).toISOString())
      .neq("sender_id", me.id);
    c.unread = count || 0;
  }));
  sortChats();
  if (currentId && !currentChat()) closeChat();
  syncTypingChannels();
  renderAll();
}
async function loadProfiles(ids) {
  if (!ids.length) return;
  const { data } = await sb.from("profiles").select("id, display_name, username, bio, allow_dm, avatar_url, last_seen_privacy, status, show_extra").in("id", ids);
  (data || []).forEach((p) => { profiles[p.id] = p; });
}
async function loadBlocked() {
  const { data } = await sb.from("user_blocks").select("blocked");
  blocked = new Set((data || []).map((r) => r.blocked));
}
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadAll, 300); }
function renderAll() { renderChatList(); renderHeader(); renderMessages(); refreshInfo(); updateTitle(); }

// ---------- Онлайн и «был(а) в сети» ----------
async function touchPresence() { if (me && !document.hidden) await sb.rpc("touch_presence"); }
async function refreshPresence() {
  if (!me) return;
  const ids = [...new Set(chats.filter((c) => c.type === "private").map(otherUserId).filter(Boolean))];
  if (!ids.length) return;
  const { data } = await sb.rpc("get_presence", { ids: ids });
  presence = {};
  (data || []).forEach((r) => { presence[r.user_id] = r; });
  renderHeader(); refreshInfo();
}

// ---------- Список чатов ----------
function chatItem(c) {
  const title = chatTitle(c), last = lastMessage(c), unread = unreadCount(c);
  const item = el("div", "chat-item" + (c.id === currentId ? " active" : ""));
  item.dataset.id = c.id;
  const av = makeAvatar(c, "");
  if (c.type === "private" && isOnline(otherUserId(c))) av.append(el("span", "dot"));
  item.append(av);
  const info = el("div", "chat-info");
  const top = el("div", "chat-top");
  const nm = el("div", "chat-name");
  nm.append(el("span", "nm", title));
  if (c.type === "system") nm.append(svgEl(ICONS.verified, "vbadge"));
  if (c.muted) nm.append(svgEl(ICONS.mute, "mute-ic"));
  top.append(nm);
  const date = el("div", "chat-date");
  if (last && last.sender_id === me.id && c.type !== "system") {
    date.append(svgEl(c.otherRead >= new Date(last.created_at).getTime() ? ICONS.tick2 : ICONS.tick1, "ticks"));
  }
  date.append(document.createTextNode(last ? fmtListTime(last.created_at) : ""));
  top.append(date);
  const bottom = el("div", "chat-bottom");
  const lastBox = el("div", "chat-last");
  if (isTyping(c)) lastBox.append(el("span", "typing", "печатает..."));
  else if (last) {
    if (last.sender_id === me.id) lastBox.append(el("span", "you", "Вы: "));
    lastBox.append(document.createTextNode(previewOf(last)));
  } else lastBox.textContent = c.clearedAt ? "История очищена" : "Нет сообщений";
  bottom.append(lastBox);
  if (unread > 0) bottom.append(el("div", "badge" + (c.muted ? " muted" : ""), unread > 999 ? "999+" : String(unread)));
  else if (c.pinned) bottom.append(svgEl(ICONS.pin, "pin"));
  info.append(top, bottom);
  item.append(info);
  item.addEventListener("click", () => { openChat(c.id); });
  return item;
}
function archiveItem(list) {
  const item = el("div", "chat-item archive-row");
  item.append(makeAvatar({ kind: "archive" }, ""));
  const info = el("div", "chat-info");
  const top = el("div", "chat-top"); top.append(el("div", "chat-name", "Архив"));
  const bottom = el("div", "chat-bottom");
  bottom.append(el("div", "chat-last", list.map(chatTitle).join(", ")));
  const unread = list.reduce((s, c) => s + unreadCount(c), 0);
  if (unread) bottom.append(el("div", "badge muted", String(unread)));
  info.append(top, bottom); item.append(info);
  item.addEventListener("click", () => go("scrArchive"));
  return item;
}
function personItem(p) {
  const item = el("div", "chat-item");
  item.append(makeAvatar(p, ""));
  const info = el("div", "chat-info");
  info.append(el("div", "chat-name", p.display_name), el("div", "chat-last", "@" + p.username));
  item.append(info);
  item.addEventListener("click", () => startChatWith(p.id));
  return item;
}
function visibleInList(c) { return !(c.clearedAt && !c.messages.length && c.id !== currentId); }

function renderChatList() {
  if (!me) return;
  const q = search.value.trim().toLowerCase().replace(/^@/, "");
  chatList.innerHTML = "";
  if (q) {
    const found = chats.filter((c) => {
      const p = c.type === "private" ? profiles[otherUserId(c)] : null;
      return chatTitle(c).toLowerCase().includes(q) || (p && p.username.toLowerCase().includes(q));
    });
    if (found.length) { chatList.append(el("div", "list-title", "Чаты")); found.forEach((c) => chatList.append(chatItem(c))); }
    const known = new Set(chats.filter((c) => c.type === "private").map(otherUserId));
    const people = searchResults.filter((p) => !known.has(p.id));
    if (people.length) { chatList.append(el("div", "list-title", "Глобальный поиск")); people.forEach((p) => chatList.append(personItem(p))); }
    if (!found.length && !people.length) chatList.append(el("div", "list-note", q.length < 2 ? "Введите ещё символ..." : "Ничего не найдено"));
  } else {
    const archived = chats.filter((c) => c.archived && visibleInList(c));
    if (archived.length) chatList.append(archiveItem(archived));
    const main = chats.filter((c) => !c.archived && visibleInList(c));
    main.forEach((c) => chatList.append(chatItem(c)));
    if (!main.length) chatList.append(el("div", "list-note", "Чатов пока нет. Найдите человека по имени или @юзернейму в поиске."));
  }
  archiveList.innerHTML = "";
  const arch = chats.filter((c) => c.archived && visibleInList(c));
  arch.forEach((c) => archiveList.append(chatItem(c)));
  if (!arch.length) archiveList.append(el("div", "list-note", "Архив пуст. Чтобы убрать чат в архив, нажмите на него правой кнопкой мыши."));
  $("mmArchiveCount").textContent = arch.length ? String(arch.length) : "";
}
function updateTitle() {
  const n = me ? chats.filter((c) => !c.muted).reduce((s, c) => s + unreadCount(c), 0) : 0;
  document.title = (n ? "(" + n + ") " : "") + "MessageRoom";
  $("railBadge").textContent = n ? (n > 99 ? "99+" : String(n)) : "";
  if (me) setAvatar($("railAvatar"), Object.assign({ id: me.id }, profiles[me.id] || {}));
}

// ---------- Поиск людей ----------
async function searchPeople() {
  const q = search.value.trim().replace(/^@/, "").replace(/[,()%*_\\]/g, "");
  if (q.length < 2) { searchResults = []; renderChatList(); return; }
  const { data } = await sb.from("profiles").select("id, display_name, username, bio, allow_dm, avatar_url, last_seen_privacy")
    .or("username.ilike.*" + q + "*,display_name.ilike.*" + q + "*").neq("id", me.id).limit(15);
  searchResults = data || [];
  searchResults.forEach((p) => { profiles[p.id] = p; });
  renderChatList();
}
search.addEventListener("input", () => { renderChatList(); clearTimeout(searchTimer); searchTimer = setTimeout(searchPeople, 300); });
search.addEventListener("keydown", (e) => { if (e.key === "Escape") { search.value = ""; searchResults = []; renderChatList(); search.blur(); } });

async function startChatWith(userId) {
  const { data, error } = await sb.rpc("start_private_chat", { other_user: userId });
  if (error) { toast(error.message.includes("dm_not_allowed") ? "Этот пользователь не принимает новые чаты" : "Не удалось открыть чат: " + error.message); return; }
  search.value = ""; searchResults = [];
  await loadAll();
  openChat(data);
}

// ---------- Открытый чат ----------
function renderHeader() {
  const c = currentChat();
  app.classList.toggle("has-chat", !!c);
  if (!c) return;
  headName.innerHTML = "";
  headName.append(el("span", "nm", chatTitle(c)));
  if (c.type === "system") headName.append(svgEl(ICONS.verified, "vbadge"));
  setAvatar(headAvatar, c);
  const st = chatStatus(c);
  headStatus.textContent = st.text;
  headStatus.className = "status" + (st.online ? " online" : "");
  const writable = canWrite(c);
  composer.style.display = writable ? "flex" : "none";
  readonlyBar.style.display = writable ? "none" : "flex";
  const rb = $("readonlyBtn");
  if (isBlockedChat(c)) { rb.textContent = "Разблокировать"; rb.onclick = () => setBlocked(otherUserId(c), false); }
  else { rb.textContent = c.muted ? "Включить уведомления" : "Выключить уведомления"; rb.onclick = () => setChatFlag(c, "muted", !c.muted); }
}

function isAtBottom() { return messagesBox.scrollHeight - messagesBox.scrollTop - messagesBox.clientHeight < 80; }

function renderMessages(opts) {
  opts = opts || {};
  const c = currentChat();
  const keepBottom = isAtBottom();
  const prevTop = messagesBox.scrollTop;
  messagesBox.innerHTML = "";
  if (!c) return;
  messagesBox.dataset.wall = WALLPAPERS[prefs.wallpaper] || "default";
  if (c.hasMore) {
    const more = el("div", "history-more");
    const btn = el("button", "link-btn", c.loadingOlder ? "Загружаем..." : "Показать более старые");
    btn.disabled = !!c.loadingOlder;
    btn.addEventListener("click", () => loadOlder(c));
    more.append(btn);
    messagesBox.append(more);
  }
  const group = c.type !== "private" && c.type !== "system";
  let prevDay = null, unreadPlaced = false;
  c.messages.forEach((m, i) => {
    const d = new Date(m.created_at), mine = m.sender_id === me.id;
    if (!prevDay || !sameDay(prevDay, d)) { const s = el("div", "day-sep"); s.append(el("span", "", fmtDay(d))); messagesBox.append(s); }
    prevDay = d;
    if (!unreadPlaced && unreadFrom && !mine && d.getTime() > unreadFrom) {
      unreadPlaced = true;
      const s = el("div", "unread-sep"); s.id = "unreadSep"; s.append(el("span", "", "Непрочитанные сообщения")); messagesBox.append(s);
    }
    const next = c.messages[i + 1];
    const tail = !next || next.sender_id !== m.sender_id || !sameDay(new Date(next.created_at), d) || new Date(next.created_at) - d > 300000;
    const prev = c.messages[i - 1];
    const first = !prev || prev.sender_id !== m.sender_id || !sameDay(new Date(prev.created_at), d) || d - new Date(prev.created_at) > 300000;
    const div = el("div", "message " + (mine ? "mine" : "their") + (tail ? " tail" : "") + (first ? " first" : ""));
    div.dataset.id = m.id;
    if (group && !mine && first) div.append(el("div", "sender av" + colorIndex(m.sender_id), nameOf(m.sender_id)));
    if (m.reply_to) {
      const orig = c.messages.find((x) => x.id === m.reply_to);
      const q = el("div", "quote");
      q.append(el("div", "q-name", orig ? (orig.sender_id === me.id ? "Вы" : nameOf(orig.sender_id)) : "Сообщение"),
        el("div", "q-text", orig ? (orig.text || "🎤 Голосовое сообщение") : "Сообщение удалено или недоступно"));
      if (orig) q.addEventListener("click", (e) => { e.stopPropagation(); jumpTo(orig.id); });
      div.append(q);
    }
    const body = el("div", "text");
    if (m.voice_path) body.append(voicePlayer(m.voice_path, m.voice_ms));
    if (m.media_path) appendMediaPreview(body, m.media_path, m.media_type, "chat-media");
    if (m.text) appendText(body, m.text);
    const meta = el("span", "meta");
    if (m.edited_at) meta.append(el("span", "edited", "изм."));
    meta.append(document.createTextNode(fmtTime(m.created_at)));
    if (mine && c.type !== "system") meta.append(svgEl(c.otherRead >= d.getTime() ? ICONS.tick2 : ICONS.tick1, "ticks"));
    body.append(meta);
    div.append(body);
    messagesBox.append(div);
  });
  if (!c.messages.length) {
    const empty = el("div", "no-messages");
    empty.append(el("div", "nm-title", c.clearedAt ? "История очищена" : "Здесь пока ничего нет..."),
      el("div", "", canWrite(c) ? "Отправьте сообщение, чтобы начать переписку" : ""));
    messagesBox.append(empty);
  }
  if (opts.scroll === "unread" && $("unreadSep")) $("unreadSep").scrollIntoView({ block: "center" });
  else if (opts.scroll === "bottom" || opts.scroll === "unread" || keepBottom) messagesBox.scrollTop = messagesBox.scrollHeight;
  else messagesBox.scrollTop = prevTop;
  updateToBottom();
}
function jumpTo(id) {
  const node = messagesBox.querySelector('[data-id="' + id + '"]');
  if (!node) return;
  node.scrollIntoView({ block: "center", behavior: "smooth" });
  node.classList.add("flash"); setTimeout(() => node.classList.remove("flash"), 1200);
}
function updateToBottom() {
  const c = currentChat();
  const show = c && !isAtBottom();
  toBottom.classList.toggle("show", !!show);
  const n = c ? unreadCount(c) : 0;
  $("toBottomBadge").textContent = n ? String(n) : "";
  $("toBottomBadge").style.display = n ? "flex" : "none";
}
messagesBox.addEventListener("scroll", () => {
  updateToBottom();
  if (isAtBottom()) markRead();
  const c = currentChat();
  if (c && c.hasMore && !c.loadingOlder && c.messages.length && messagesBox.scrollTop < 80) loadOlder(c);
});

// Догрузка более старых сообщений открытого чата
async function loadOlder(c) {
  if (!c || c.loadingOlder || !c.hasMore || !c.messages.length) return;
  const before = c.messages[0].created_at;
  const prevHeight = messagesBox.scrollHeight;
  const prevTop = messagesBox.scrollTop;
  c.loadingOlder = true;
  renderMessages();
  const older = await fetchMessages(c.id, before, c.clearedAt);
  c.messages = older.concat(c.messages);
  c.hasMore = older.length === MSG_PAGE;
  c.loadingOlder = false;
  renderMessages();
  // Сохраняем позицию чтения: иначе список «прыгает», когда подгрузилось сверху
  messagesBox.scrollTop = prevTop + (messagesBox.scrollHeight - prevHeight);
}
toBottom.addEventListener("click", () => { messagesBox.scrollTo({ top: messagesBox.scrollHeight, behavior: "smooth" }); });

function openChat(id) {
  if (recording) stopRecording(false);
  if (app.classList.contains("feed-mode")) {
    app.classList.remove("feed-mode");
    $("railFeed").classList.remove("active");
    document.querySelector('.rail-btn[data-rail="scrChats"]').classList.add("active");
  }
  if (currentId !== id) { cancelCompose(); input.value = ""; autoGrow(); }
  currentId = id;
  const c = currentChat();
  unreadFrom = c && unreadCount(c) ? c.lastRead : 0;
  app.classList.add("in-chat");
  closeMenus();
  renderHeader();
  renderMessages({ scroll: unreadFrom ? "unread" : "bottom" });
  renderChatList();
  refreshInfo();
  markRead();
  if (window.innerWidth > 768) input.focus();
}
function closeChat() {
  currentId = null; unreadFrom = 0;
  app.classList.remove("in-chat");
  closeInfo(); cancelCompose();
  renderHeader(); renderMessages(); renderChatList();
}

async function markRead() {
  const c = currentChat();
  if (!c || document.hidden || unreadCount(c) === 0 || !isAtBottom()) return;
  const last = lastMessage(c);
  c.lastRead = new Date(last.created_at).getTime();
  c.unread = 0;
  renderChatList(); updateTitle(); updateToBottom();
  await sb.from("chat_members").update({ last_read_at: last.created_at }).eq("chat_id", c.id).eq("user_id", me.id);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { markRead(); touchPresence(); } });

// ---------- Поле ввода: отправка, ответ, правка ----------
function autoGrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 180) + "px"; input.style.overflowY = input.scrollHeight > 180 ? "auto" : "hidden"; }
function showComposeBar(kind, m) {
  $("cbIcon").innerHTML = kind === "edit" ? ICONS.edit : ICONS.reply;
  $("cbTitle").textContent = kind === "edit" ? "Редактирование" : "В ответ " + (m.sender_id === me.id ? "себе" : nameOf(m.sender_id));
  $("cbText").textContent = m.text || "🎤 Голосовое сообщение";
  composeBar.classList.add("show");
}
function startReply(m) { editing = null; replyTo = m; showComposeBar("reply", m); input.focus(); }
function startEdit(m) { replyTo = null; editing = m; showComposeBar("edit", m); input.value = m.text; autoGrow(); input.focus(); }
function cancelCompose() {
  if (editing) { input.value = ""; autoGrow(); }
  replyTo = null; editing = null; composeBar.classList.remove("show");
}
$("cbClose").addEventListener("click", cancelCompose);


// ---------- Фото и видео в сообщениях и ленте ----------
function safeMediaExtension(name) {
  const ext = (String(name).match(/\.[a-z0-9]{1,8}$/i) || [""])[0].toLowerCase();
  return ext || ".bin";
}
async function validateMediaFile(file, isPost) {
  const image = /^image\/(jpeg|png|webp|gif)$/i.test(file.type);
  const video = /^video\/(mp4|webm|quicktime)$/i.test(file.type);
  if (!image && !video) return "Поддерживаются JPG, PNG, WebP, GIF, MP4, WebM и MOV";
  const max = isPost ? 50 : 25;
  if (file.size > max * 1024 * 1024) return "Файл слишком большой. Максимум " + max + " МБ";
  if (isPost && video) {
    const duration = await readVideoDuration(file);
    if (!Number.isFinite(duration) || duration <= 0) return "Не удалось определить длительность видео";
    if (duration > 60) return "Видео для ленты должно быть не длиннее 60 секунд";
    file._mediaDurationMs = Math.round(duration * 1000);
  }
  return "";
}
function readVideoDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file), video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { const d = video.duration; URL.revokeObjectURL(url); resolve(d); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(NaN); };
    video.src = url;
  });
}
async function appendMediaPreview(container, path, type, bucket) {
  const wrap = el("div", "media-preview");
  wrap.append(el("div", "media-loading", "Загрузка медиа…"));
  container.append(wrap);
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
  wrap.innerHTML = "";
  if (error || !data || !data.signedUrl) { wrap.append(el("div", "media-error", "Медиа недоступно")); return; }
  let node;
  if (type === "video") {
    node = document.createElement("video");
    node.controls = true; node.playsInline = true; node.preload = "metadata";
  } else {
    node = document.createElement("img");
    node.alt = "Изображение";
    node.loading = "lazy";
  }
  node.src = data.signedUrl;
  wrap.append(node);
}
async function uploadChatMedia(file) {
  const c = currentChat();
  if (!c || !canWrite(c)) return;
  const check = await validateMediaFile(file, false);
  if (check) { toast(check); return; }
  const path = c.id + "/" + me.id + "/" + crypto.randomUUID() + safeMediaExtension(file.name);
  toast("Загружаю файл…");
  const up = await sb.storage.from("chat-media").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) { toast("Не удалось загрузить: " + up.error.message); return; }
  const row = { chat_id: c.id, text: null, media_path: path, media_type: file.type.startsWith("video/") ? "video" : "image", media_mime: file.type, media_size: file.size };
  const { data, error } = await sb.from("messages").insert(row).select().single();
  if (error) {
    await sb.storage.from("chat-media").remove([path]);
    toast("Не удалось отправить: " + error.message); return;
  }
  addMessage(data, true);
}

async function sendMessage() {
  const c = currentChat();
  const text = input.value.trim();
  if (!c || !text || !canWrite(c)) return;
  if (editing) {
    const m = editing;
    cancelCompose(); input.value = ""; autoGrow();
    if (text === m.text) return;
    const edited = new Date().toISOString();
    const { error } = await sb.from("messages").update({ text: text, edited_at: edited }).eq("id", m.id);
    if (error) { toast("Не удалось изменить: " + error.message); return; }
    m.text = text; m.edited_at = edited;
    renderMessages(); renderChatList();
    return;
  }
  const row = { chat_id: c.id, text: text };
  if (replyTo) row.reply_to = replyTo.id;
  input.value = ""; autoGrow(); cancelCompose();
  $("emojiPanel").classList.remove("show");
  input.focus();
  unreadFrom = 0;
  const { data, error } = await sb.from("messages").insert(row).select().single();
  if (error) {
    input.value = text; autoGrow();
    toast(error.code === "42501" && c.type === "private" ? "Не удалось отправить: пользователь ограничил круг собеседников" : "Не отправилось: " + error.message);
    return;
  }
  addMessage(data, true);
}
$("sendBtn").addEventListener("click", sendMessage);
$("chatMediaBtn").addEventListener("click", () => $("chatMediaFile").click());
$("chatMediaFile").addEventListener("change", async () => { const f = $("chatMediaFile").files[0]; if (f) await uploadChatMedia(f); $("chatMediaFile").value = ""; });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    const send = prefs.enterSend ? !e.shiftKey : (e.ctrlKey || e.metaKey);
    if (send) { e.preventDefault(); sendMessage(); }
  } else if (e.key === "Escape") cancelCompose();
  else if (e.key === "ArrowUp" && !input.value) {
    const c = currentChat();
    const mine = c && [...c.messages].reverse().find((m) => m.sender_id === me.id && m.text);
    if (mine) { e.preventDefault(); startEdit(mine); }
  }
});
input.addEventListener("input", () => { autoGrow(); sendTyping(); });

// Смайлики
const emojiPanel = $("emojiPanel");
Array.from(EMOJI.matchAll(/\p{Extended_Pictographic}\uFE0F?/gu)).forEach(([e]) => {
  const b = el("button", "", e);
  b.addEventListener("click", () => {
    const pos = input.selectionStart || input.value.length;
    input.value = input.value.slice(0, pos) + e + input.value.slice(input.selectionEnd || pos);
    input.focus(); input.selectionStart = input.selectionEnd = pos + e.length; autoGrow();
  });
  emojiPanel.append(b);
});
$("emojiBtn").addEventListener("click", (e) => { e.stopPropagation(); emojiPanel.classList.toggle("show"); });

async function deleteMessage(m) {
  if (!confirm("Удалить сообщение у всех?")) return;
  const { error } = await sb.from("messages").delete().eq("id", m.id);
  if (error) { toast("Не удалось удалить: " + error.message); return; }
  removeMessage(m.id);
}

// ---------- Голосовые сообщения ----------
const VOICE_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
let recording = null;
let recordingStopTimer = null;
let activeAudio = null;

function pickVoiceMime() {
  if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return VOICE_MIMES.find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
}

// Плеер одного голосового: ссылка на файл запрашивается при первом нажатии
function voicePlayer(path, ms) {
  const wrap = el("div", "voice");
  const btn = el("button", "voice-play", "▶");
  btn.title = "Прослушать";
  const bar = el("div", "voice-bar");
  const fill = el("div", "voice-fill");
  bar.append(fill);
  const time = el("span", "voice-time", fmtMs(ms || 0));
  wrap.append(btn, bar, time);

  let audio = null;
  btn.addEventListener("click", async () => {
    if (!audio) {
      btn.disabled = true;
      const { data, error } = await sb.storage.from("voice").createSignedUrl(path, 3600);
      btn.disabled = false;
      if (error || !data) { toast("Не удалось открыть голосовое: " + (error ? error.message : "нет ссылки")); return; }
      audio = new Audio(data.signedUrl);
      audio.addEventListener("timeupdate", () => {
        const total = audio.duration && isFinite(audio.duration) ? audio.duration : Math.max(1, (ms || 0) / 1000);
        fill.style.width = Math.min(100, (audio.currentTime / total) * 100) + "%";
      });
      audio.addEventListener("ended", () => { btn.textContent = "▶"; fill.style.width = "0%"; activeAudio = null; });
      audio.addEventListener("error", () => { toast("Не получилось проиграть запись"); btn.textContent = "▶"; });
    }
    if (audio.paused) {
      if (activeAudio && activeAudio !== audio) { activeAudio.pause(); activeAudio = null; }
      try { await audio.play(); } catch (err) { toast("Браузер не дал включить звук"); return; }
      activeAudio = audio;
      btn.textContent = "⏸";
    } else {
      audio.pause();
      btn.textContent = "▶";
    }
  });
  return wrap;
}

function updateRecTime() {
  if (!recording) return;
  $("recTime").textContent = fmtMs(Date.now() - recording.startedAt);
}

async function startRecording(context) {
  if (recording) return;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function" || !window.MediaRecorder) {
    toast("Этот браузер не умеет записывать звук");
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    toast("Браузер не дал доступ к микрофону: " + (err.message || err));
    return;
  }
  const mime = pickVoiceMime();
  let recorder;
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop());
    toast("Не удалось начать запись");
    return;
  }
  recording = {
    recorder: recorder, stream: stream, chunks: [], startedAt: Date.now(),
    context: context, mime: recorder.mimeType || mime || "audio/webm", timer: null,
  };
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0 && recording) recording.chunks.push(event.data);
  });
  recorder.start(250);
  $("recBar").classList.add("show");
  $("micBtn").classList.add("recording");
  $("postMic").classList.add("recording");
  $("recTime").textContent = "0:00";
  recording.timer = setInterval(updateRecTime, 250);
  recordingStopTimer = setTimeout(() => { if (recording) stopRecording(true); }, 180000);
}

async function stopRecording(send) {
  if (!recording) return;
  const current = recording;
  recording = null;
  clearInterval(current.timer);
  clearTimeout(recordingStopTimer);
  $("recBar").classList.remove("show");
  $("micBtn").classList.remove("recording");
  $("postMic").classList.remove("recording");
  const ms = Date.now() - current.startedAt;
  const stopped = new Promise((resolve) => current.recorder.addEventListener("stop", resolve, { once: true }));
  try { current.recorder.stop(); } catch (err) { /* уже остановлен */ }
  await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 2000))]);
  current.stream.getTracks().forEach((track) => track.stop());
  if (!send) return;
  if (ms < 500) { toast("Слишком короткая запись"); return; }
  const blob = new Blob(current.chunks, { type: current.mime });
  await sendVoiceBlob(blob, ms, current.context);
}

async function sendVoiceBlob(blob, ms, context) {
  const type = blob.type || "audio/webm";
  const ext = type.indexOf("mp4") !== -1 ? "m4a" : type.indexOf("ogg") !== -1 ? "ogg" : "webm";
  const name = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
  const path = me.id + "/" + name + "." + ext;
  const upload = await sb.storage.from("voice").upload(path, blob, { contentType: type, upsert: false });
  if (upload.error) { toast("Не удалось загрузить запись: " + upload.error.message); return; }

  if (context === "post") {
    const { error } = await sb.from("posts").insert({ voice_path: path, voice_ms: ms });
    if (error) { toast("Не опубликовалось: " + error.message); return; }
    await loadFeed();
    return;
  }

  const c = currentChat();
  if (!c) return;
  const row = { chat_id: c.id, voice_path: path, voice_ms: ms };
  if (replyTo) row.reply_to = replyTo.id;
  cancelCompose();
  const { data, error } = await sb.from("messages").insert(row).select().single();
  if (error) { toast("Не отправилось: " + error.message); return; }
  addMessage(data, true);
}

$("micBtn").addEventListener("click", () => { if (recording) stopRecording(true); else startRecording("chat"); });
$("postMic").addEventListener("click", () => { if (recording) stopRecording(true); else startRecording("post"); });
$("recCancel").addEventListener("click", () => stopRecording(false));
$("recSend").addEventListener("click", () => stopRecording(true));

// ---------- Новые сообщения ----------
function addMessage(m, own) {
  const c = chats.find((x) => x.id === m.chat_id);
  if (!c) { scheduleReload(); return; }
  if (c.messages.some((x) => x.id === m.id)) return;
  const wasBottom = isAtBottom();
  c.messages.push(m);
  c.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (typingState[c.id] && typingState[c.id].user === m.sender_id) delete typingState[c.id];
  if (!own && m.sender_id !== me.id) c.unread = (c.unread || 0) + 1;
  sortChats();
  if (c.id === currentId) { renderMessages({ scroll: own || wasBottom ? "bottom" : undefined }); markRead(); renderHeader(); }
  renderChatList(); updateTitle();
  if (!own && m.sender_id !== me.id) notifyIncoming(c, m);
}
function removeMessage(id) {
  chats.forEach((c) => { c.messages = c.messages.filter((m) => m.id !== id); });
  renderMessages(); renderChatList(); updateTitle();
}

let audioCtx = null;
function playSound() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = "sine";
      const t = audioCtx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.18);
    });
  } catch (e) {}
}
async function notifyIncoming(c, m) {
  if (c.muted) return;
  const visible = !document.hidden && c.id === currentId;
  if (visible) return;
  if (prefs.sound) playSound();
  if (document.hidden && prefs.notifMsgs && "Notification" in window && Notification.permission === "granted") {
    const title = c.type === "private" ? nameOf(m.sender_id) : chatTitle(c);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) reg.showNotification(title, { body: m.text, icon: "icon.svg", tag: c.id, data: { chat: c.id } });
      else new Notification(title, { body: m.text, icon: "icon.svg", tag: c.id });
    } catch (e) {}
  }
}

// ---------- «печатает...» ----------
function syncTypingChannels() {
  const want = new Set(chats.filter((c) => c.type === "private").slice(0, 80).map((c) => c.id));
  Object.keys(typingChannels).forEach((id) => { if (!want.has(id)) { sb.removeChannel(typingChannels[id]); delete typingChannels[id]; } });
  want.forEach((id) => {
    if (typingChannels[id]) return;
    typingChannels[id] = sb.channel("typing:" + id, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.user === me.id) return;
        typingState[id] = { user: payload.user, until: Date.now() + 5000 };
        renderChatList(); renderHeader();
        setTimeout(() => { renderChatList(); renderHeader(); }, 5100);
      }).subscribe();
  });
}
function sendTyping() {
  const c = currentChat();
  if (!c || editing || !typingChannels[c.id] || Date.now() - lastTypingSent < 3000 || !input.value) return;
  lastTypingSent = Date.now();
  typingChannels[c.id].send({ type: "broadcast", event: "typing", payload: { user: me.id } });
}

// ---------- Действия с чатом ----------
async function setChatFlag(c, field, value) {
  const col = { pinned: "pinned", archived: "archived", muted: "muted" }[field];
  c[field] = value;
  sortChats(); renderAll();
  const { error } = await sb.from("chat_members").update({ [col]: value }).eq("chat_id", c.id).eq("user_id", me.id);
  if (error) { toast("Не получилось: " + error.message); scheduleReload(); return; }
  if (field === "archived") toast(value ? "Чат перемещён в архив" : "Чат возвращён из архива");
  if (field === "muted") toast(value ? "Уведомления выключены" : "Уведомления включены");
}
async function clearChat(c, removeFromList) {
  const text = removeFromList ? "Удалить чат «" + chatTitle(c) + "»? Он исчезнет только у вас и вернётся, если придёт новое сообщение."
    : "Очистить историю чата у себя?";
  if (!confirm(text)) return;
  const now = new Date().toISOString();
  const { error } = await sb.from("chat_members").update({ cleared_at: now, last_read_at: now, pinned: false, archived: false })
    .eq("chat_id", c.id).eq("user_id", me.id);
  if (error) { toast("Не получилось: " + error.message); return; }
  c.clearedAt = new Date(now).getTime(); c.lastRead = c.clearedAt; c.messages = []; c.pinned = false; c.archived = false;
  c.unread = 0; c.hasMore = false;
  if (removeFromList && c.id === currentId) closeChat(); else renderAll();
}
async function markChatRead(c) {
  const last = lastMessage(c);
  if (!last) return;
  c.lastRead = new Date(last.created_at).getTime();
  c.unread = 0;
  renderChatList(); updateTitle();
  await sb.from("chat_members").update({ last_read_at: last.created_at }).eq("chat_id", c.id).eq("user_id", me.id);
}
async function setBlocked(uid, value) {
  if (value && !confirm("Заблокировать " + nameOf(uid) + "? Вы не сможете писать друг другу.")) return;
  const res = value ? await sb.from("user_blocks").insert({ blocked: uid })
    : await sb.from("user_blocks").delete().eq("blocker", me.id).eq("blocked", uid);
  if (res.error && res.error.code !== "23505") { toast("Не получилось: " + res.error.message); return; }
  if (value) blocked.add(uid); else blocked.delete(uid);
  toast(value ? "Пользователь заблокирован" : "Пользователь разблокирован");
  renderAll(); renderBlocked();
}

// ---------- Контекстные меню ----------
let menuShownAt = 0;
function showCtx(x, y, items) {
  ctxMenu.innerHTML = "";
  items.filter(Boolean).forEach((it) => {
    const b = el("button", it.danger ? "danger" : "");
    b.innerHTML = it.icon || "";
    b.append(document.createTextNode(it.label));
    b.addEventListener("click", () => { closeMenus(); it.action(); });
    ctxMenu.append(b);
  });
  ctxMenu.style.display = "block";
  ctxMenu.style.left = Math.max(8, Math.min(x, window.innerWidth - ctxMenu.offsetWidth - 8)) + "px";
  ctxMenu.style.top = Math.max(8, Math.min(y, window.innerHeight - ctxMenu.offsetHeight - 8)) + "px";
  menuShownAt = Date.now();
}
function closeMenus() { ctxMenu.style.display = "none"; mainMenu.classList.remove("open"); }
function messageMenu(x, y, id) {
  const c = currentChat(); const m = c && c.messages.find((k) => k.id === id);
  if (!m) return;
  const mine = m.sender_id === me.id;
  showCtx(x, y, [
    canWrite(c) && { label: "Ответить", icon: ICONS.reply, action: () => startReply(m) },
    { label: "Копировать текст", icon: ICONS.copy, action: () => copyText(m.text, "Текст скопирован") },
    mine && canWrite(c) && m.text && { label: "Изменить", icon: ICONS.edit, action: () => startEdit(m) },
    mine && { label: "Удалить", icon: ICONS.trash, danger: true, action: () => deleteMessage(m) }
  ]);
}
function chatMenuFor(x, y, c) {
  showCtx(x, y, [
    { label: c.pinned ? "Открепить" : "Закрепить", icon: ICONS.pinI, action: () => setChatFlag(c, "pinned", !c.pinned) },
    { label: c.archived ? "Вернуть из архива" : "В архив", icon: ICONS.archI, action: () => setChatFlag(c, "archived", !c.archived) },
    { label: c.muted ? "Включить уведомления" : "Выключить уведомления", icon: c.muted ? ICONS.bell : ICONS.bellOff, action: () => setChatFlag(c, "muted", !c.muted) },
    unreadCount(c) > 0 && { label: "Отметить как прочитанное", icon: ICONS.read, action: () => markChatRead(c) },
    c.type !== "system" && { label: "Удалить чат", icon: ICONS.trash, danger: true, action: () => clearChat(c, true) }
  ]);
}
function onLongPress(container, selector, callback) {
  let timer = null;
  container.addEventListener("touchstart", (e) => {
    const t = e.target.closest(selector); if (!t) return;
    const p = e.touches[0];
    timer = setTimeout(() => callback(t, p.clientX, p.clientY), 500);
  }, { passive: true });
  ["touchend", "touchmove", "touchcancel"].forEach((ev) => container.addEventListener(ev, () => clearTimeout(timer), { passive: true }));
}
messagesBox.addEventListener("contextmenu", (e) => {
  const m = e.target.closest(".message"); if (!m || e.target.closest("a")) return;
  e.preventDefault(); messageMenu(e.clientX, e.clientY, m.dataset.id);
});
messagesBox.addEventListener("dblclick", (e) => {
  const m = e.target.closest(".message"); const c = currentChat();
  if (!m || !c || !canWrite(c)) return;
  const msg = c.messages.find((k) => k.id === m.dataset.id);
  if (msg) { window.getSelection().removeAllRanges(); startReply(msg); }
});
onLongPress(messagesBox, ".message", (t, x, y) => messageMenu(x, y, t.dataset.id));
[chatList, archiveList].forEach((list) => {
  list.addEventListener("contextmenu", (e) => {
    const item = e.target.closest(".chat-item[data-id]"); if (!item) return;
    e.preventDefault(); chatMenuFor(e.clientX, e.clientY, chats.find((c) => c.id === item.dataset.id));
  });
  onLongPress(list, ".chat-item[data-id]", (t, x, y) => chatMenuFor(x, y, chats.find((c) => c.id === t.dataset.id)));
});
document.addEventListener("click", (e) => {
  if (Date.now() - menuShownAt < 400) return;
  if (!ctxMenu.contains(e.target)) ctxMenu.style.display = "none";
  if (!mainMenu.contains(e.target) && !e.target.closest("#menuBtn")) mainMenu.classList.remove("open");
  if (!emojiPanel.contains(e.target) && !e.target.closest("#emojiBtn")) emojiPanel.classList.remove("show");
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (ctxMenu.style.display === "block" || mainMenu.classList.contains("open")) closeMenus();
  else if ($("photoViewer").classList.contains("open")) $("photoViewer").classList.remove("open");
  else if (document.activeElement === input && (replyTo || editing)) return;
  else if (infoPanel.classList.contains("open")) closeInfo();
  else if (currentId && document.activeElement !== search) closeChat();
});

// ---------- Назад на телефоне ----------
$("backBtn").addEventListener("click", (e) => { e.stopPropagation(); closeChat(); });
let startX = 0, startY = 0;
$("chatPane").addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, { passive: true });
$("chatPane").addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - startX, dy = e.changedTouches[0].clientY - startY;
  if (window.innerWidth <= 768 && startX < 60 && dx > 90 && Math.abs(dy) < 60) closeChat();
});

// ---------- Реальное время ----------
function onMessageChange(payload) {
  if (payload.eventType === "INSERT") addMessage(payload.new, false);
  else if (payload.eventType === "UPDATE") {
    chats.forEach((c) => c.messages.forEach((m) => { if (m.id === payload.new.id) { m.text = payload.new.text; m.edited_at = payload.new.edited_at; } }));
    renderMessages(); renderChatList();
  } else if (payload.eventType === "DELETE") removeMessage(payload.old.id);
}
function subscribeRealtime() {
  unsubscribeRealtime();
  channel = sb.channel("messageroom")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, onMessageChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, scheduleFeedReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "post_reactions" }, scheduleFeedReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, scheduleFeedReload)
    .subscribe();
}
function unsubscribeRealtime() {
  if (channel) { sb.removeChannel(channel); channel = null; }
}
function unsubscribeTyping() {
  Object.values(typingChannels).forEach((ch) => sb.removeChannel(ch));
  typingChannels = {}; typingState = {};
}

// ---------- Запуск и остановка (вызываются из auth.js) ----------
async function startApp(user) {
  me = { id: user.id, email: user.email };
  searchResults = []; search.value = ""; presence = {};
  await loadBlocked();
  await loadAll();
  subscribeRealtime();
  const admin = !!window.appStatus.is_admin;
  $("adminOpen").style.display = admin ? "flex" : "none";
  $("mmAdmin").style.display = admin ? "flex" : "none";
  $("railAdmin").style.display = admin ? "flex" : "none";
  updateTitle();
  relinkPushSub();
  touchPresence(); refreshPresence();
  clearInterval(presenceTimer);
  presenceTimer = setInterval(() => { touchPresence(); refreshPresence(); renderChatList(); }, 60000);
}
function stopApp() {
  if (recording) stopRecording(false);
  unsubscribeRealtime();
  unsubscribeTyping();
  clearInterval(presenceTimer);
  me = null; profiles = {}; chats = []; currentId = null; searchResults = []; presence = {}; blocked = new Set();
  search.value = ""; chatList.innerHTML = ""; archiveList.innerHTML = ""; messagesBox.innerHTML = "";
  app.classList.remove("in-chat", "has-chat", "feed-mode");
  $("railFeed").classList.remove("active");
  closeInfo(); cancelCompose();
  screenStack = ["scrChats"]; showScreen("scrChats");
  document.title = "MessageRoom";
}

// ===================== Левая колонка: экраны и меню =====================
function showScreen(id) {
  document.querySelectorAll("#left .screen").forEach((s) => s.classList.toggle("active", s.id === id));
  const railId = id === "scrChats" || id === "scrArchive" ? id : "scrSettings";
  document.querySelectorAll(".rail-btn[data-rail]").forEach((b) => b.classList.toggle("active", b.dataset.rail === railId));
  if (id === "scrSettings") fillSettingsView();
  if (id === "scrAccount") fillAccount();
  if (id === "scrPrivacy") fillPrivacy();
  if (id === "scrBlocked") renderBlocked();
  if (id === "scrNotif") fillNotif();
  if (id === "scrAppearance") fillAppearance();
}
function go(id) { closeMenus(); screenStack.push(id); showScreen(id); }
function back() { if (screenStack.length > 1) screenStack.pop(); showScreen(screenStack[screenStack.length - 1]); }
document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", back));
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

$("menuBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  mainMenu.style.left = r.left + "px"; mainMenu.style.top = (r.bottom + 6) + "px";
  $("mmNight").checked = prefs.theme === "dark";
  mainMenu.classList.toggle("open");
});
$("mmArchive").addEventListener("click", () => go("scrArchive"));
$("mmSettings").addEventListener("click", () => go("scrSettings"));
$("mmAdmin").addEventListener("click", () => { closeMenus(); $("adminOpen").click(); });
$("mmNight").addEventListener("change", (e) => setTheme(e.target.checked ? "dark" : "light"));
document.querySelectorAll(".rail-btn[data-rail]").forEach((b) => b.addEventListener("click", () => {
  closeMenus();
  app.classList.remove("feed-mode");
  $("railFeed").classList.remove("active");
  screenStack = b.dataset.rail === "scrChats" ? ["scrChats"] : ["scrChats", b.dataset.rail];
  showScreen(b.dataset.rail);
  if (window.innerWidth <= 768 && currentId) closeChat();
}));
$("railMe").addEventListener("click", () => { screenStack = ["scrChats", "scrSettings"]; showScreen("scrSettings"); if (window.innerWidth <= 768 && currentId) closeChat(); });
$("railTheme").addEventListener("click", () => setTheme(prefs.theme === "dark" ? "light" : "dark"));
$("railAdmin").addEventListener("click", () => $("adminOpen").click());
$("railStories").addEventListener("click", () => toast("Истории появятся на одном из следующих этапов"));

// ---------- Настройки: главная ----------
function myProfile() { return (me && profiles[me.id]) || {}; }
function fillSettingsView() {
  const p = myProfile();
  setAvatar($("setAvatarView"), Object.assign({ id: me.id }, p));
  $("setNameView").textContent = p.display_name || "";
  $("setEmailView").textContent = me.email || "";
  $("setHandleView").textContent = p.username ? "@" + p.username : "";
  $("setBioView").textContent = p.bio || "";
  $("setBioRow").style.display = p.bio ? "flex" : "none";
  $("setStatusView").textContent = p.status || "";
  $("setStatusView").style.display = p.status ? "" : "none";
}

// ---------- Мой аккаунт ----------
const setName = $("setName"), setHandle = $("setHandle"), setBio = $("setBio");
function note(id, text, isError) { const n = $(id); n.textContent = text; n.className = "settings-msg" + (isError ? " error" : "") + (n.classList.contains("center") ? " center" : ""); }
async function fillAccount() {
  const p = myProfile();
  setAvatar($("setAvatarEdit"), Object.assign({ id: me.id }, p));
  $("avatarRemove").style.display = p.avatar_url ? "inline" : "none";
  $("acctNameView").textContent = p.display_name || "";
  $("acctStatusView").textContent = p.status || "без статуса";
  $("acctEmailView").textContent = me.email || "";
  setName.value = p.display_name || "";
  setHandle.value = p.username || "";
  setBio.value = p.bio || "";
  $("setStatus").value = p.status || "";
  $("bioCount").textContent = String(200 - setBio.value.length);
  note("setMsg", ""); note("extraMsg", ""); note("emailMsg", ""); note("passMsg", "");
  $("setPass").value = ""; $("setPass2").value = ""; $("setNewEmail").value = "";
  $("setCity").value = ""; $("setBirthday").value = ""; $("setLinkSite").value = ""; $("setLinkTg").value = "";
  $("setShowExtra").checked = p.show_extra !== false;
  // Город, дата рождения и ссылки приходят отдельной функцией (с учётом приватности)
  const { data } = await sb.rpc("get_profile_extra", { ids: [me.id] });
  const extra = data && data[0];
  if (extra) {
    $("setCity").value = extra.city || "";
    $("setBirthday").value = extra.birthday || "";
    const links = extra.links || {};
    $("setLinkSite").value = links.site || "";
    $("setLinkTg").value = links.tg || "";
  }
}
setBio.addEventListener("input", () => { $("bioCount").textContent = String(200 - setBio.value.length); });
$("saveProfile").addEventListener("click", async () => {
  const name = setName.value.trim(), handle = setHandle.value.trim().replace(/^@/, ""), bio = setBio.value.trim();
  const status = $("setStatus").value.trim();
  if (!name) { note("setMsg", "Введите имя", true); return; }
  if (!HANDLE_RULE.test(handle)) { note("setMsg", HANDLE_HELP, true); return; }
  const { error } = await sb.from("profiles")
    .update({ display_name: name, username: handle, bio: bio || null, status: status || null })
    .eq("id", me.id);
  if (error) { note("setMsg", error.code === "23505" ? "Этот юзернейм уже занят" : "Не сохранилось: " + error.message, true); return; }
  Object.assign(profiles[me.id], { display_name: name, username: handle, bio: bio || null, status: status || null });
  $("acctNameView").textContent = name;
  $("acctStatusView").textContent = status || "без статуса";
  note("setMsg", "Сохранено");
  renderAll();
});
$("saveExtra").addEventListener("click", async () => {
  const city = $("setCity").value.trim();
  const birthday = $("setBirthday").value || null;
  const site = $("setLinkSite").value.trim();
  const tg = $("setLinkTg").value.trim();
  if (site && !/^https?:\/\/.+/i.test(site)) { note("extraMsg", "Сайт должен начинаться с http:// или https://", true); return; }
  const links = {};
  if (site) links.site = site;
  if (tg) links.tg = tg.startsWith("@") ? tg : "@" + tg;
  const { error } = await sb.from("profiles")
    .update({ city: city || null, birthday: birthday, links: links, show_extra: $("setShowExtra").checked })
    .eq("id", me.id);
  if (error) { note("extraMsg", "Не сохранилось: " + error.message, true); return; }
  profiles[me.id].city = city || null;
  profiles[me.id].show_extra = $("setShowExtra").checked;
  note("extraMsg", "Сохранено");
});
$("saveEmail").addEventListener("click", async () => {
  const email = $("setNewEmail").value.trim();
  if (!email) { note("emailMsg", "Введите новую почту", true); return; }
  $("saveEmail").disabled = true;
  const { error } = await sb.auth.updateUser(
    { email: email },
    { emailRedirectTo: location.origin + location.pathname },
  );
  $("saveEmail").disabled = false;
  if (error) { note("emailMsg", "Не получилось: " + translateError(error.message), true); return; }
  $("setNewEmail").value = "";
  note("emailMsg", "Письмо для подтверждения отправлено на " + email + ". Адрес сменится после перехода по ссылке.", false);
});
$("savePass").addEventListener("click", async () => {
  const pass = $("setPass").value;
  const pass2 = $("setPass2").value;
  if (pass.length < 6) { note("passMsg", "Пароль должен быть не короче 6 символов", true); return; }
  if (pass !== pass2) { note("passMsg", "Пароли не совпадают", true); return; }
  $("savePass").disabled = true;
  const { error } = await sb.auth.updateUser({ password: pass });
  $("savePass").disabled = false;
  if (error) { note("passMsg", "Не получилось: " + translateError(error.message), true); return; }
  $("setPass").value = ""; $("setPass2").value = "";
  note("passMsg", "Пароль изменён");
});

// Фото профиля: обрезаем до квадрата 512×512 и загружаем в хранилище
const avatarFile = $("avatarFile");
$("avatarPick").addEventListener("click", () => avatarFile.click());
$("setAvatarEdit").addEventListener("click", () => avatarFile.click());
function squareJpeg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), size = Math.min(512, s);
      const cv = document.createElement("canvas"); cv.width = cv.height = size;
      cv.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error("не удалось обработать фото"))), "image/jpeg", 0.88);
    };
    img.onerror = () => reject(new Error("это не картинка"));
    img.src = URL.createObjectURL(file);
  });
}
avatarFile.addEventListener("change", async () => {
  const file = avatarFile.files[0]; avatarFile.value = "";
  if (!file) return;
  note("setMsg", "Загружаем фото...");
  try {
    const blob = await squareJpeg(file);
    const path = me.id + "/avatar.jpg";
    const up = await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (up.error) throw up.error;
    const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
    const { error } = await sb.from("profiles").update({ avatar_url: url }).eq("id", me.id);
    if (error) throw error;
    profiles[me.id].avatar_url = url;
    fillAccount(); note("setMsg", "Фото обновлено"); renderAll();
  } catch (e) { note("setMsg", "Не получилось: " + (e.message || e), true); }
});
$("avatarRemove").addEventListener("click", async () => {
  if (!confirm("Удалить фото профиля?")) return;
  await sb.storage.from("avatars").remove([me.id + "/avatar.jpg"]);
  const { error } = await sb.from("profiles").update({ avatar_url: null }).eq("id", me.id);
  if (error) { note("setMsg", "Не получилось: " + error.message, true); return; }
  profiles[me.id].avatar_url = null;
  fillAccount(); renderAll();
});

// ---------- Конфиденциальность ----------
function fillPrivacy() {
  const p = myProfile();
  document.querySelectorAll('[name="lsPriv"]').forEach((r) => { r.checked = r.value === (p.last_seen_privacy || "everyone"); });
  document.querySelectorAll('[name="dmPriv"]').forEach((r) => { r.checked = r.value === (p.allow_dm || "everyone"); });
  $("blockedCount").textContent = blocked.size ? String(blocked.size) : "";
  note("privMsg", "");
}
[["lsPriv", "last_seen_privacy"], ["dmPriv", "allow_dm"]].forEach(([name, col]) => {
  document.querySelectorAll('[name="' + name + '"]').forEach((r) => r.addEventListener("change", async () => {
    const { error } = await sb.from("profiles").update({ [col]: r.value }).eq("id", me.id);
    if (error) { note("privMsg", "Не сохранилось: " + error.message, true); fillPrivacy(); return; }
    profiles[me.id][col] = r.value;
    note("privMsg", "Сохранено");
    if (col === "last_seen_privacy") refreshPresence();
  }));
});
async function renderBlocked() {
  const list = $("blockedList");
  if (!list || !me) return;
  await loadProfiles([...blocked].filter((id) => !profiles[id]));
  list.innerHTML = "";
  if (!blocked.size) { list.append(el("div", "list-note", "Список пуст. Заблокировать человека можно в его профиле.")); return; }
  blocked.forEach((uid) => {
    const p = profiles[uid] || { id: uid, display_name: "Пользователь", username: "" };
    const item = el("div", "chat-item");
    item.append(makeAvatar(p, ""));
    const info = el("div", "chat-info");
    info.append(el("div", "chat-name", p.display_name), el("div", "chat-last", p.username ? "@" + p.username : ""));
    const b = el("button", "link-btn", "Разблокировать");
    b.addEventListener("click", () => setBlocked(uid, false));
    item.append(info, b);
    list.append(item);
  });
}

// ---------- Уведомления ----------
function fillNotif() {
  $("notifMsgs").checked = prefs.notifMsgs; $("notifSound").checked = prefs.sound;
  if (typeof refreshPushUi === "function") refreshPushUi();
}
$("notifMsgs").addEventListener("change", async (e) => {
  prefs.notifMsgs = e.target.checked; savePrefs();
  if (prefs.notifMsgs && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
});
$("notifSound").addEventListener("change", (e) => { prefs.sound = e.target.checked; savePrefs(); if (prefs.sound) playSound(); });

// ---------- Оформление ----------
const themeBtns = document.querySelectorAll(".theme-btn");
function setTheme(theme) {
  prefs.theme = theme; savePrefs();
  document.documentElement.dataset.theme = theme;
  themeBtns.forEach((b) => b.classList.toggle("active", b.dataset.theme === theme));
  try { localStorage.removeItem("theme"); } catch (e) {}
}
themeBtns.forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme)));
function applyScale(v) {
  prefs.scale = v;
  document.documentElement.style.setProperty("--msg-scale", v / 100);
  $("scaleLabel").textContent = "Размер текста сообщений: " + v + "%";
  $("setScale").value = v;
}
$("setScale").addEventListener("input", () => { applyScale(Number($("setScale").value)); savePrefs(); try { localStorage.removeItem("scale"); } catch (e) {} });
function fillAppearance() {
  $("enterSend").checked = prefs.enterSend;
  const box = $("wallpapers"); box.innerHTML = "";
  WALLPAPERS.forEach((w, i) => {
    const b = el("button", "wp" + (i === prefs.wallpaper ? " active" : ""));
    b.dataset.wall = w; b.title = "Фон " + (i + 1);
    b.addEventListener("click", () => { prefs.wallpaper = i; savePrefs(); fillAppearance(); renderMessages(); });
    box.append(b);
  });
}
$("enterSend").addEventListener("change", (e) => { prefs.enterSend = e.target.checked; savePrefs(); });
setTheme(prefs.theme);
applyScale(prefs.scale);

// ===================== Профиль собеседника =====================
function openInfo() { infoPanel.classList.add("open"); app.classList.add("info-open"); refreshInfo(); }
function closeInfo() { infoPanel.classList.remove("open"); app.classList.remove("info-open"); }
function infoRow(icon, main, sub, onClick) {
  const r = el(onClick ? "button" : "div", "tg-row" + (onClick ? " click" : ""));
  r.append(svgEl(icon, "ii plain"));
  const t = el("div"); t.append(el("div", "row-main", main), el("div", "tg-sub", sub)); r.append(t);
  if (onClick) r.addEventListener("click", onClick);
  return r;
}
function infoAction(icon, label, action, danger) {
  const b = el("button", "tg-item" + (danger ? " danger" : ""));
  b.append(svgEl(icon, "ii plain")); b.append(document.createTextNode(label));
  b.addEventListener("click", action);
  return b;
}
function fmtBirthday(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

// Город, дата рождения и ссылки: отдельный запрос, учитывает настройку приватности
async function fillInfoExtra(p, rows) {
  const chatId = currentId;
  const { data } = await sb.rpc("get_profile_extra", { ids: [p.id] });
  const extra = data && data[0];
  if (!extra || currentId !== chatId) return;
  if (extra.city) rows.append(infoRow(ICONS.info, extra.city, "Город"));
  if (extra.birthday) rows.append(infoRow(ICONS.info, fmtBirthday(extra.birthday), "Дата рождения"));
  const links = extra.links || {};
  if (links.site) rows.append(infoRow(ICONS.at, links.site, "Сайт", () => copyText(links.site, "Ссылка скопирована")));
  if (links.tg) rows.append(infoRow(ICONS.at, links.tg, "Телеграм", () => copyText(links.tg, "Ник скопирован")));
}

function refreshInfo() {
  if (!infoPanel.classList.contains("open")) return;
  const c = currentChat();
  if (!c) { closeInfo(); return; }
  const p = c.type === "private" ? profiles[otherUserId(c)] : null;
  const av = $("infoAvatar");
  setAvatar(av, c);
  av.onclick = () => { if (p && p.avatar_url) { $("photoViewerImg").src = p.avatar_url; $("photoViewer").classList.add("open"); } };
  $("infoName").innerHTML = ""; $("infoName").append(el("span", "", chatTitle(c)));
  if (c.type === "system") $("infoName").append(svgEl(ICONS.verified, "vbadge"));
  const st = chatStatus(c);
  $("infoStatus").textContent = st.text; $("infoStatus").className = "pc-status" + (st.online ? " online" : "");

  const rows = $("infoRows"); rows.innerHTML = "";
  if (p) {
    if (p.status) rows.append(infoRow(ICONS.info, p.status, "Статус"));
    rows.append(infoRow(ICONS.at, "@" + p.username, "Имя пользователя", () => copyText("@" + p.username, "Имя пользователя скопировано")));
    if (p.bio) rows.append(infoRow(ICONS.info, p.bio, "О себе"));
    fillInfoExtra(p, rows);
  } else if (c.type === "system") {
    rows.append(infoRow(ICONS.info, "Официальные новости и уведомления MessageRoom. Писать в этот чат может только администратор.", "Описание"));
  }
  const tg = el("label", "tg-item toggle");
  tg.append(svgEl(ICONS.bell, "ii plain"), document.createTextNode("Уведомления"));
  const cb = el("input"); cb.type = "checkbox"; cb.checked = !c.muted;
  cb.addEventListener("change", () => setChatFlag(c, "muted", !cb.checked));
  tg.append(cb, el("i", "switch"));
  rows.append(tg);

  const acts = $("infoActions"); acts.innerHTML = "";
  acts.append(infoAction(ICONS.pinI, c.pinned ? "Открепить чат" : "Закрепить чат", () => setChatFlag(c, "pinned", !c.pinned)));
  acts.append(infoAction(ICONS.archI, c.archived ? "Вернуть из архива" : "В архив", () => setChatFlag(c, "archived", !c.archived)));
  if (c.type !== "system") {
    acts.append(infoAction(ICONS.broom, "Очистить историю", () => clearChat(c, false)));
    acts.append(infoAction(ICONS.trash, "Удалить чат", () => clearChat(c, true), true));
  }
  if (p) {
    const isB = blocked.has(p.id);
    acts.append(infoAction(ICONS.block, isB ? "Разблокировать" : "Заблокировать", () => setBlocked(p.id, !isB), !isB));
  }
}
$("chatHeader").addEventListener("click", (e) => {
  if (e.target.closest("#backBtn")) return;
  if (e.target.closest("#headInfoBtn") && infoPanel.classList.contains("open")) { closeInfo(); return; }
  if (currentChat()) openInfo();
});
$("infoClose").addEventListener("click", closeInfo);
$("photoViewer").addEventListener("click", () => $("photoViewer").classList.remove("open"));

// Нажатие на уведомление: открыть нужный чат
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.openChat && chats.some((c) => c.id === e.data.openChat)) openChat(e.data.openChat);
  });
}

// ===================== Лента постов =====================
const REACTIONS = ["❤️", "🔥", "😂", "👍", "😮", "😢"];
let feedPosts = [];
let feedReloadTimer = null;
let feedBusy = false;

function isFeedOpen() { return app.classList.contains("feed-mode"); }

function scheduleFeedReload() {
  clearTimeout(feedReloadTimer);
  feedReloadTimer = setTimeout(() => { if (isFeedOpen()) loadFeed(); }, 400);
}

function enterFeed() {
  app.classList.add("feed-mode");
  app.classList.remove("in-chat");
  document.querySelectorAll(".rail-btn[data-rail]").forEach((b) => b.classList.remove("active"));
  $("railFeed").classList.add("active");
  loadFeed();
}

function exitFeed() {
  app.classList.remove("feed-mode");
  $("railFeed").classList.remove("active");
  screenStack = ["scrChats"];
  showScreen("scrChats");
  document.querySelector('.rail-btn[data-rail="scrChats"]').classList.add("active");
}

async function loadFeed() {
  if (feedBusy) return;
  feedBusy = true;
  try {
    await loadStatus();
    const { data, error } = await sb.from("posts")
      .select("id, author_id, text, created_at, edited_at, voice_path, voice_ms, media_path, media_type, media_mime, media_size, media_duration_ms, post_reactions(user_id, emoji), post_comments(count)")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) { toast("Лента не загрузилась: " + error.message); return; }
    feedPosts = data || [];
    const authors = [...new Set(feedPosts.map((p) => p.author_id))];
    if (authors.length) await loadProfiles(authors);
    updateFeedComposer();
    renderFeed();
  } finally {
    feedBusy = false;
  }
}

function updateFeedComposer() {
  const can = !!(window.appStatus && window.appStatus.can_post);
  $("feedCompose").style.display = can ? "block" : "none";
  $("feedLocked").style.display = can ? "none" : "block";
}

function fmtPostTime(iso) {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return "сегодня в " + fmtTime(iso);
  if (sameDay(d, new Date(now.getTime() - 86400000))) return "вчера в " + fmtTime(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) + " в " + fmtTime(iso);
}

function authorOf(id) { return profiles[id] || { id: id, display_name: "Пользователь" }; }

function reactionList(post) {
  const counts = {};
  let mine = null;
  (post.post_reactions || []).forEach((r) => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (r.user_id === me.id) mine = r.emoji;
  });
  return { counts: counts, mine: mine };
}

function renderFeed() {
  const list = $("feedList");
  list.innerHTML = "";
  if (!feedPosts.length) {
    list.append(el("div", "no-posts", "Пока постов нет. Напишите первый!"));
    return;
  }
  feedPosts.forEach((post) => list.append(postCard(post)));
}

function postCard(post) {
  const card = el("article", "post");
  const author = authorOf(post.author_id);
  const head = el("div", "post-head");
  head.append(makeAvatar(author, ""));
  const info = el("div", "post-info");
  info.append(el("div", "post-author", author.display_name || "Пользователь"));
  info.append(el("div", "post-time", fmtPostTime(post.created_at) + (post.edited_at ? " · изменено" : "")));
  head.append(info);
  if (post.author_id === me.id || window.appStatus.is_admin) {
    const del = el("button", "icon-btn post-del");
    del.title = "Удалить пост";
    del.innerHTML = ICONS.trash;
    del.addEventListener("click", () => deletePost(post));
    head.append(del);
  }
  card.append(head);

  if (post.text) {
    const text = el("div", "post-text");
    appendText(text, post.text);
    card.append(text);
  }
  if (post.voice_path) card.append(voicePlayer(post.voice_path, post.voice_ms));
  if (post.media_path) appendMediaPreview(card, post.media_path, post.media_type, "post-media");

  const actions = el("div", "post-actions");
  const reaction = reactionList(post);
  REACTIONS.forEach((emoji) => {
    const count = reaction.counts[emoji] || 0;
    const btn = el("button", "react" + (reaction.mine === emoji ? " on" : ""), emoji + (count ? " " + count : ""));
    btn.addEventListener("click", () => toggleReaction(post, emoji));
    actions.append(btn);
  });
  const comments = post.post_comments && post.post_comments[0] ? post.post_comments[0].count : 0;
  const cbtn = el("button", "react comments-btn", "💬" + (comments ? " " + comments : ""));
  cbtn.addEventListener("click", () => toggleComments(post, card));
  actions.append(cbtn);
  card.append(actions);

  card.append(el("div", "post-comments"));
  return card;
}

async function toggleReaction(post, emoji) {
  const reaction = reactionList(post);
  let error = null;
  if (reaction.mine === emoji) {
    ({ error } = await sb.from("post_reactions").delete().eq("post_id", post.id).eq("user_id", me.id));
  } else if (reaction.mine) {
    ({ error } = await sb.from("post_reactions").update({ emoji: emoji }).eq("post_id", post.id).eq("user_id", me.id));
  } else {
    const res = await sb.from("post_reactions").insert({ post_id: post.id, user_id: me.id, emoji: emoji });
    if (res.error && res.error.code === "23505") {
      ({ error } = await sb.from("post_reactions").update({ emoji: emoji }).eq("post_id", post.id).eq("user_id", me.id));
    } else {
      error = res.error;
    }
  }
  if (error) { toast("Не получилось: " + error.message); return; }
  await loadFeed();
}

async function deletePost(post) {
  if (!confirm("Удалить пост?")) return;
  const { error } = await sb.from("posts").delete().eq("id", post.id);
  if (error) { toast("Не удалось удалить: " + error.message); return; }
  await loadFeed();
}

async function toggleComments(post, card) {
  card.classList.toggle("comments-open");
  if (!card.classList.contains("comments-open")) return;
  const box = card.querySelector(".post-comments");
  box.innerHTML = "";
  const { data, error } = await sb.from("post_comments")
    .select("id, author_id, text, created_at")
    .eq("post_id", post.id).order("created_at").limit(200);
  if (error) { box.append(el("div", "list-note", "Комментарии не загрузились")); return; }
  const ids = [...new Set((data || []).map((c) => c.author_id))];
  if (ids.length) await loadProfiles(ids);
  (data || []).forEach((c) => {
    const row = el("div", "comment");
    row.append(el("b", "", authorOf(c.author_id).display_name || "Пользователь"));
    row.append(document.createTextNode(": " + c.text));
    if (c.author_id === me.id || window.appStatus.is_admin) {
      const del = el("button", "comment-del", "удалить");
      del.addEventListener("click", async () => {
        const { error: err } = await sb.from("post_comments").delete().eq("id", c.id);
        if (err) { toast("Не удалось: " + err.message); return; }
        await loadFeed();
      });
      row.append(del);
    }
    box.append(row);
  });
  if (!data || !data.length) box.append(el("div", "list-note", "Комментариев пока нет"));

  const inputRow = el("div", "comment-row");
  const field = el("input");
  field.placeholder = "Комментарий…";
  field.maxLength = 2000;
  const send = el("button", "link-btn", "Отправить");
  const submit = async () => {
    const text = field.value.trim();
    if (!text) return;
    send.disabled = true;
    const { error: err } = await sb.from("post_comments").insert({ post_id: post.id, text: text });
    send.disabled = false;
    if (err) { toast("Не отправилось: " + err.message); return; }
    field.value = "";
    await loadFeed();
  };
  send.addEventListener("click", submit);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  inputRow.append(field, send);
  box.append(inputRow);
}

async function publishPost() {
  const field = $("postText");
  const text = field.value.trim();
  const file = $("postMediaFile").files[0] || null;
  if (!text && !file) { toast("Добавьте текст или фото/видео"); return; }
  $("postSend").disabled = true;
  let media = null;
  if (file) {
    const check = await validateMediaFile(file, true);
    if (check) { $("postSend").disabled = false; toast(check); return; }
    const path = me.id + "/" + crypto.randomUUID() + safeMediaExtension(file.name);
    const up = await sb.storage.from("post-media").upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) { $("postSend").disabled = false; toast("Не удалось загрузить файл: " + up.error.message); return; }
    media = { media_path: path, media_type: file.type.startsWith("video/") ? "video" : "image", media_mime: file.type, media_size: file.size, media_duration_ms: file._mediaDurationMs || null };
  }
  const { error } = await sb.from("posts").insert({ text: text || null, ...(media || {}) });
  $("postSend").disabled = false;
  if (error) { if (media) await sb.storage.from("post-media").remove([media.media_path]); toast("Не опубликовалось: " + error.message); return; }
  field.value = ""; $("postMediaFile").value = ""; $("postMediaName").textContent = "";
  updatePostCount();
  await loadFeed();
}

function updatePostCount() {
  const n = $("postText").value.length;
  $("postCount").textContent = n ? n + " / 4000" : "";
}

$("railFeed").addEventListener("click", (e) => { e.stopPropagation(); enterFeed(); });
$("feedBack").addEventListener("click", exitFeed);
$("feedRefresh").addEventListener("click", () => loadFeed());
$("postText").addEventListener("input", updatePostCount);
$("postMediaBtn").addEventListener("click", () => $("postMediaFile").click());
$("postMediaFile").addEventListener("change", async () => { const f = $("postMediaFile").files[0]; if (!f) return; const err = await validateMediaFile(f, true); if (err) { toast(err); $("postMediaFile").value = ""; return; } $("postMediaName").textContent = f.name; });
$("postSend").addEventListener("click", publishPost);
