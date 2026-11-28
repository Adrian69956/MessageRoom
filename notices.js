// Owner-only composer for the protected per-user service-notice chats.
(() => {
  const overlay = document.getElementById("serviceNoticesOverlay");
  const close = document.getElementById("serviceNoticesClose");
  const target = document.getElementById("serviceNoticeTarget");
  const body = document.getElementById("serviceNoticeText");
  const status = document.getElementById("serviceNoticeStatus");
  const send = document.getElementById("serviceNoticeSend");
  if (!overlay || !close || !target || !body || !status || !send) return;

  async function loadRecipients() {
    target.innerHTML = '<option value="all">Всем пользователям</option>';
    const { data, error } = await sb.from("profiles")
      .select("id,display_name,username")
      .neq("id", me.id)
      .order("username", { ascending: true });
    if (error) {
      status.textContent = "Не удалось загрузить пользователей: " + error.message;
      return;
    }
    (data || []).forEach(person => {
      const option = document.createElement("option");
      option.value = person.id;
      option.textContent = (person.display_name || "Пользователь") + " · @" + (person.username || "без_ника");
      target.append(option);
    });
  }

  const settingsButton = document.getElementById("settingsServiceNoticesBtn");
  const openComposer = async () => {
    if (!window.appStatus?.is_owner) return;
    overlay.classList.add("open");
    status.textContent = "";
    if (target.options.length <= 1) await loadRecipients();
  };
  settingsButton?.addEventListener("click", openComposer);
  document.getElementById("chatList")?.addEventListener("click", event => {
    if (event.target.closest(".service-notice-shortcut")) openComposer();
  });
  close.addEventListener("click", () => overlay.classList.remove("open"));
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.remove("open");
  });
  send.addEventListener("click", async () => {
    if (!window.appStatus?.is_owner) return;
    const message = body.value.trim();
    if (!message) {
      status.textContent = "Введите текст уведомления.";
      return;
    }
    const isAll = target.value === "all";
    const recipientName = isAll ? "всем пользователям" : target.options[target.selectedIndex]?.textContent;
    if (!confirm("Отправить служебное уведомление: " + recipientName + "?")) return;
    send.disabled = true;
    status.textContent = "Отправляем…";
    const { data, error } = await sb.rpc("owner_send_service_notice", {
      target: isAll ? null : target.value,
      message_text: message
    });
    send.disabled = false;
    if (error) {
      status.textContent = "Не удалось отправить: " + error.message;
      return;
    }
    body.value = "";
    status.textContent = isAll
      ? "Уведомление доставлено пользователям: " + data
      : "Уведомление отправлено выбранному пользователю.";
  });
})();
