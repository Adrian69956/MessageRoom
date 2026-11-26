// ===================== Админ-панель (доступна только администратору) =====================
// Права проверяются в базе данных: даже если открыть панель вручную, чужой аккаунт получит ошибку.
const adminOverlay = document.getElementById("adminOverlay");
const adminStats = document.getElementById("adminStats");
const adminSearch = document.getElementById("adminSearch");
const adminUsers = document.getElementById("adminUsers");
const bcSubject = document.getElementById("bcSubject");
const bcText = document.getElementById("bcText");
const bcChat = document.getElementById("bcChat");
const bcPush = document.getElementById("bcPush");
const bcEmail = document.getElementById("bcEmail");
const bcMsg = document.getElementById("bcMsg");
const bcSend = document.getElementById("bcSend");
const mtOn = document.getElementById("mtOn");
const mtText = document.getElementById("mtText");
const mtMsg = document.getElementById("mtMsg");
let adminSearchTimer = null;

function adminNote(box, text, isError) {
  box.textContent = text;
  box.className = "settings-msg" + (isError ? " error" : "");
}

async function loadAdminStats() {
  const { data, error } = await sb.rpc("admin_stats");
  if (error) { adminStats.textContent = "Ошибка: " + error.message; return; }
  adminStats.textContent = "Пользователей: " + data.users + " · заблокировано: " + data.banned
    + " · сообщений: " + data.messages + " · push-подписок: " + data.push;
}

function userRow(u) {
  const row = el("div", "admin-user" + (u.banned ? " banned" : ""));
  row.append(el("div", "avatar", initial(u.display_name)));
  const info = el("div", "chat-info");
  info.append(
    el("div", "chat-name", u.display_name + (u.banned ? " (заблокирован)" : "")),
    el("div", "chat-last", "@" + u.username + " · " + (u.email || "")),
    el("div", "chat-last", "Регистрация: " + new Date(u.created_at).toLocaleDateString("ru-RU")
      + (u.last_sign_in_at ? " · вход: " + new Date(u.last_sign_in_at).toLocaleDateString("ru-RU") : ""))
  );
  row.append(info);
  if (u.id !== me.id) {
    const btn = el("button", "admin-ban" + (u.banned ? "" : " danger"), u.banned ? "Разблокировать" : "Заблокировать");
    btn.addEventListener("click", async () => {
      if (!u.banned && !confirm("Заблокировать " + u.display_name + "?")) return;
      btn.disabled = true;
      const { error } = await sb.rpc("admin_set_banned", { target: u.id, value: !u.banned });
      if (error) { alert("Ошибка: " + error.message); btn.disabled = false; return; }
      searchAdminUsers();
      loadAdminStats();
    });
    row.append(btn);
  }
  return row;
}

async function searchAdminUsers() {
  const q = adminSearch.value.trim().replace(/^@/, "");
  const { data, error } = await sb.rpc("admin_search_users", { q: q });
  adminUsers.innerHTML = "";
  if (error) { adminUsers.append(el("div", "list-note", "Ошибка: " + error.message)); return; }
  if (!data.length) { adminUsers.append(el("div", "list-note", "Никого не найдено")); return; }
  data.forEach((u) => adminUsers.append(userRow(u)));
}
adminSearch.addEventListener("input", () => {
  clearTimeout(adminSearchTimer);
  adminSearchTimer = setTimeout(searchAdminUsers, 300);
});

bcSend.addEventListener("click", async () => {
  const text = bcText.value.trim();
  if (!text) { adminNote(bcMsg, "Введите текст", true); return; }
  if (!bcChat.checked && !bcPush.checked && !bcEmail.checked) { adminNote(bcMsg, "Выберите, куда отправить", true); return; }
  if (!confirm("Отправить рассылку всем пользователям?")) return;
  bcSend.disabled = true;
  adminNote(bcMsg, "Отправляем...", false);
  try {
    if (bcChat.checked && !bcPush.checked && !bcEmail.checked) {
      const { error } = await sb.from("messages").insert({ chat_id: window.appStatus.system_chat_id, text: text });
      if (error) throw error;
      adminNote(bcMsg, "Отправлено в чат MessageRoom", false);
    } else {
      const { data, error } = await sb.functions.invoke("admin-broadcast", {
        body: { text: text, subject: bcSubject.value.trim(), chat: bcChat.checked, push: bcPush.checked, email: bcEmail.checked }
      });
      if (error) throw error;
      const parts = [];
      if (data.chat) parts.push("Чат: " + data.chat);
      if (data.push) parts.push("Push: " + data.push);
      if (data.email) parts.push("Почта: " + data.email);
      adminNote(bcMsg, parts.join(". "), false);
    }
    bcText.value = "";
  } catch (e) {
    adminNote(bcMsg, "Ошибка: " + (e.message || e), true);
  } finally {
    bcSend.disabled = false;
  }
});

document.getElementById("mtSave").addEventListener("click", async () => {
  const { error } = await sb.rpc("admin_set_maintenance", { enabled: mtOn.checked, msg: mtText.value });
  if (error) { adminNote(mtMsg, "Ошибка: " + error.message, true); return; }
  await loadStatus();
  adminNote(mtMsg, mtOn.checked ? "Техперерыв включён: сайт видите только вы" : "Сайт открыт для всех", false);
});

document.getElementById("adminOpen").addEventListener("click", async () => {
  if (!window.appStatus.is_admin) return;
  adminOverlay.classList.add("open");
  adminNote(bcMsg, "", false);
  adminNote(mtMsg, "", false);
  const st = await loadStatus();
  mtOn.checked = st.maintenance;
  mtText.value = st.maintenance_text;
  loadAdminStats();
  searchAdminUsers();
});
document.getElementById("adminClose").addEventListener("click", () => adminOverlay.classList.remove("open"));
