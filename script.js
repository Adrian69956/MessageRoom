// ===================== MessageRoom: основная логика =====================

// ---------- Состояние ----------
let me = null;              // { id, email }
let profiles = {};          // id -> профиль
let chats = [];
let currentId = null;
let currentContentTab = "media";
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

// Состояние ленты объявлено до любых обработчиков навигации: пользователь
// может открыть ленту, пока остальная инициализация ещё продолжается.
const REACTIONS = ["❤️"];
let feedPosts = [];
let feedViewedByMe = new Set();
let feedHiddenAuthors = new Set();
let feedViewObserver = null;
let feedSortMode = "newest";
let feedReloadTimer = null;
let feedBusy = false;
let feedReloadRequested = false;

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
// Bind the main Feed navigation immediately, before the rest of the app initializes.
const feedNavButton = $("railFeed");
if (feedNavButton) feedNavButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  try { enterFeed(); }
  catch (error) {
    console.error("Could not open feed:", error);
    if (typeof toast === "function") toast("Не удалось открыть ленту. Обнови страницу.");
  }
});

// Нажатие на логотип MessageRoom перезагружает приложение.
const appLogo = document.querySelector(".rail-logo");
if (appLogo) {
  appLogo.setAttribute("role", "button");
  appLogo.setAttribute("tabindex", "0");
  appLogo.setAttribute("aria-label", "Обновить MessageRoom");
  appLogo.addEventListener("click", () => window.location.reload());
  appLogo.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.location.reload();
    }
  });
}

// Обработчики ленты регистрируются в начале файла, чтобы поздняя ошибка
// в другом модуле не отключала публикацию и переключение сортировки.
document.querySelectorAll("[data-feed-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    feedSortMode = button.dataset.feedSort === "popular" ? "popular" : "newest";
    updateFeedSortButtons();
    renderFeed();
  });
});
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
function isSystemChat(c) { return c.type === "system" || c.type === "notice"; }
function canWrite(c) { if (!c || isBlockedChat(c) || c.type === "notice") return false; if (isSystemChat(c)) return !!window.appStatus.is_admin; if (c.type === "channel") return ["owner","admin"].includes(c.role); return c.memberSettings ? c.memberSettings.can_send_messages !== false : true; }
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
    if (isSystemChat(c_or_p)) { a.classList.add("av-system"); a.innerHTML = ICONS.logo; return a; }
    const p = c_or_p.type === "private" ? profiles[otherUserId(c_or_p)] : null;
    name = chatTitle(c_or_p); id = p ? p.id : c_or_p.id; url = c_or_p.type === "private" ? (p && p.avatar_url) : (c_or_p.photo_path || null);
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
  if (c.type === "notice") return { text: "личные уведомления", online: false };
  if (isSystemChat(c)) return { text: "служебные уведомления", online: false };
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
  const previousChats = new Map(chats.map(c => [c.id, c]));
  const { data: rows, error } = await sb.from("chat_members")
    .select("chat_id, user_id, pinned, archived, muted, cleared_at, last_read_at, role, can_send_messages, can_send_media, can_add_members, can_pin_messages, can_change_info, chats(id, type, title, description, photo_path, visibility, username, join_approval, history_visible, slow_mode_seconds, reactions_enabled, can_send_media, allowed_reactions, username_changed_at, created_at)");
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
      id: id, type: mine.chats.type, title: mine.chats.title, description: mine.chats.description || "", visibility: mine.chats.visibility || "private", username: mine.chats.username || null, joinApproval: !!mine.chats.join_approval, historyVisible: mine.chats.history_visible !== false, slowModeSeconds: mine.chats.slow_mode_seconds || 0, canSendMedia: mine.chats.can_send_media !== false, reactionsEnabled: mine.chats.reactions_enabled !== false, allowedReactions: mine.chats.allowed_reactions || ["❤️","👍","👎","🔥","🎉","😁","😢","😡"], usernameChangedAt: mine.chats.username_changed_at || null, role: mine.role || "member", memberSettings: mine,
      createdAt: new Date(mine.chats.created_at).getTime(),
      pinned: mine.pinned, archived: mine.archived, muted: mine.muted, clearedAt: clearedAt,
      lastRead: new Date(mine.last_read_at).getTime(),
      otherRead: others.length ? Math.max(...others.map((o) => new Date(o.last_read_at).getTime())) : 0,
      members: group.map((r) => r.user_id),
      messages: previousChats.has(id) ? previousChats.get(id).messages : [], hasMore: previousChats.has(id) ? previousChats.get(id).hasMore : false, loadingOlder: false
    };
  }).filter(Boolean);
  // История грузится отдельно для каждого чата: раньше один общий лимит на 1000
  // сообщений «съедал» старые переписки, теперь у каждого чата своя страница.
  await Promise.all(chats.map(async (c) => {
    const fresh = await fetchMessages(c.id, null, c.clearedAt);
    const previous = previousChats.get(c.id);
    if (previous && previous.messages && previous.messages.length) {
      const byId = new Map(previous.messages.map(m => [m.id, m]));
      fresh.forEach(m => byId.set(m.id, m));
      c.messages = [...byId.values()].sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
    } else c.messages = fresh;
    c.hasMore = c.messages.length >= MSG_PAGE;
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
  if (isSystemChat(c)) nm.append(svgEl(ICONS.verified, "vbadge"));
  if (c.muted) nm.append(svgEl(ICONS.mute, "mute-ic"));
  top.append(nm);
  const date = el("div", "chat-date");
  if (last && last.sender_id === me.id && !isSystemChat(c)) {
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

// Delegated click handling keeps chat rows responsive across desktop and touch layouts.
chatList.addEventListener("click", (e) => {
  const item = e.target.closest(".chat-item[data-id]");
  if (!item || !chatList.contains(item)) return;
  const chat = chats.find((c) => c.id === item.dataset.id);
  if (chat) openChat(chat.id);
});
archiveList.addEventListener("click", (e) => {
  const item = e.target.closest(".chat-item[data-id]");
  if (!item || !archiveList.contains(item)) return;
  const chat = chats.find((c) => c.id === item.dataset.id);
  if (chat) openChat(chat.id);
});

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
    if (window.appStatus?.is_owner) {
      const serviceItem = el("div", "chat-item service-notice-shortcut");
      serviceItem.append(makeAvatar({ id: "service-notices", display_name: "Служебные уведомления" }, ""));
      const serviceInfo = el("div", "chat-info");
      const serviceTop = el("div", "chat-top");
      serviceTop.append(el("div", "chat-name", "Служебные уведомления"));
      const serviceBottom = el("div", "chat-bottom");
      serviceBottom.append(el("div", "chat-last", "Отправить выбранному пользователю или всем"));
      serviceInfo.append(serviceTop, serviceBottom);
      serviceItem.append(serviceInfo);
      chatList.append(serviceItem);
    }
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
  if (isSystemChat(c)) headName.append(svgEl(ICONS.verified, "vbadge"));
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
  const prevTop = messagesBox.scrollTop;
  const boxRect = messagesBox.getBoundingClientRect();
  const anchorNode = [...messagesBox.querySelectorAll(".message[data-id]")].find(n => n.getBoundingClientRect().bottom > boxRect.top);
  const scrollAnchor = anchorNode ? { id: anchorNode.dataset.id, offset: anchorNode.getBoundingClientRect().top - boxRect.top } : null;
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
  const group = c.type !== "private" && !isSystemChat(c);
  let prevDay = null, unreadPlaced = false;
  const shownMessages = c.messages;
  shownMessages.forEach((m, i) => {
    const d = new Date(m.created_at), mine = m.sender_id === me.id;
    if (!prevDay || !sameDay(prevDay, d)) { const s = el("div", "day-sep"); s.append(el("span", "", fmtDay(d))); messagesBox.append(s); }
    prevDay = d;
    if (!unreadPlaced && unreadFrom && !mine && d.getTime() > unreadFrom) {
      unreadPlaced = true;
      const s = el("div", "unread-sep"); s.id = "unreadSep"; s.append(el("span", "", "Непрочитанные сообщения")); messagesBox.append(s);
    }
    const next = shownMessages[i + 1];
    const tail = !next || next.sender_id !== m.sender_id || !sameDay(new Date(next.created_at), d) || new Date(next.created_at) - d > 300000;
    const prev = shownMessages[i - 1];
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
    if (mine && !isSystemChat(c)) meta.append(svgEl(c.otherRead >= d.getTime() ? ICONS.tick2 : ICONS.tick1, "ticks"));
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
  else if (opts.scroll === "bottom" || opts.scroll === "unread") messagesBox.scrollTop = messagesBox.scrollHeight;
  else {
    const anchor = scrollAnchor && messagesBox.querySelector('[data-id="' + scrollAnchor.id + '"]');
    if (anchor) messagesBox.scrollTop += anchor.getBoundingClientRect().top - messagesBox.getBoundingClientRect().top - scrollAnchor.offset;
    else messagesBox.scrollTop = prevTop;
  }
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
  c.loadingOlder = true;
  const older = await fetchMessages(c.id, before, c.clearedAt);
  c.messages = older.concat(c.messages);
  c.hasMore = older.length === MSG_PAGE;
  c.loadingOlder = false;
  renderMessages();
}
toBottom.addEventListener("click", () => { messagesBox.scrollTo({ top: messagesBox.scrollHeight, behavior: "smooth" }); });

function openChat(id) {
  if (recording) stopRecording(false);
  if (app.classList.contains("feed-mode")) {
    app.classList.remove("feed-mode");
    $("feedScreen").style.removeProperty("display");
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
  markRead(true);
  if (window.innerWidth > 768) input.focus();
}
function closeChat() {
  currentId = null; unreadFrom = 0;
  app.classList.remove("in-chat");
  closeInfo(); cancelCompose();
  renderHeader(); renderMessages(); renderChatList();
}

async function markRead(force = false) {
  const c = currentChat();
  if (!c || !me || document.hidden || unreadCount(c) === 0 || (!force && !isAtBottom())) return;
  await markChatRead(c);
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
function safeMediaFilename(name) {
  const clean = String(name || "photo").normalize("NFKC").replace(/[^a-z0-9а-яё._ -]/gi, "_").trim().replace(/[ .]+/g, "_").slice(0, 80);
  return clean || "photo" + safeMediaExtension(name);
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
const mediaSignedUrlCache = new Map();
async function getMediaSignedUrl(bucket, path) {
  const key=bucket+":"+path, cached=mediaSignedUrlCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.promise;
  const promise=sb.storage.from(bucket).createSignedUrl(path,3600).then(({data,error})=>{
    if(error||!data||!data.signedUrl)throw error||new Error("signed URL unavailable");
    return data.signedUrl;
  });
  mediaSignedUrlCache.set(key,{promise,expires:Date.now()+50*60*1000});
  try{return await promise;}catch(error){mediaSignedUrlCache.delete(key);throw error;}
}
async function appendMediaPreview(container, path, type, bucket) {
  const isImage = type !== "video";
  const storedName = (String(path).split("/").pop() || "").split("__").slice(1).join("__");
  const isCompressed = /^compressed__/i.test(storedName);
  const filename = storedName.replace(/^compressed__/i, "") || (isImage ? "Фото" : "Видео");
  const wrap = el("div", "media-preview" + (isImage ? " media-attachment-card" : ""));
  wrap.append(el("div", "media-loading", "Загрузка медиа…"));
  container.append(wrap);
  let signedUrl;
  try { signedUrl = await getMediaSignedUrl(bucket, path); }
  catch (error) { wrap.replaceChildren(el("div", "media-error", "Медиа недоступно")); return; }
  wrap.innerHTML = "";
  let node;
  if (!isImage) {
    node = document.createElement("video");
    node.controls = true; node.playsInline = true; node.preload = "metadata";
    node.src = signedUrl;
    wrap.append(node);
    return;
  }
  const card = el("button", "media-file-card" + (isCompressed ? " is-compressed" : ""));
  card.type = "button";
  card.title = "Открыть фото";
  node = document.createElement("img");
  node.alt = filename;
  node.loading = "eager";
  node.decoding = "async";
  node.referrerPolicy = "strict-origin-when-cross-origin";
  node.addEventListener("error", () => {
    const err = el("div", "media-error", "Фото не загрузилось. Нажмите, чтобы повторить.");
    err.addEventListener("click", () => { mediaSignedUrlCache.delete(bucket + ":" + path); appendMediaPreview(container, path, type, bucket); });
    wrap.replaceChildren(err);
  });
  node.src = signedUrl;
  const details = el("span", "media-file-details");
  details.append(el("span", "media-file-title", filename));
  details.append(el("span", "media-file-subtitle", "Фото · нажмите, чтобы открыть"));
  card.append(node, details);
  card.addEventListener("click", () => openPhotoViewer(signedUrl, filename));
  wrap.append(card);
}

function openPhotoViewer(url, filename) {
  let viewer = $("photoViewer");
  if (!viewer) {
    viewer = document.createElement("div");
    viewer.id = "photoViewer";
    viewer.className = "photo-viewer";
    viewer.innerHTML = '<div class="photo-viewer-top"><button type="button" class="photo-viewer-close" aria-label="Закрыть">×</button></div><img class="photo-viewer-image" alt="Фото"><div class="photo-viewer-bottom"><button type="button" class="photo-viewer-save">↓ Сохранить фото</button></div>';
    document.body.append(viewer);
    viewer.addEventListener("click", e => {
      if (e.target === viewer || e.target.closest(".photo-viewer-close")) viewer.classList.remove("show");
    });
    viewer.querySelector(".photo-viewer-save").addEventListener("click", async () => {
      const btn = viewer.querySelector(".photo-viewer-save");
      const image = viewer.querySelector(".photo-viewer-image");
      btn.disabled = true;
      btn.textContent = "Скачивание…";
      try {
        const response = await fetch(image.src);
        if (!response.ok) throw new Error("download failed");
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = viewer.dataset.filename || "messageroom-photo.jpg";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      } catch (err) {
        window.open(image.src, "_blank", "noopener");
        toast("Не удалось скачать напрямую — фото открыто отдельно");
      } finally {
        btn.disabled = false;
        btn.textContent = "↓ Сохранить фото";
      }
    });
  }
  viewer.querySelector(".photo-viewer-image").src = url;
  viewer.dataset.filename = (filename || "messageroom-photo.jpg").replace(/[^a-z0-9._-]/gi, "_");
  viewer.classList.add("show");
}
function isQueuedVideo(file){
 if(!file)return false;
 const mime=String(file.type||"").toLowerCase();
 if(mime.startsWith("video/"))return true;
 return /\.(mp4|m4v|mov|webm|ogv|ogg|3gp|mkv)$/i.test(file.name||"");
}
function openQueuedMediaEditor(index){
 const item=pendingChatFiles[index];if(!item)return;
 if(isQueuedVideo(item.file)){
   const open=()=>{
     $("photoEditor").classList.remove("show");
     $("photoEditor").setAttribute("aria-hidden","true");
     photoEditorDrawing=false;
     openVideoEditor(index);
   };
   // Не сохраняем фото поверх выбранного видео: индекс фото-редактора
   // может быть устаревшим после добавления нескольких файлов.
   const photoItem=pendingChatFiles[photoEditorIndex];
   const hasActivePhoto=$("photoEditor").classList.contains("show")
     && photoEditorImage && photoItem && !isQueuedVideo(photoItem.file)
     && photoEditorIndex!==index;
   if(hasActivePhoto)saveCurrentPhotoEdit(open,true);else open();
 }else{
   if(ve("Editor")?.classList.contains("show"))closeVideoEditor();
   openPhotoEditor(index);
 }
}

let pendingChatFiles=[];
let pendingChatFile=null,pendingChatPreviewUrl=null,photoEditorIndex=0;
function clearPendingChatFile(){
  pendingChatFiles.forEach(x=>{if(x.previewUrl)URL.revokeObjectURL(x.previewUrl);});
  pendingChatFiles=[];pendingChatFile=null;pendingChatPreviewUrl=null;updateQueuedVideoFormat();
  const preview=$("chatMediaPending");if(preview){preview.classList.remove("show");preview.innerHTML="";}
  $("chatMediaFile").value="";
}
function renderPendingChatFiles(){
  const preview=$("chatMediaPending");preview.innerHTML="";
  if(!pendingChatFiles.length){preview.classList.remove("show");return;}
  pendingChatFiles.forEach((item,index)=>{
    const card=el("div","chat-media-pending-item");
    const thumb=isQueuedVideo(item.file)?el("video"):el("img");thumb.src=item.previewUrl;thumb.alt=item.file.name;
    if(thumb.tagName==="VIDEO"){thumb.muted=true;thumb.playsInline=true;thumb.preload="metadata";}thumb.addEventListener("click",()=>openQueuedMediaEditor(index));
    const info=el("div","chat-media-pending-info");
    info.append(el("div","chat-media-pending-name",item.file.name),el("div","chat-media-pending-size",Math.max(1,Math.round(item.file.size/1024))+" КБ"));
    if(!isQueuedVideo(item.file)){const edit=el("button","link-btn","Настроить фото");edit.type="button";edit.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openQueuedMediaEditor(index);});info.append(edit);}else if(isQueuedVideo(item.file)){const edit=el("button","link-btn","Настроить видео");edit.type="button";edit.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openQueuedMediaEditor(index);});info.append(edit);}
    const remove=el("button","icon-btn chat-media-pending-remove","×");remove.type="button";remove.addEventListener("click",()=>{URL.revokeObjectURL(item.previewUrl);pendingChatFiles.splice(index,1);photoEditorIndex=Math.min(photoEditorIndex,Math.max(0,pendingChatFiles.length-1));pendingChatFile=pendingChatFiles[photoEditorIndex]?.file||null;updateQueuedVideoFormat();renderPendingChatFiles();});
    card.append(thumb,info,remove);preview.append(card);
  });
  const add=el("button","chat-media-add-more","+ Добавить");add.type="button";add.addEventListener("click",()=>$("chatMediaFile").click());preview.append(add);
  preview.classList.add("show");
  renderPhotoEditorThumbnails();renderVideoEditorThumbnails();
}
function showPendingChatFiles(files){
  const incoming=[...files];if(!incoming.length)return;
  if(pendingChatFiles.length+incoming.length>7){toast("Можно отправить не больше 7 файлов за раз");$("chatMediaFile").value="";return;}
  incoming.forEach(file=>pendingChatFiles.push({file,previewUrl:URL.createObjectURL(file)}));
  renderPhotoEditorThumbnails();renderVideoEditorThumbnails();
  photoEditorIndex=pendingChatFiles.length-incoming.length;pendingChatFile=pendingChatFiles[photoEditorIndex].file;updateQueuedVideoFormat();renderPendingChatFiles();
}
function updateQueuedVideoFormat(){const video=pendingChatFiles.find(x=>isQueuedVideo(x.file));const format=video?veFormatName(video.file):"—";if($("videoModeFormat"))$("videoModeFormat").textContent=format;if($("videoModeFormatActive"))$("videoModeFormatActive").textContent=format;}
function showPendingChatFile(file){showPendingChatFiles([file]);}

let photoEditorSourceName="messageroom-photo.jpg";
let photoEditorImage=null,photoEditorDrawing=false,photoEditorStrokes=[],photoEditorText=[],photoEditorPreviewScale=1,photoEditorDown=false;
let photoCropSelection={x:.5,y:.5},photoCropCustom={x:.1,y:.1,w:.8,h:.8},photoCropDrag=null,photoTextDrag=null,photoBrushColor="#ff334f",photoBrushSize=5;
let photoEditorTab="crop";
function setPhotoEditorTab(tab){
  photoEditorTab=tab;photoEditorDrawing=tab==="draw";
  document.querySelectorAll("[data-photo-tab]").forEach(b=>b.classList.toggle("active",b.dataset.photoTab===tab));
  document.querySelectorAll("[data-photo-panel]").forEach(p=>p.classList.toggle("active",p.dataset.photoPanel===tab));
  $("photoEditorCanvas").classList.toggle("drawing",photoEditorDrawing);
  $("photoEditorCanvas").style.touchAction=(tab==="crop"||tab==="draw"||tab==="text")?"none":"pan-y";
  drawPhotoEditor();
}
function openPhotoEditor(index=photoEditorIndex){
  if(!pendingChatFiles[index]||!pendingChatFiles[index].file.type.startsWith("image/"))return;
  photoEditorIndex=index;pendingChatFile=pendingChatFiles[index].file;renderPhotoEditorThumbnails();
  photoEditorSourceName=pendingChatFile.name||"messageroom-photo.jpg";
  const url=URL.createObjectURL(pendingChatFile),img=new Image();
  img.onload=()=>{photoEditorImage=img;photoEditorStrokes=[];photoEditorText=[];photoCropSelection={x:.5,y:.5};photoCropCustom={x:.1,y:.1,w:.8,h:.8};
    $("photoCrop").value="original";$("photoCompress").checked=false;$("photoText").value="";
    $("photoBrushSize").value="5";$("photoBrushValue").textContent="5";$("photoBrushColor").value="#ff334f";
    $("photoTextSize").value="42";$("photoTextColor").value="#ffffff";$("photoTextFont").value="Arial";$("photoTextFill").checked=false;$("photoTextFillColor").value="#000000";
    photoBrushColor="#ff334f";photoBrushSize=5;setPhotoEditorTab("crop");
    $("photoEditor").classList.add("show");$("photoEditor").setAttribute("aria-hidden","false");drawPhotoEditor();URL.revokeObjectURL(url);};
  img.onerror=()=>{URL.revokeObjectURL(url);toast("Не удалось открыть фото");};img.src=url;
}
function photoCropRect(){
  const w=photoEditorImage.naturalWidth,h=photoEditorImage.naturalHeight,ratio=$("photoCrop").value;
  if(ratio==="original")return{x:0,y:0,w,h};
  if(ratio==="custom")return{x:photoCropCustom.x*w,y:photoCropCustom.y*h,w:photoCropCustom.w*w,h:photoCropCustom.h*h};
  const [rw,rh]=ratio.split(":").map(Number),target=rw/rh,current=w/h;
  let cw=w,ch=h;if(current>target)cw=h*target;else ch=w/target;
  return{x:Math.max(0,Math.min(w-cw,photoCropSelection.x*w-cw/2)),y:Math.max(0,Math.min(h-ch,photoCropSelection.y*h-ch/2)),w:cw,h:ch};
}
function drawPhotoEditor(){
  if(!photoEditorImage)return;
  const canvas=$("photoEditorCanvas"),w=photoEditorImage.naturalWidth,h=photoEditorImage.naturalHeight;
  const scale=Math.min(1000/w,650/h,1),rect=photoCropRect();
  photoEditorPreviewScale=scale;canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext("2d");ctx.drawImage(photoEditorImage,0,0,canvas.width,canvas.height);
  photoEditorStrokes.forEach(stroke=>{ctx.strokeStyle=stroke.color;ctx.lineWidth=stroke.width;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();stroke.points.forEach((p,i)=>{if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.stroke();});
  photoEditorText.forEach(t=>{ctx.save();ctx.font=t.size+"px "+t.font;ctx.textAlign="center";ctx.textBaseline="middle";const x=t.x*canvas.width,y=t.y*canvas.height;
    if(t.fill){const m=ctx.measureText(t.text);ctx.fillStyle=t.fillColor||"#000000";ctx.globalAlpha=.72;ctx.fillRect(x-m.width/2-12,y-t.size*.68,m.width+24,t.size*1.35);ctx.globalAlpha=1;}
    ctx.fillStyle=t.color;ctx.fillText(t.text,x,y);ctx.restore();});
  if(photoEditorTab==="crop"&&$("photoCrop").value!=="original"){
    const x=rect.x*scale,y=rect.y*scale,cw=rect.w*scale,ch=rect.h*scale;
    ctx.save();ctx.fillStyle="rgba(0,0,0,.56)";ctx.fillRect(0,0,canvas.width,y);ctx.fillRect(0,y+ch,canvas.width,canvas.height-y-ch);ctx.fillRect(0,y,x,ch);ctx.fillRect(x+cw,y,canvas.width-x-cw,ch);
    ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.strokeRect(x+1,y+1,cw-2,ch-2);ctx.setLineDash([]);ctx.strokeStyle="rgba(255,255,255,.72)";ctx.lineWidth=1;
    for(let i=1;i<3;i++){ctx.beginPath();ctx.moveTo(x+cw*i/3,y);ctx.lineTo(x+cw*i/3,y+ch);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y+ch*i/3);ctx.lineTo(x+cw,y+ch*i/3);ctx.stroke();}
    const handle=8;[[x,y],[x+cw,y],[x,y+ch],[x+cw,y+ch]].forEach(([hx,hy])=>{ctx.fillStyle="#fff";ctx.fillRect(hx-handle/2,hy-handle/2,handle,handle);});ctx.restore();
  }
}
$("photoCrop").addEventListener("change",()=>{photoCropSelection={x:.5,y:.5};photoCropCustom={x:.1,y:.1,w:.8,h:.8};drawPhotoEditor();});
document.querySelectorAll("[data-photo-tab]").forEach(b=>b.addEventListener("click",()=>setPhotoEditorTab(b.dataset.photoTab)));
$("photoEditorClose").addEventListener("click",()=>{$("photoEditor").classList.remove("show");$("photoEditor").setAttribute("aria-hidden","true");photoEditorDrawing=false;});
$("photoEditorCancel").addEventListener("click",()=>$("photoEditorClose").click());
$("photoBrushSize").addEventListener("input",e=>{photoBrushSize=Number(e.target.value);$("photoBrushValue").textContent=String(photoBrushSize);});
$("photoBrushColor").addEventListener("input",e=>{photoBrushColor=e.target.value;});
$("photoColorPresets").addEventListener("click",e=>{const b=e.target.closest("[data-color]");if(!b)return;photoBrushColor=b.dataset.color;$("photoBrushColor").value=photoBrushColor;});
$("photoAddText").addEventListener("click",()=>{const text=$("photoText").value.trim();if(!text)return;photoEditorText.push({text,size:Number($("photoTextSize").value),color:$("photoTextColor").value,font:$("photoTextFont").value,fill:$("photoTextFill").checked,fillColor:$("photoTextFillColor").value,x:.5,y:.82});$("photoText").value="";drawPhotoEditor();});
const photoCanvas=$("photoEditorCanvas");
function photoCanvasPoint(e){const r=photoCanvas.getBoundingClientRect();return{x:(e.clientX-r.left)*photoCanvas.width/r.width,y:(e.clientY-r.top)*photoCanvas.height/r.height};}
photoCanvas.addEventListener("pointerdown",e=>{
  if(!photoEditorImage)return;const p=photoCanvasPoint(e);
  if(photoEditorTab==="crop"&&$("photoCrop").value!=="original"){
    const nx=p.x/photoCanvas.width,ny=p.y/photoCanvas.height;
    if($("photoCrop").value==="custom"){
      const q=photoCropCustom;
      photoCropDrag={mode:Math.abs(nx-(q.x+q.w))<.07&&Math.abs(ny-(q.y+q.h))<.07?"resize":"move",startX:nx,startY:ny,initial:{...q}};
    }else photoCropDrag={mode:"ratio",x:e.clientX,y:e.clientY,center:{...photoCropSelection}};
    photoCanvas.setPointerCapture(e.pointerId);return;
  }
  if(photoEditorTab==="text"){
    const hit=photoEditorText.map((t,i)=>({i,d:Math.hypot(t.x*photoCanvas.width-p.x,t.y*photoCanvas.height-p.y),size:t.size})).filter(v=>v.d<Math.max(28,v.size*.9)).sort((a,b)=>a.d-b.d)[0];
    if(hit){photoTextDrag={index:hit.i};photoCanvas.setPointerCapture(e.pointerId);}return;
  }
  if(photoEditorTab!=="draw")return;photoEditorDown=true;photoCanvas.setPointerCapture(e.pointerId);photoEditorStrokes.push({color:photoBrushColor,width:photoBrushSize,points:[p]});drawPhotoEditor();
});
photoCanvas.addEventListener("pointermove",e=>{
  if(photoCropDrag){
    const point=photoCanvasPoint(e),nx=point.x/photoCanvas.width,ny=point.y/photoCanvas.height;
    if(photoCropDrag.mode==="move"||photoCropDrag.mode==="resize"){
      const q=photoCropDrag.initial;
      if(photoCropDrag.mode==="resize"){photoCropCustom.w=Math.max(.08,Math.min(1-q.x,nx-q.x));photoCropCustom.h=Math.max(.08,Math.min(1-q.y,ny-q.y));}
      else{photoCropCustom.x=Math.max(0,Math.min(1-q.w,q.x+nx-photoCropDrag.startX));photoCropCustom.y=Math.max(0,Math.min(1-q.h,q.y+ny-photoCropDrag.startY));}
    }else{
      const r=photoCanvas.getBoundingClientRect(),ratio=photoCropRect(),dx=(e.clientX-photoCropDrag.x)/r.width,dy=(e.clientY-photoCropDrag.y)/r.height,cropW=ratio.w/photoEditorImage.naturalWidth,cropH=ratio.h/photoEditorImage.naturalHeight;
      photoCropSelection={x:Math.max(cropW/2,Math.min(1-cropW/2,photoCropDrag.center.x+dx)),y:Math.max(cropH/2,Math.min(1-cropH/2,photoCropDrag.center.y+dy))};
    }
    drawPhotoEditor();return;
  }
  if(photoTextDrag){const p=photoCanvasPoint(e),t=photoEditorText[photoTextDrag.index];t.x=Math.max(0,Math.min(1,p.x/photoCanvas.width));t.y=Math.max(0,Math.min(1,p.y/photoCanvas.height));drawPhotoEditor();return;}
  if(!photoEditorDown)return;photoEditorStrokes[photoEditorStrokes.length-1].points.push(photoCanvasPoint(e));drawPhotoEditor();
});
["pointerup","pointercancel"].forEach(ev=>photoCanvas.addEventListener(ev,()=>{photoEditorDown=false;photoCropDrag=null;photoTextDrag=null;}));
function saveCurrentPhotoEdit(onDone,silent=false){
  if(!photoEditorImage)return;
  const rect=photoCropRect(),canvas=document.createElement("canvas"),compressed=$("photoCompress").checked;
  const maxSide=compressed?1800:Math.max(rect.w,rect.h),scale=Math.min(1,maxSide/Math.max(rect.w,rect.h));
  canvas.width=Math.max(1,Math.round(rect.w*scale));canvas.height=Math.max(1,Math.round(rect.h*scale));
  const ctx=canvas.getContext("2d");ctx.drawImage(photoEditorImage,rect.x,rect.y,rect.w,rect.h,0,0,canvas.width,canvas.height);
  photoEditorStrokes.forEach(stroke=>{ctx.strokeStyle=stroke.color;ctx.lineWidth=stroke.width/photoEditorPreviewScale*scale;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();stroke.points.forEach((p,i)=>{const x=(p.x/photoEditorPreviewScale-rect.x)*scale,y=(p.y/photoEditorPreviewScale-rect.y)*scale;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();});
  photoEditorText.forEach(t=>{ctx.save();const size=t.size/photoEditorPreviewScale*scale;ctx.font=size+"px "+t.font;ctx.textAlign="center";ctx.textBaseline="middle";const x=(t.x*photoEditorImage.naturalWidth-rect.x)*scale,y=(t.y*photoEditorImage.naturalHeight-rect.y)*scale;if(t.fill){const m=ctx.measureText(t.text);ctx.fillStyle=t.fillColor||"#000000";ctx.globalAlpha=.72;ctx.fillRect(x-m.width/2-12*scale,y-size*.68,m.width+24*scale,size*1.35);ctx.globalAlpha=1;}ctx.fillStyle=t.color;ctx.fillText(t.text,x,y);ctx.restore();});
  canvas.toBlob(blob=>{
    if(!blob){toast("Не удалось обработать фото");return;}
    const item=pendingChatFiles[photoEditorIndex];if(!item)return;
    const name=(compressed?"compressed__":"")+photoEditorSourceName.replace(/^compressed__/,"");
    const out=new File([blob],name,{type:"image/jpeg",lastModified:Date.now()});
    URL.revokeObjectURL(item.previewUrl);item.file=out;item.previewUrl=URL.createObjectURL(out);pendingChatFile=out;
    renderPendingChatFiles();if(!silent)toast("Фото обработано");if(onDone)onDone();
  },"image/jpeg",compressed?0.72:0.94);
}
$("photoEditorSave").addEventListener("click",()=>saveCurrentPhotoEdit(()=>$("photoEditorClose").click()));
function renderPhotoEditorThumbnails(){
 const strip=$("photoEditorThumbnails");if(!strip)return;strip.innerHTML="";
 pendingChatFiles.forEach((item,index)=>{
   const video=isQueuedVideo(item.file),b=el("button","photo-editor-thumb"+(index===photoEditorIndex?" active":""));
   b.type="button";const media=video?el("video"):el("img");media.src=item.previewUrl;media.alt=item.file.name;
   if(video){media.muted=true;media.playsInline=true;media.preload="metadata";}
   b.append(media,el("span","",video?"▶ "+(index+1):String(index+1)));
   b.addEventListener("click",()=>{if(video){openQueuedMediaEditor(index);return;}if(index===photoEditorIndex)return;const open=()=>openPhotoEditor(index);if($("photoEditor").classList.contains("show")&&photoEditorImage)saveCurrentPhotoEdit(open);else open();});
   strip.append(b);
 });
 const add=el("button","chat-media-add-more","+ Добавить фото/видео");add.type="button";add.addEventListener("click",()=>$("chatMediaFile").click());strip.append(add);
}


/* Видео редактор: обрезка, таймлайн и временные слои */
let videoEditIndex=-1,videoEditFile=null,videoEditUrl=null,videoDuration=0,videoTrimA=0,videoTrimB=0,videoMode="crop",videoFreeCrop={x:.1,y:.1,w:.8,h:.8},videoCropDrag=null,videoStrokes=[],videoStroke=null,videoTexts=[],videoOverlayImage=null,videoOverlayUrl=null,videoOverlayPos={x:.72,y:.72},videoOverlayDragging=false,videoRecorder=null,videoExportChunks=[];
const ve=id=>$("video"+id);
function veTime(t){t=Math.max(0,t||0);return Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0");}
function veBounds(prefix){const all=ve(prefix+"All").checked;return all?{start:0,end:videoDuration}:{start:Math.max(0,Number(ve(prefix+"In").value)||0),end:Math.min(videoDuration,Number(ve(prefix+"Out").value)||videoDuration)};}
function veVisible(layer,t){return t>=layer.start&&t<=layer.end;}
function setVideoTab(tab){videoMode=tab;$("videoEditorStage").dataset.freeCrop=String(tab==="crop"&&ve("Crop").value==="free");document.querySelectorAll("[data-video-tab]").forEach(b=>b.classList.toggle("active",b.dataset.videoTab===tab));document.querySelectorAll("[data-video-panel]").forEach(p=>p.classList.toggle("active",p.dataset.videoPanel===tab));ve("OverlayCanvas").style.cursor=tab==="draw"?"crosshair":tab==="image"&&videoOverlayImage?"move":"default";drawVideoOverlay();}
function renderVideoEditorThumbnails(){const strip=$("videoEditorThumbnails");if(!strip)return;strip.innerHTML="";pendingChatFiles.forEach((item,index)=>{const b=el("button","photo-editor-thumb"+(index===videoEditIndex?" active":""));b.type="button";const media=isQueuedVideo(item.file)?el("video"):el("img");media.src=item.previewUrl;media.alt=item.file.name;if(media.tagName==="VIDEO"){media.muted=true;media.playsInline=true;media.preload="metadata";}b.append(media,el("span","",isQueuedVideo(item.file)?"▶ "+(index+1):String(index+1)));b.addEventListener("click",()=>{if(index===videoEditIndex)return;if(videoRecorder&&videoRecorder.state!=="inactive"){toast("Дождись завершения экспорта видео");return;}closeVideoEditor();if(isQueuedVideo(item.file))openVideoEditor(index);else openPhotoEditor(index);});strip.append(b);});const add=el("button","chat-media-add-more","+ Добавить фото/видео");add.type="button";add.addEventListener("click",()=>$("chatMediaFile").click());strip.append(add);}
function openVideoEditor(index){
 const item=pendingChatFiles[index];if(!item||!isQueuedVideo(item.file))return;
 try{
   if(videoEditUrl){URL.revokeObjectURL(videoEditUrl);videoEditUrl=null;}
   videoEditIndex=index;videoEditFile=item.file;videoEditUrl=URL.createObjectURL(item.file);
   renderVideoEditorThumbnails();
   videoFreeCrop={x:.1,y:.1,w:.8,h:.8};videoCropDrag=null;videoStrokes=[];videoTexts=[];videoOverlayImage=null;videoDuration=0;videoTrimA=0;videoTrimB=0;
   const v=ve("EditorPlayer");
   if(!v)throw new Error("Не найден видеоплеер редактора");
   v.pause();v.onloadedmetadata=null;v.onerror=null;
   v.onloadedmetadata=()=>{
     videoDuration=Number.isFinite(v.duration)?v.duration:0;
     if(!videoDuration){ve("EditorStatus").textContent="Не удалось определить длительность видео";return;}
     videoTrimA=0;videoTrimB=videoDuration;
     ve("Duration").textContent=veTime(videoDuration);ve("CurrentTime").textContent="0:00";
     ve("TrimStart").value=0;ve("TrimEnd").value=1000;updateVideoTimeline();resizeVideoOverlay();
     ve("EditorStatus").textContent="Видео загружено — выбери обрезку, кадрирование или эффекты";drawVideoOverlay();
   };
   v.onerror=()=>ve("EditorStatus").textContent="Не удалось открыть видео. Попробуй MP4 или WebM.";
   ve("EditorMeta").textContent=item.file.name;
   $("videoEditor").classList.add("show");$("videoEditor").setAttribute("aria-hidden","false");
   ve("EditorStatus").textContent="Загружаю видео…";
   v.src=videoEditUrl;v.load();setVideoTab("crop");
 }catch(error){
   console.error("Video editor failed:",error);
   ve("EditorStatus").textContent="Не удалось открыть редактор: "+(error?.message||"ошибка");
 }
}

function closeVideoEditor(){if(videoRecorder&&videoRecorder.state!=="inactive"){toast("Дождись завершения экспорта видео");return;}const v=ve("EditorPlayer");v.pause();v.removeAttribute("src");v.load();if(videoEditUrl)URL.revokeObjectURL(videoEditUrl);if(videoOverlayUrl)URL.revokeObjectURL(videoOverlayUrl);videoEditUrl=null;videoOverlayUrl=null;ve("Editor").classList.remove("show");ve("Editor").setAttribute("aria-hidden","true");}
function updateVideoTimeline(){const v=ve("EditorPlayer"),d=videoDuration||1;ve("TrimStart").style.setProperty("--range-start",(videoTrimA/d*100)+"%");ve("TrimEnd").style.setProperty("--range-end",(videoTrimB/d*100)+"%");ve("TrimRange").style.left=(videoTrimA/d*100)+"%";ve("TrimRange").style.width=((videoTrimB-videoTrimA)/d*100)+"%";ve("Playhead").style.left=(v.currentTime/d*100)+"%";ve("CurrentTime").textContent=veTime(v.currentTime);}
function resizeVideoOverlay(){const v=ve("EditorPlayer"),c=ve("OverlayCanvas"),stage=ve("EditorStage"),r=v.getBoundingClientRect(),sr=stage.getBoundingClientRect();if(!r.width||!r.height)return;c.style.left=(r.left-sr.left)+"px";c.style.top=(r.top-sr.top)+"px";c.style.width=r.width+"px";c.style.height=r.height+"px";c.width=Math.round(r.width*devicePixelRatio);c.height=Math.round(r.height*devicePixelRatio);drawVideoOverlay();}
function veCropRect(){const v=ve("EditorPlayer"),mode=ve("Crop").value;if(mode==="original")return{x:0,y:0,w:1,h:1};if(mode==="free")return{...videoFreeCrop};const p=mode.split(":").map(Number),target=p[0]/p[1],source=(v.videoWidth||1)/(v.videoHeight||1);let w=1,h=1;if(source>target)w=target/source;else h=source/target;return{x:(1-w)/2,y:(1-h)/2,w,h};}
function veFormatName(file){const ext=(file?.name||"").split(".").pop()?.toUpperCase();return ext&&ext.length<=5?ext:(file?.type?.split("/")[1]||"VIDEO").toUpperCase();}
function drawVideoOverlay(){const v=ve("EditorPlayer"),c=ve("OverlayCanvas");if(!v||!c.width)return;const ctx=c.getContext("2d"),sx=c.width/(v.clientWidth||1),sy=c.height/(v.clientHeight||1),t=v.currentTime||0;ctx.clearRect(0,0,c.width,c.height);ctx.save();ctx.scale(sx,sy);if(videoMode==="crop"&&ve("Crop").value!=="original"){const crop=veCropRect(),x=crop.x*(v.clientWidth||1),y=crop.y*(v.clientHeight||1),w=crop.w*(v.clientWidth||1),h=crop.h*(v.clientHeight||1);ctx.fillStyle="#0008";ctx.fillRect(0,0,v.clientWidth||1,y);ctx.fillRect(0,y+h,v.clientWidth||1,(v.clientHeight||1)-y-h);ctx.fillRect(0,y,x,h);ctx.fillRect(x+w,y,(v.clientWidth||1)-x-w,h);ctx.strokeStyle="#ffd52d";ctx.lineWidth=2;ctx.setLineDash([7,4]);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);if(ve("Crop").value==="free"){ctx.fillStyle="#ffd52d";[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(p=>ctx.fillRect(p[0]-5,p[1]-5,10,10));}}
 videoStrokes.filter(x=>veVisible(x,t)).forEach(s=>{ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();s.points.forEach((p,i)=>i?ctx.lineTo(p.x*(v.clientWidth||1),p.y*(v.clientHeight||1)):ctx.moveTo(p.x*(v.clientWidth||1),p.y*(v.clientHeight||1)));ctx.stroke();});
 videoTexts.filter(x=>veVisible(x,t)).forEach(x=>{ctx.font=x.size+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=x.color;ctx.fillText(x.text,x.x*(v.clientWidth||1),x.y*(v.clientHeight||1));});
 if(videoOverlayImage&&veVisible(videoOverlayImage,t)){const w=(v.clientWidth||1)*videoOverlayImage.size/100,h=w*videoOverlayImage.image.height/videoOverlayImage.image.width;ctx.drawImage(videoOverlayImage.image,videoOverlayImage.x*(v.clientWidth||1)-w/2,videoOverlayImage.y*(v.clientHeight||1)-h/2,w,h);}
 ctx.restore();}
function veCanvasPoint(e){const r=ve("OverlayCanvas").getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
function veRenderFrame(ctx,v,w,h,t){ctx.fillStyle="#000";ctx.fillRect(0,0,w,h);const crop=veCropRect(),sx=crop.x*v.videoWidth,sy=crop.y*v.videoHeight,sw=crop.w*v.videoWidth,sh=crop.h*v.videoHeight;ctx.drawImage(v,sx,sy,sw,sh,0,0,w,h);
 const scaleX=w/(v.clientWidth||w),scaleY=h/(v.clientHeight||h);ctx.save();ctx.scale(scaleX,scaleY);ctx.translate(-crop.x*(v.clientWidth||w),-crop.y*(v.clientHeight||h));
 videoStrokes.filter(x=>veVisible(x,t)).forEach(s=>{ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();s.points.forEach((p,i)=>i?ctx.lineTo(p.x*(v.clientWidth||w),p.y*(v.clientHeight||h)):ctx.moveTo(p.x*(v.clientWidth||w),p.y*(v.clientHeight||h)));ctx.stroke();});
 videoTexts.filter(x=>veVisible(x,t)).forEach(x=>{ctx.font=x.size+"px Arial";ctx.fillStyle=x.color;ctx.textAlign="center";ctx.fillText(x.text,x.x*(v.clientWidth||w),x.y*(v.clientHeight||h));});
 if(videoOverlayImage&&veVisible(videoOverlayImage,t)){const ow=(v.clientWidth||w)*videoOverlayImage.size/100,oh=ow*videoOverlayImage.image.height/videoOverlayImage.image.width;ctx.drawImage(videoOverlayImage.image,videoOverlayImage.x*(v.clientWidth||w)-ow/2,videoOverlayImage.y*(v.clientHeight||h)-oh/2,ow,oh);}
 ctx.restore();}
async function exportEditedVideo(){
 const v=ve("EditorPlayer");
 if(!videoEditFile||!videoDuration)return;
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){ve("EditorStatus").textContent="Экспорт видео не поддерживается этим браузером";return;}
 const start=Math.max(0,videoTrimA),end=Math.min(videoDuration,videoTrimB);
 if(end-start<.15){ve("EditorStatus").textContent="Выбери более длинный фрагмент";return;}
 const mimeCandidates=["video/mp4","video/mp4;codecs=avc1.42E01E","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
 const mime=mimeCandidates.find(x=>MediaRecorder.isTypeSupported(x));
 if(!mime){ve("EditorStatus").textContent="Этот браузер не поддерживает экспорт видео. Попробуй Chrome или Safari поновее.";return;}
 const out=document.createElement("canvas"),crop=veCropRect();
 let w=Math.max(2,Math.round(v.videoWidth*crop.w)),h=Math.max(2,Math.round(v.videoHeight*crop.h));
 const scale=Math.min(1280/Math.max(w,h),1);
 out.width=Math.max(2,Math.round(w*scale));out.height=Math.max(2,Math.round(h*scale));
 const ctx=out.getContext("2d"),stream=out.captureStream(30);
 try{const audioStream=v.captureStream?v.captureStream():null;if(audioStream)audioStream.getAudioTracks().forEach(t=>stream.addTrack(t));}catch(e){}
 videoExportChunks=[];
 try{videoRecorder=new MediaRecorder(stream,{mimeType});}
 catch(e){stream.getTracks().forEach(t=>t.stop());ve("EditorStatus").textContent="Не удалось запустить экспорт в этом браузере";return;}
 const exportFileName=videoEditFile.name.replace(/\.[^.]+$/,"")+"_edited"+(mime.includes("mp4")?".mp4":".webm");
 videoRecorder.ondataavailable=e=>{if(e.data&&e.data.size)videoExportChunks.push(e.data);};
 videoRecorder.onerror=()=>{ve("EditorStatus").textContent="Ошибка при обработке видео";ve("EditorSave").disabled=false;stream.getTracks().forEach(t=>t.stop());};
 videoRecorder.onstop=()=>{
   const blob=new Blob(videoExportChunks,{type:mime.split(";")[0]});
   if(!blob.size){ve("EditorStatus").textContent="Не удалось получить обработанное видео";ve("EditorSave").disabled=false;stream.getTracks().forEach(t=>t.stop());return;}
   const file=new File([blob],exportFileName,{type:mime.split(";")[0],lastModified:Date.now()}),item=pendingChatFiles[videoEditIndex];
   if(item){URL.revokeObjectURL(item.previewUrl);item.file=file;item.previewUrl=URL.createObjectURL(file);pendingChatFile=file;renderPendingChatFiles();}
   stream.getTracks().forEach(t=>t.stop());ve("EditorStatus").textContent="Видео сохранено в очередь";ve("EditorSave").disabled=false;
 };
 const oldTime=v.currentTime;
 v.pause();
 try{
   if(Math.abs(v.currentTime-start)>.02){
     const seeked=new Promise((resolve,reject)=>{
       const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error("seek failed"));};
       const cleanup=()=>{v.removeEventListener("seeked",done);v.removeEventListener("error",fail);};
       v.addEventListener("seeked",done,{once:true});v.addEventListener("error",fail,{once:true});
     });
     v.currentTime=start;
     await seeked;
   }
 }catch(e){ve("EditorStatus").textContent="Не удалось перейти к началу выбранного фрагмента";stream.getTracks().forEach(t=>t.stop());return;}
 ve("EditorSave").disabled=true;ve("EditorStatus").textContent="Экспортирую видео… не закрывай редактор";
 try{videoRecorder.start(250);}catch(e){ve("EditorStatus").textContent="Браузер не смог начать экспорт";ve("EditorSave").disabled=false;stream.getTracks().forEach(t=>t.stop());return;}
 let stopped=false;
 const frame=()=>{
   if(!videoRecorder||videoRecorder.state!=="recording"||stopped)return;
   try{veRenderFrame(ctx,v,out.width,out.height,v.currentTime);}catch(e){stopped=true;v.pause();videoRecorder.stop();return;}
   if(v.currentTime>=end||v.ended){stopped=true;v.pause();videoRecorder.stop();return;}
   requestAnimationFrame(frame);
 };
 try{await v.play();requestAnimationFrame(frame);}
 catch(e){ve("EditorStatus").textContent="Нажми воспроизведение и повтори сохранение";if(videoRecorder.state==="recording")videoRecorder.stop();else ve("EditorSave").disabled=false;}
}
ve("EditorPlay").addEventListener("click",()=>{const v=ve("EditorPlayer");if(v.paused){if(v.currentTime>=videoTrimB)v.currentTime=videoTrimA;v.play();}else v.pause();});
ve("EditorPlayer").addEventListener("play",()=>ve("EditorPlay").textContent="Ⅱ");ve("EditorPlayer").addEventListener("pause",()=>ve("EditorPlay").textContent="▶");
ve("EditorPlayer").addEventListener("timeupdate",()=>{const v=ve("EditorPlayer");if(v.currentTime>=videoTrimB&& !v.paused){v.pause();v.currentTime=videoTrimB;}updateVideoTimeline();drawVideoOverlay();});
ve("TrimStart").addEventListener("input",e=>{videoTrimA=Number(e.target.value)/1000*videoDuration;if(videoTrimA>=videoTrimB-.1){videoTrimA=Math.max(0,videoTrimB-.1);e.target.value=videoTrimA/videoDuration*1000;}if(ve("EditorPlayer").currentTime<videoTrimA)ve("EditorPlayer").currentTime=videoTrimA;updateVideoTimeline();});
ve("TrimEnd").addEventListener("input",e=>{videoTrimB=Number(e.target.value)/1000*videoDuration;if(videoTrimB<=videoTrimA+.1){videoTrimB=Math.min(videoDuration,videoTrimA+.1);e.target.value=videoTrimB/videoDuration*1000;}if(ve("EditorPlayer").currentTime>videoTrimB)ve("EditorPlayer").currentTime=videoTrimB;updateVideoTimeline();});
ve("Timeline").addEventListener("click",e=>{if(e.target===ve("TrimStart")||e.target===ve("TrimEnd"))return;const r=ve("Timeline").getBoundingClientRect();ve("EditorPlayer").currentTime=Math.max(videoTrimA,Math.min(videoTrimB,(e.clientX-r.left)/r.width*videoDuration));});
document.querySelectorAll("[data-video-tab]").forEach(b=>b.addEventListener("click",()=>setVideoTab(b.dataset.videoTab)));
ve("OverlayCanvas").addEventListener("pointerdown",e=>{const p=veCanvasPoint(e),t=ve("EditorPlayer").currentTime;if(videoMode==="crop"&&ve("Crop").value==="free"){const c=videoFreeCrop,edge=0.035;videoCropDrag={start:p,original:{...c},mode:Math.abs(p.x-c.x)<edge?"left":Math.abs(p.x-(c.x+c.w))<edge?"right":Math.abs(p.y-c.y)<edge?"top":Math.abs(p.y-(c.y+c.h))<edge?"bottom":"move"};ve("OverlayCanvas").setPointerCapture(e.pointerId);return;}if(videoMode==="draw"){const bounds=veBounds("Draw");videoStroke={color:ve("BrushColor").value,width:Number(ve("BrushSize").value),points:[p],start:bounds.start,end:bounds.end};videoStrokes.push(videoStroke);ve("OverlayCanvas").setPointerCapture(e.pointerId);drawVideoOverlay();}else if(videoMode==="image"&&videoOverlayImage){videoOverlayDragging=true;videoOverlayImage.x=p.x;videoOverlayImage.y=p.y;ve("OverlayCanvas").setPointerCapture(e.pointerId);drawVideoOverlay();}});
ve("OverlayCanvas").addEventListener("pointermove",e=>{const p=veCanvasPoint(e);if(videoCropDrag){const d=videoCropDrag,dx=p.x-d.start.x,dy=p.y-d.start.y,c={...d.original},min=.08;if(d.mode==="move"){c.x=Math.max(0,Math.min(1-c.w,c.x+dx));c.y=Math.max(0,Math.min(1-c.h,c.y+dy));}else if(d.mode==="left"){const right=c.x+c.w;c.x=Math.max(0,Math.min(right-min,c.x+dx));c.w=right-c.x;}else if(d.mode==="right"){c.w=Math.max(min,Math.min(1-c.x,c.w+dx));}else if(d.mode==="top"){const bottom=c.y+c.h;c.y=Math.max(0,Math.min(bottom-min,c.y+dy));c.h=bottom-c.y;}else if(d.mode==="bottom"){c.h=Math.max(min,Math.min(1-c.y,c.h+dy));}videoFreeCrop=c;drawVideoOverlay();return;}if(videoStroke){videoStroke.points.push(p);drawVideoOverlay();}else if(videoOverlayDragging&&videoOverlayImage){videoOverlayImage.x=p.x;videoOverlayImage.y=p.y;drawVideoOverlay();}});
["pointerup","pointercancel"].forEach(n=>ve("OverlayCanvas").addEventListener(n,()=>{videoStroke=null;videoOverlayDragging=false;videoCropDrag=null;}));
ve("AddText").addEventListener("click",()=>{const text=ve("TextValue").value.trim();if(!text)return;const b=veBounds("Text"),v=ve("EditorPlayer");videoTexts.push({text,color:ve("TextColor").value,size:Number(ve("TextSize").value),x:.5,y:.5,start:b.start,end:b.end});ve("TextValue").value="";drawVideoOverlay();});
ve("OverlayFile").addEventListener("change",e=>{const file=e.target.files[0];if(!file)return;if(videoOverlayUrl)URL.revokeObjectURL(videoOverlayUrl);videoOverlayUrl=URL.createObjectURL(file);const img=new Image();img.onload=()=>{videoOverlayImage={image:img,x:videoOverlayPos.x,y:videoOverlayPos.y,size:Number(ve("OverlaySize").value),...veBounds("Image")};setVideoTab("image");drawVideoOverlay();};img.src=videoOverlayUrl;});
ve("OverlaySize").addEventListener("input",()=>{if(videoOverlayImage)videoOverlayImage.size=Number(ve("OverlaySize").value);drawVideoOverlay();});
["Draw","Text","Image"].forEach(prefix=>[prefix+"All",prefix+"In",prefix+"Out"].forEach(id=>{const node=ve(id);if(node)node.addEventListener("change",()=>{if(prefix==="Image"&&videoOverlayImage)Object.assign(videoOverlayImage,veBounds("Image"));drawVideoOverlay();});}));
ve("Crop").addEventListener("change",()=>{setVideoTab("crop");});ve("OverlayPick").addEventListener("click",()=>ve("OverlayFile").click());
function findPendingMedia(type){return pendingChatFiles.findIndex(x=>x.file.type.startsWith(type));}
function switchToQueuedEditor(type){
 const index=findPendingMedia(type);
 if(index<0){toast(type==="video"?"В очереди нет видео":"В очереди нет фото");return;}
 if(type==="video"){
   const open=()=>{$("photoEditor").classList.remove("show");$("photoEditor").setAttribute("aria-hidden","true");photoEditorDrawing=false;openVideoEditor(index);};
   if(photoEditorImage)saveCurrentPhotoEdit(open);else open();
   return;
 }
 if(videoRecorder&&videoRecorder.state!=="inactive"){toast("Дождись завершения экспорта видео");return;}
 if(videoEditIndex>=0&&videoMode!=="crop"||videoEditIndex>=0&&ve("Crop").value!=="original"){
   if(!confirm("Переключиться на фото? Несохранённые изменения видео будут потеряны."))return;
 }
 closeVideoEditor();openPhotoEditor(index);
}
$("photoSwitchVideo").addEventListener("click",()=>switchToQueuedEditor("video"));
$("videoSwitchPhoto").addEventListener("click",()=>switchToQueuedEditor("image"));
ve("EditorSave").addEventListener("click",exportEditedVideo);
["EditorClose","EditorCancel"].forEach(id=>ve(id).addEventListener("click",closeVideoEditor));
window.addEventListener("resize",()=>{if(ve("Editor").classList.contains("show"))resizeVideoOverlay();});

async function uploadChatMedia(file, messageText) {
  const c = currentChat();
  if (!c || !canWrite(c)) return false;
  const check = await validateMediaFile(file, false);
  if (check) { toast(check); return false; }
  const path = c.id + "/" + me.id + "/" + crypto.randomUUID() + "__" + safeMediaFilename(file.name);
  toast("Загружаю файл…");
  let up;
  try {
    up = await sb.storage.from("chat-media").upload(path, file, { contentType: file.type, upsert: false });
  } catch (error) {
    toast("Ошибка загрузки фото: " + (error.message || "проверьте соединение"));
    return false;
  }
  if (up.error) { toast("Не удалось загрузить: " + up.error.message); return false; }
  const row = { chat_id: c.id, text: messageText || null, media_path: path, media_type: file.type.startsWith("video/") ? "video" : "image", media_mime: file.type, media_size: file.size };
  if (replyTo) row.reply_to = replyTo.id;
  const { data, error } = await sb.from("messages").insert(row).select().single();
  if (error) {
    await sb.storage.from("chat-media").remove([path]);
    toast("Не удалось отправить: " + error.message); return false;
  }
  addMessage(data, true);
  return true;
}

async function sendMessage() {
  const c = currentChat();
  const text = input.value.trim();
  const files=pendingChatFiles.map(item=>item.file);
  if(!c||(!text&&!files.length&&!pendingChatFile)||!canWrite(c))return;
  if(files.length&&!editing){
    $("sendBtn").disabled = true;
    try {
      let first=true;
      while(pendingChatFiles.length){
        const item=pendingChatFiles[0],sent=await uploadChatMedia(item.file,first?text:"");
        if(!sent){toast("Остальные файлы остались в очереди — можно повторить отправку");return;}
        first=false;URL.revokeObjectURL(item.previewUrl);pendingChatFiles.shift();pendingChatFile=pendingChatFiles[0]?.file||null;updateQueuedVideoFormat();renderPendingChatFiles();
      }
      clearPendingChatFile();
      input.value = ""; autoGrow(); cancelCompose();
      $("emojiPanel").classList.remove("show");
      input.focus(); unreadFrom = 0;
    } finally {
      $("sendBtn").disabled = false;
    }
    return;
  }
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
$("chatMediaFile").addEventListener("change", async () => {
  const files=[...($("chatMediaFile").files||[])];if(!files.length)return;
  for(const file of files){const check=await validateMediaFile(file,false);if(check){toast(check);$("chatMediaFile").value="";return;}}
  showPendingChatFiles(files);$("chatMediaFile").value="";
  renderPhotoEditorThumbnails();renderVideoEditorThumbnails();
});
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
let pendingPostVoice = null;

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
  // Keep the recording session in the listener closure. stopRecording() clears
  // the global recording flag before MediaRecorder emits its final dataavailable
  // event; checking that global here used to discard the final audio chunk.
  const recordingSession = recording;
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) recordingSession.chunks.push(event.data);
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
  if (current.context === "post") {
    pendingPostVoice = { blob: blob, ms: ms };
    const name = $("postMediaName");
    if (name) name.textContent = (name.textContent ? name.textContent + " · " : "") + "Голосовая запись готова";
    toast("Голосовая запись добавлена к публикации. Нажмите «Опубликовать».");
    return;
  }
  await sendVoiceBlob(blob, ms, current.context);
}

async function sendVoiceBlob(blob, ms, context) {
  const type = blob.type || "audio/webm";
  const ext = type.indexOf("mp4") !== -1 ? "m4a" : type.indexOf("ogg") !== -1 ? "ogg" : "webm";
  const name = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
  const path = me.id + "/" + name + "." + ext;
  let upload;
  try {
    upload = await sb.storage.from("voice").upload(path, blob, { contentType: type, upsert: false });
  } catch (error) {
    toast("Не удалось загрузить запись: " + (error.message || error));
    return;
  }
  if (upload.error) { toast("Не удалось загрузить запись: " + upload.error.message); return; }

  if (context === "post") {
    try {
      const { data: status, error: statusError } = await sb.rpc("get_app_status");
      if (statusError) throw statusError;
      window.appStatus = status || window.appStatus;
      updateFeedComposer();
      if (!window.appStatus.can_post) throw new Error("Публикация сейчас запрещена для этого аккаунта.");
      const { error } = await sb.from("posts").insert({ voice_path: path, voice_ms: ms });
      if (error) throw error;
      await loadFeed();
    } catch (error) {
      await sb.storage.from("voice").remove([path]);
      toast("Голосовой пост не опубликован: " + (error.message || error));
    }
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
  if (isSystemChat(c)) { toast("Этот чат нельзя удалить или очистить"); return; }
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
  if (!c || !me) return false;
  try {
    // Read the latest message from the server rather than relying on the
    // locally cached 30-message page, which may be stale during refreshes.
    const { data: latest, error: latestError } = await sb.from("messages")
      .select("created_at")
      .eq("chat_id", c.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (!latest) return false;

    const currentRead = Number.isFinite(c.lastRead) ? c.lastRead : 0;
    const targetRead = Math.max(currentRead, new Date(latest.created_at).getTime());
    const { data, error } = await sb.from("chat_members")
      .update({ last_read_at: new Date(targetRead).toISOString() })
      .eq("chat_id", c.id)
      .eq("user_id", me.id)
      .select("last_read_at")
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.last_read_at) throw new Error("Статус прочтения не сохранился на сервере");

    c.lastRead = new Date(data.last_read_at).getTime();
    c.unread = 0;
    renderChatList(); updateTitle(); updateToBottom();
    return true;
  } catch (error) {
    console.error("Could not save read state:", error);
    toast("Не удалось отметить прочитанным: " + (error.message || "ошибка сервера"));
    return false;
  }
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
    !isSystemChat(c) && { label: "Удалить чат", icon: ICONS.trash, danger: true, action: () => clearChat(c, true) }
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
  if (typeof window.refreshMyModerationStatus === "function") window.refreshMyModerationStatus();
  subscribeRealtime();
  const admin = !!window.appStatus.is_admin;
  $("adminOpen").style.display = admin ? "flex" : "none";
  $("mmAdmin").style.display = admin ? "flex" : "none";
  $("railAdmin").style.display = admin ? "flex" : "none";
  $("settingsServiceNoticesBtn").style.display = window.appStatus.is_owner ? "flex" : "none";
  $("railJournal").style.display = (window.appStatus.is_owner || window.appStatus.is_admin_role || window.appStatus.is_moderator) ? "flex" : "none";
  $("railStaff").style.display = (window.appStatus.is_owner || window.appStatus.is_admin_role || window.appStatus.is_moderator) ? "flex" : "none";
  $("railSupport").style.display = (window.appStatus.is_owner || window.appStatus.is_admin_role || window.appStatus.is_moderator) ? "flex" : "none";
  $("mmSupport").style.display = "flex";
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
  $("railServiceNotices").style.display = "none";
  $("settingsServiceNoticesBtn").style.display = "none";
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

// ---------- Пошаговое создание групп и каналов ----------
let createChatKind="group";
let createChatSelected=new Map();
let createChatSearchTimer=null;
let createChatAvatarFile=null;
let createChatAvatarPreviewUrl=null;
const createOverlay=$("chatCreateOverlay");
const createPanes=["createChooser","createGroupPeople","createGroupDetails","createChannelDetails","createChannelSuccess"];
function showCreatePane(id){createPanes.forEach(pid=>$(pid).hidden=pid!==id);createOverlay.classList.add("open");createOverlay.setAttribute("aria-hidden","false");}
function openCreateChooser(){createChatSelected.clear();createChatAvatarFile=null;showCreatePane("createChooser");renderCreateChatSelected();renderCreateChatPeople([]);}
function closeCreateChat(){createOverlay.classList.remove("open");createOverlay.setAttribute("aria-hidden","true");if(createChatAvatarPreviewUrl){URL.revokeObjectURL(createChatAvatarPreviewUrl);createChatAvatarPreviewUrl=null;}createChatAvatarFile=null;}
function resetCreateChat(kind){createChatKind=kind;createChatSelected.clear();createChatAvatarFile=null;$(createChatKind==="group"?"chatCreateGroupName":"chatCreateChannelName").value="";$("chatCreateDescription").value="";$("chatCreateUsername").value="";$("chatCreateMemberSearch").value="";$("chatCreateMessage").textContent="";$("channelCreateMessage").textContent="";$("channelVisibilityMessage").textContent="";$("channelDescriptionCount").textContent="0 / 1000";$(createChatKind==="group"?"chatCreateGroupAvatar":"chatCreateChannelAvatar").value="";$(createChatKind==="group"?"chatCreateGroupAvatarPreview":"chatCreateChannelAvatarPreview").textContent="＋";renderCreateChatSelected();renderCreateChatPeople([]);}
function renderCreateChatSelected(){const box=$("chatCreateSelected");box.innerHTML="";createChatSelected.forEach(p=>{const b=el("button","chat-create-chip",p.display_name+" ×");b.type="button";b.addEventListener("click",()=>{createChatSelected.delete(p.id);renderCreateChatSelected();});box.append(b);});}
function renderCreateChatPeople(list){const box=$("chatCreatePeople");box.innerHTML="";if(!list.length){box.append(el("div","list-note","Введите имя или @username, чтобы найти людей"));return;}list.forEach(p=>{const b=el("button","chat-create-person");b.type="button";b.append(makeAvatar(p,"small"));const info=el("span","chat-create-person-info");info.append(el("strong","",p.display_name||"Пользователь"),el("small","",p.username?"@"+p.username:""));b.append(info,createChoiceMark(createChatSelected.has(p.id)));b.addEventListener("click",()=>{if(createChatSelected.has(p.id))createChatSelected.delete(p.id);else createChatSelected.set(p.id,p);renderCreateChatSelected();renderCreateChatPeople(list);});box.append(b);});}
function createChoiceMark(selected){return el("span","chat-create-person-check",selected?"✓":"＋");}
function createAvatarPreview(file){createChatAvatarFile=file;if(createChatAvatarPreviewUrl)URL.revokeObjectURL(createChatAvatarPreviewUrl);createChatAvatarPreviewUrl=file?URL.createObjectURL(file):null;const preview=$(createChatKind==="group"?"chatCreateGroupAvatarPreview":"chatCreateChannelAvatarPreview");preview.innerHTML="";if(createChatAvatarPreviewUrl){const img=document.createElement("img");img.src=createChatAvatarPreviewUrl;preview.append(img);}else preview.textContent="＋";}
$("createChatVisible").addEventListener("click",openCreateChooser);
$("chooseCreateGroup").addEventListener("click",async()=>{resetCreateChat("group");showCreatePane("createGroupPeople");const {data,error}=await sb.from("profiles").select("id,display_name,username,avatar_url").neq("id",me.id).order("display_name").limit(100);if(!error&&data)renderCreateChatPeople(data);});
$("chooseCreateChannel").addEventListener("click",()=>{resetCreateChat("channel");showCreatePane("createChannelDetails");});
$("chatCreateClose").addEventListener("click",closeCreateChat);
document.querySelectorAll("[data-create-close]").forEach(b=>b.addEventListener("click",closeCreateChat));
document.querySelectorAll("[data-create-back]").forEach(b=>b.addEventListener("click",()=>{const target=b.dataset.createBack;showCreatePane(target==="people"?"createGroupPeople":target==="channel"?"createChannelDetails":target==="chooser"?"createChooser":"createChooser");}));
createOverlay.addEventListener("click",e=>{if(e.target===createOverlay)closeCreateChat();});
$("chatCreateMemberSearch").addEventListener("input",()=>{clearTimeout(createChatSearchTimer);const q=$("chatCreateMemberSearch").value.trim().replace(/^@/,"");if(q.length<2){renderCreateChatPeople([]);return;}createChatSearchTimer=setTimeout(async()=>{const {data,error}=await sb.from("profiles").select("id,display_name,username,avatar_url").or("username.ilike.*"+q+"*,display_name.ilike.*"+q+"*").neq("id",me.id).limit(30);if(error){$("chatCreatePeople").textContent="Не удалось загрузить пользователей";return;}renderCreateChatPeople(data||[]);},250);});
$("groupPeopleNext").addEventListener("click",()=>{showCreatePane("createGroupDetails");$(createChatKind==="group"?"chatCreateGroupName":"chatCreateChannelName").focus();});
$(createChatKind==="group"?"chatCreateGroupName":"chatCreateChannelName").addEventListener("input",()=>{const ok=!!$(createChatKind==="group"?"chatCreateGroupName":"chatCreateChannelName").value.trim();$("groupCreateSubmit").disabled=!ok;$("channelDetailsNext").disabled=!ok;});
$("chatCreateDescription").addEventListener("input",()=>$("channelDescriptionCount").textContent=$("chatCreateDescription").value.length+" / 1000");
$(createChatKind==="group"?"chatCreateGroupAvatar":"chatCreateChannelAvatar").addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];if(!file)return;if(!file.type.startsWith("image/")||file.size>5*1024*1024){toast("Выбери изображение до 5 МБ");e.target.value="";return;}createAvatarPreview(file);});
async function uploadCreatedChatAvatar(chatId){if(!createChatAvatarFile)return null;const ext=(createChatAvatarFile.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";const path="chats/"+chatId+"/"+Date.now()+"."+ext;const {error}=await sb.storage.from("avatars").upload(path,createChatAvatarFile,{upsert:true,contentType:createChatAvatarFile.type});if(error)throw error;const {data}=sb.storage.from("avatars").getPublicUrl(path);const upd=await sb.from("chats").update({photo_path:data.publicUrl}).eq("id",chatId);if(upd.error)throw upd.error;return data.publicUrl;}
async function submitCreatedChat(kind,visibility){const title=$(createChatKind==="group"?"chatCreateGroupName":"chatCreateChannelName").value.trim();const description=kind==="channel"?$("chatCreateDescription").value.trim():"";const username=$("chatCreateUsername").value.trim().toLowerCase();const msg=$(kind==="group"?"chatCreateMessage":"channelVisibilityMessage");if(!title){msg.textContent="Сначала укажи название.";return;}if(kind==="channel"&&visibility==="public"&&!/^[a-z0-9_]{5,32}$/.test(username)){msg.textContent="Для публичного канала нужен юзернейм: 5–32 символа, латиница, цифры и _.";return;}const button=$(kind==="group"?"groupCreateSubmit":"channelFinish");button.disabled=true;button.textContent="Создаём…";msg.textContent="";try{const {data,error}=await sb.rpc("create_group_or_channel",{p_kind:kind,p_title:title,p_description:description,p_member_ids:kind==="group"?[...createChatSelected.keys()]:[],p_visibility:visibility,p_username:visibility==="public"?username:null,p_join_approval:false,p_history_visible:true});if(error)throw error;await uploadCreatedChatAvatar(data);closeCreateChat();await loadAll();openChat(data);toast(kind==="group"?"Группа создана":"Канал создан");}catch(error){const map={username_taken:"Этот юзернейм уже занят.",member_not_found:"Один из участников не найден.",group_needs_members:"Не удалось создать группу.",invalid_public_username:"Проверь юзернейм канала.",description_too_long:"Описание не должно превышать 1000 символов."};msg.textContent=map[error.message]||("Не удалось создать: "+(error.message||"ошибка"));}finally{button.disabled=false;button.textContent=kind==="group"?"Далее":"Продолжить";}}
$("groupCreateSubmit").addEventListener("click",()=>submitCreatedChat("group","private"));
$("channelDetailsNext").addEventListener("click",()=>{if(!$(createChatKind==="group"?"chatCreateGroupName":"chatCreateChannelName").value.trim())return;showCreatePane("createChannelSuccess");});
$("channelFinish").addEventListener("click",()=>submitCreatedChat("channel",document.querySelector('input[name="channelVisibility"]:checked').value));


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
function openInfo() {
  infoPanel.classList.add("open");
  app.classList.add("info-open");
  refreshInfo();
  const c = currentChat();
  const target = c && c.type === "private" ? otherUserId(c) : null;
  if (target && target !== me.id) {
    sb.rpc("record_profile_visit", { profile_id: target }).then(({ error }) => {
      if (error) console.warn("Profile visit was not recorded:", error);
    });
  }
}
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
  if (isSystemChat(c)) $("infoName").append(svgEl(ICONS.verified, "vbadge"));
  const st = chatStatus(c);
  $("infoStatus").textContent = st.text; $("infoStatus").className = "pc-status" + (st.online ? " online" : "");

  const rows = $("infoRows"); rows.innerHTML = "";
  if (p) {
    if (p.status) rows.append(infoRow(ICONS.info, p.status, "Статус"));
    rows.append(infoRow(ICONS.at, "@" + p.username, "Имя пользователя", () => copyText("@" + p.username, "Имя пользователя скопировано")));
    if (p.bio) rows.append(infoRow(ICONS.info, p.bio, "О себе"));
    fillInfoExtra(p, rows);
  } else if (isSystemChat(c)) {
    rows.append(infoRow(ICONS.info, c.type === "notice" ? "Персональные сообщения от администрации и модерации. Ответить или удалить этот чат нельзя." : "Официальные новости и уведомления MessageRoom. Писать в этот чат может только администратор.", "Описание"));
  }
  const profileTabs = $("chatContentTabs");\n  if (profileTabs) {\n    profileTabs.style.display = ["group","channel"].includes(c.type) ? "flex" : "none";\n    const memberTab = $("profileMembersTab");\n    if (memberTab) { memberTab.textContent = c.type === "channel" ? "Подписчики" : "Участники"; memberTab.style.display = "inline-flex"; }\n    profileTabs.querySelectorAll("[data-content-tab]").forEach(b => b.classList.toggle("active", b.dataset.contentTab === currentContentTab));\n  }\n  if (["group","channel"].includes(c.type)) showProfileContentTab(c,currentContentTab);\n  const tg = el("label", "tg-item toggle");
  tg.append(svgEl(ICONS.bell, "ii plain"), document.createTextNode("Уведомления"));
  const cb = el("input"); cb.type = "checkbox"; cb.checked = !c.muted;
  cb.addEventListener("change", () => setChatFlag(c, "muted", !cb.checked));
  tg.append(cb, el("i", "switch"));
  rows.append(tg);

  const acts = $("infoActions"); acts.innerHTML = "";
  if (["group","channel"].includes(c.type) && ["owner","admin"].includes(c.role)) {
    acts.append(infoAction(ICONS.info, "Настройки " + (c.type === "channel" ? "канала" : "группы"), () => openChatSettings(c)));
  }
  if (["group","channel"].includes(c.type)) {
    acts.append(infoAction(ICONS.info, c.type === "channel" ? "Подписчики" : "Участники", () => showChatMembers(c)));
  }
  acts.append(infoAction(ICONS.pinI, c.pinned ? "Открепить чат" : "Закрепить чат", () => setChatFlag(c, "pinned", !c.pinned)));
  acts.append(infoAction(ICONS.archI, c.archived ? "Вернуть из архива" : "В архив", () => setChatFlag(c, "archived", !c.archived)));
  if (!isSystemChat(c)) {
    acts.append(infoAction(ICONS.broom, "Очистить историю", () => clearChat(c, false)));
    acts.append(infoAction(ICONS.trash, "Удалить чат", () => clearChat(c, true), true));
  }
  if (p) {
    const closeFriendButton = infoAction(ICONS.info, "Близкие друзья…", async () => {
      closeFriendButton.disabled = true;
      const { data: existing, error: lookupError } = await sb.from("close_friends")
        .select("friend_id").eq("friend_id", p.id).maybeSingle();
      if (lookupError) {
        toast("Не удалось проверить список близких друзей");
        closeFriendButton.disabled = false;
        return;
      }
      if (existing) {
        const { error } = await sb.from("close_friends").delete().eq("friend_id", p.id);
        if (error) toast("Не удалось удалить пользователя из близких друзей");
        else toast("Пользователь удалён из близких друзей");
      } else {
        const { error } = await sb.from("close_friends").insert({ owner_id: me.id, friend_id: p.id });
        if (error) toast("Не удалось добавить пользователя в близкие друзья");
        else toast("Пользователь добавлен в близкие друзья");
      }
      closeFriendButton.disabled = false;
      refreshInfo();
    });
    closeFriendButton.dataset.closeFriend = "1";
    acts.append(closeFriendButton);
    sb.from("close_friends").select("friend_id").eq("friend_id", p.id).maybeSingle().then(({ data, error }) => {
      if (!error && closeFriendButton.isConnected) {
        closeFriendButton.lastChild.textContent = data ? "Убрать из близких друзей" : "Добавить в близкие друзья";
      }
    });
    const isB = blocked.has(p.id);
    acts.append(infoAction(ICONS.block, isB ? "Разблокировать" : "Заблокировать", () => setBlocked(p.id, !isB), !isB));
  }
}

// ---------- Профиль группы/канала: настройки и участники ----------
const CHAT_REACTION_CHOICES = ["❤️","👍","👎","🔥","🎉","😁","😢","😡","🥰","🤔","👏","💯","⚡","👀","🙏","💔"];
function openChatSettings(c) {
  const old = document.querySelector(".chat-settings-overlay"); if (old) old.remove();
  const overlay = el("div","chat-settings-overlay");
  const dialog = el("section","chat-settings-dialog");
  dialog.innerHTML = '<h2>Настройки '+(c.type==="channel"?"канала":"группы")+'</h2>'+
    '<label>Название</label><input id="csTitle" maxlength="80">'+
    '<label>Фото чата</label><input id="csPhoto" type="file" accept="image/*">'+
    '<label>Описание</label><textarea id="csDescription" maxlength="1000"></textarea>'+
    '<label>Тип чата</label><select id="csVisibility"><option value="private">Приватный</option><option value="public">Публичный</option></select>'+
    '<label>Юзернейм (смена раз в 14 дней)</label><input id="csUsername" maxlength="32" placeholder="username">'+
    '<label class="setting-check"><input id="csApproval" type="checkbox"> Принимать участников только по заявке</label>'+
    '<label class="setting-check"><input id="csHistory" type="checkbox"> Показывать новым участникам историю</label>'+
    '<label>Медленный режим</label><select id="csSlow"><option value="0">Выключен</option><option value="5">5 секунд</option><option value="10">10 секунд</option><option value="15">15 секунд</option><option value="30">30 секунд</option><option value="60">1 минута</option><option value="300">5 минут</option></select>'+
    '<label class="setting-check"><input id="csMedia" type="checkbox"> Разрешить отправку медиа</label>'+
    '<label class="setting-check"><input id="csReactionsEnabled" type="checkbox"> Разрешить реакции</label>'+
    '<label>Разрешённые эмодзи реакций</label><div class="reaction-grid" id="csReactions"></div>'+
    '<div class="chat-settings-error" id="csError"></div><div class="chat-settings-actions"><button type="button" id="csCancel">Отмена</button><button type="button" class="primary" id="csSave">Сохранить</button></div>';
  overlay.append(dialog); document.body.append(overlay);
  const $c=id=>dialog.querySelector("#"+id);
  $c("csTitle").value=c.title||""; $c("csDescription").value=c.description||"";
  $c("csVisibility").value=c.visibility||"private"; $c("csUsername").value=c.username||"";
  $c("csApproval").checked=!!c.joinApproval; $c("csHistory").checked=c.historyVisible!==false;
  $c("csSlow").value=String(c.slowModeSeconds||0); $c("csMedia").checked=c.canSendMedia!==false;
  $c("csReactionsEnabled").checked=c.reactionsEnabled!==false;
  CHAT_REACTION_CHOICES.forEach(emoji=>{const label=el("label");const cb=el("input");cb.type="checkbox";cb.value=emoji;cb.checked=(c.allowedReactions||[]).includes(emoji);label.append(cb,document.createTextNode(emoji));$c("csReactions").append(label);});
  $c("csVisibility").addEventListener("change",()=>{$c("csUsername").placeholder=$c("csVisibility").value==="public"?"Обязательно, 5–32 символа":"Необязательно";});
  $c("csCancel").onclick=()=>overlay.remove();
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
  $c("csSave").onclick=async()=>{
    const button=$c("csSave"),username=$c("csUsername").value.trim().toLowerCase();
    button.disabled=true;button.textContent="Сохраняем…";$c("csError").textContent="";
    try{
      const {error}=await sb.rpc("update_chat_settings",{p_chat_id:c.id,p_title:$c("csTitle").value.trim(),p_description:$c("csDescription").value,p_username:username,p_visibility:$c("csVisibility").value,p_join_approval:$c("csApproval").checked,p_history_visible:$c("csHistory").checked,p_slow_mode_seconds:Number($c("csSlow").value),p_reactions_enabled:$c("csReactionsEnabled").checked,p_can_send_media:$c("csMedia").checked,p_allowed_reactions:[...$c("csReactions").querySelectorAll("input:checked")].map(x=>x.value)});
      if(error)throw error;
      const photo=$c("csPhoto").files[0];
      if(photo){
        if(!photo.type.startsWith("image/")||photo.size>5*1024*1024)throw new Error("Фото должно быть изображением до 5 МБ");
        const path=c.id+"/profile-"+Date.now()+"."+((photo.name.match(/\.([a-z0-9]{2,5})$/i)||[])[1]||"jpg");
        const up=await sb.storage.from("avatars").upload(path,photo,{contentType:photo.type,upsert:true});if(up.error)throw up.error;
        const pub=sb.storage.from("avatars").getPublicUrl(path);
        const upd=await sb.from("chats").update({photo_path:pub.data.publicUrl}).eq("id",c.id);if(upd.error)throw upd.error;
      }
      overlay.remove();await loadAll();if(currentId===c.id)refreshInfo();toast("Настройки сохранены");
    }catch(error){const m={username_cooldown:"Юзернейм можно менять раз в 14 дней.",username_taken:"Этот юзернейм уже занят.",invalid_public_username:"Публичный юзернейм: 5–32 символа, латиница, цифры и _.",not_allowed:"Недостаточно прав для изменения настроек."};$c("csError").textContent=m[error.message]||error.message||"Не удалось сохранить";button.disabled=false;button.textContent="Сохранить";}
  };
}
function showProfileContentTab(c, tab) {
  const rows=$("infoRows"); if(!rows)return;
  rows.innerHTML="";
  const messages=(c.messages||[]).slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if(tab==="members"){ showChatMembers(c); return; }
  const filtered=messages.filter(m=>{
    if(tab==="media")return !!m.media_path && ["image","video"].includes(m.media_type);
    if(tab==="files")return !!m.media_path && !["image","video"].includes(m.media_type);
    if(tab==="voice")return !!m.voice_path;
    if(tab==="links")return /https?:\/\//i.test(m.text||"");
    return false;
  });
  if(!filtered.length){rows.append(el("div","info-row",({media:"Медиа пока нет",files:"Файлов пока нет",voice:"Голосовых пока нет",links:"Ссылок пока нет"})[tab]||"Пусто"));return;}
  filtered.forEach(m=>{
    const row=el("div","chat-member-row profile-content-item");
    const content=el("div","chat-member-meta");
    const sender=el("small","",nameOf(m.sender_id));
    const date=el("small","",fmtDateTime(m.created_at));
    content.append(sender,date);
    if(m.text)content.append(el("div","",m.text));
    if(m.media_path)appendMediaPreview(content,m.media_path,m.media_type,"chat-media");
    if(m.voice_path)content.append(voicePlayer(m.voice_path,m.voice_ms));
    row.append(content);rows.append(row);
  });
}
async function showChatMembers(c) {
  const rows=$("infoRows");rows.innerHTML='<div class="info-row">Загружаем список…</div>';
  const {data,error}=await sb.rpc("get_chat_member_profiles",{p_chat_id:c.id});
  if(error){rows.innerHTML="";rows.append(el("div","info-row","Не удалось загрузить список участников"));toast(error.message||"Ошибка загрузки");return;}
  rows.innerHTML="";
  rows.append(el("div","settings-title",(c.type==="channel"?"Подписчики":"Участники")+" · "+(data||[]).length));
  (data||[]).forEach(member=>{
    const row=el("div","chat-member-row");const avatar=makeAvatar({id:member.user_id,display_name:member.display_name||"Пользователь",avatar_url:member.avatar_url});
    const meta=el("div","chat-member-meta");meta.append(el("strong","",member.display_name||"Пользователь"));
    if(member.username)meta.append(el("small","","@"+member.username));
    const role=el("span","chat-member-role",({owner:"Владелец",admin:"Администратор",member:c.type==="channel"?"Подписчик":"Участник"})[member.role]||"Участник");
    row.append(avatar,meta,role);rows.append(row);
  });
}
document.addEventListener("click",e=>{
  const tab=e.target.closest("#chatContentTabs [data-content-tab]");if(!tab)return;
  const c=currentChat();if(!c||!["group","channel"].includes(c.type))return;
  currentContentTab=tab.dataset.contentTab||"media";
  document.querySelectorAll("#chatContentTabs [data-content-tab]").forEach(b=>b.classList.toggle("active",b===tab));
  showProfileContentTab(c,currentContentTab);
});
