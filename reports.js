// Publication reports: the queue is available only to the Owner and Moderators.
(() => {
  const queue = document.getElementById("reportQueueOverlay");
  const journal = document.getElementById("journalOverlay");
  const journalList = document.getElementById("journalList");
  const queueList = document.getElementById("reportQueueList");
  const dialog = document.getElementById("postReportDialog");
  const reasonField = document.getElementById("postReportReason");
  const detailsField = document.getElementById("postReportDetails");
  const message = document.getElementById("postReportMsg");
  const submit = document.getElementById("postReportSubmit");
  let selectedPost = null;
  let filter = "new";
  let channel = null;
  let loading = false;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const canSeeQueue = () => !!(window.appStatus && (window.appStatus.is_owner || window.appStatus.is_moderator));
  const statusLabel = (status) => status === "resolved" ? "Решена" : status === "rejected" ? "Отклонена" : "Новая";

  window.openPostReport = (post) => {
    if (!me || !post || post.author_id === me.id) return;
    selectedPost = post;
    reasonField.value = "Спам или реклама";
    detailsField.value = "";
    message.textContent = "";
    dialog.classList.add("open");
  };

  const closeDialog = () => { dialog.classList.remove("open"); selectedPost = null; };
  document.getElementById("postReportClose").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });

  submit.addEventListener("click", async () => {
    if (!me || !selectedPost) return;
    submit.disabled = true;
    message.textContent = "Отправляем жалобу…";
    const { error } = await sb.from("post_reports").insert({
      post_id: selectedPost.id,
      reporter_id: me.id,
      reason: reasonField.value,
      details: detailsField.value.trim() || null,
      priority: !!window.appStatus.is_moderator
    });
    submit.disabled = false;
    if (error) {
      message.textContent = error.code === "23505"
        ? "Вы уже отправляли жалобу на эту публикацию."
        : "Не удалось отправить жалобу: " + error.message;
      return;
    }
    closeDialog();
    if (typeof toast === "function") toast("Жалоба отправлена");
  });

  async function openReportedUser(userId) {
    if (!userId) return;
    if (typeof startChatWith === "function") {
      await startChatWith(userId);
      if (typeof openInfo === "function") openInfo();
    }
  }

  async function loadQueue() {
    if (!canSeeQueue() || loading) return;
    loading = true;
    queueList.innerHTML = '<div class="list-note">Загружаем жалобы…</div>';
    let query = sb.from("post_reports")
      .select("id,post_id,post_author_id,post_text_snapshot,reporter_id,reason,details,priority,status,created_at,posts(id,author_id,text,created_at)")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });
    if (filter === "new") query = query.eq("status", "new");
    const { data, error } = await query;
    loading = false;
    if (error) {
      queueList.innerHTML = "";
      queueList.append(document.createTextNode("Не удалось загрузить жалобы: " + error.message));
      return;
    }
    if (!data || !data.length) {
      queueList.innerHTML = '<div class="list-note">Жалоб пока нет</div>';
      return;
    }
    const ids = [...new Set(data.map((r) => r.reporter_id).concat(data.map((r) => (r.posts && r.posts.author_id) || r.post_author_id).filter(Boolean)))];
    let profiles = {};
    if (ids.length) {
      const { data: people } = await sb.from("profiles").select("id,display_name,username").in("id", ids);
      (people || []).forEach((p) => { profiles[p.id] = p; });
    }
    queueList.innerHTML = "";
    data.forEach((report) => {
      const post = report.posts;
      const reporter = profiles[report.reporter_id];
      const author = profiles[(post && post.author_id) || report.post_author_id];
      const card = document.createElement("article");
      card.className = "report-card";
      const head = document.createElement("div");
      head.className = "report-card-head";
      const title = document.createElement("strong");
      title.textContent = "Жалоба на публикацию";
      head.append(title);
      if (report.priority) {
        const priority = document.createElement("span");
        priority.className = "report-priority";
        priority.textContent = "ВАЖНАЯ";
        head.append(priority);
      }
      card.append(head);
      const meta = document.createElement("div");
      meta.className = "report-card-meta";
      meta.innerHTML = "";
      meta.append(document.createTextNode("От: "));
      if (reporter) {
        const reporterLink = document.createElement("button");
        reporterLink.type = "button"; reporterLink.className = "report-user-link";
        reporterLink.textContent = "@" + reporter.username;
        reporterLink.addEventListener("click", () => openReportedUser(reporter.id));
        meta.append(reporterLink);
      } else meta.append(document.createTextNode("пользователь"));
      meta.append(document.createTextNode(" · Автор: "));
      if (author) {
        const authorLink = document.createElement("button");
        authorLink.type = "button"; authorLink.className = "report-user-link";
        authorLink.textContent = "@" + author.username;
        authorLink.addEventListener("click", () => openReportedUser(author.id));
        meta.append(authorLink);
      } else meta.append(document.createTextNode("неизвестен"));
      meta.append(document.createTextNode(" · " + new Date(report.created_at).toLocaleString("ru-RU")));
      card.append(meta);
      const reason = document.createElement("div");
      reason.className = "report-card-reason";
      reason.textContent = "Причина: " + report.reason + " · " + statusLabel(report.status);
      card.append(reason);
      const body = document.createElement("div");
      body.className = "report-card-content";
      body.textContent = (post && post.text) || report.post_text_snapshot || "Публикация содержит медиа или голосовое сообщение.";
      card.append(body);
      if (report.details) {
        const details = document.createElement("div");
        details.className = "report-card-details";
        details.textContent = "Комментарий: " + report.details;
        card.append(details);
      }
      const actions = document.createElement("div");
      actions.className = "report-card-actions";
      if (report.status !== "resolved") {
        const resolve = document.createElement("button");
        resolve.className = "primary";
        resolve.textContent = "Отметить решённой";
        resolve.addEventListener("click", () => updateReport(report.id, "resolved"));
        actions.append(resolve);
      }
      if (report.status !== "rejected") {
        const reject = document.createElement("button");
        reject.textContent = "Отклонить";
        reject.addEventListener("click", () => updateReport(report.id, "rejected"));
        actions.append(reject);
      }
      if (report.status !== "new") {
        const reopen = document.createElement("button");
        reopen.textContent = "Вернуть в новые";
        reopen.addEventListener("click", () => updateReport(report.id, "new"));
        actions.append(reopen);
      }
      const remove = document.createElement("button");
      remove.className = "danger";
      remove.textContent = "Удалить жалобу";
      remove.addEventListener("click", () => deleteReport(report.id));
      actions.append(remove);
      card.append(actions);
      queueList.append(card);
    });
  }

  async function updateReport(id, status) {
    const { error } = await sb.from("post_reports").update({
      status, reviewed_by: me.id, reviewed_at: new Date().toISOString()
    }).eq("id", id);
    if (error) { if (typeof toast === "function") toast("Не удалось обновить жалобу: " + error.message); return; }
    await loadQueue();
  }
  async function deleteReport(id) {
    if (!confirm("Удалить эту жалобу?")) return;
    const { error } = await sb.from("post_reports").delete().eq("id", id);
    if (error) { if (typeof toast === "function") toast("Не удалось удалить жалобу: " + error.message); return; }
    await loadQueue();
  }

  function subscribe() {
    if (channel || !canSeeQueue()) return;
    channel = sb.channel("post-reports-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reports" }, () => loadQueue())
      .subscribe();
  }
  function unsubscribe() {
    if (channel) { sb.removeChannel(channel); channel = null; }
  }


  const actionNames = {
    report_submitted: "Отправлена жалоба на публикацию",
    report_status_changed: "Изменён статус жалобы",
    warning_issued: "Выдано предупреждение",
    restriction_issued: "Выдано временное ограничение",
    restriction_revoked: "Отменено временное ограничение",
    support_ticket_created: "Создано обращение в поддержку",
    support_message_sent: "Отправлен ответ в поддержку",
    support_internal_note: "Добавлена внутренняя заметка",
    support_status_changed: "Изменён статус обращения",
    support_ticket_assigned: "Назначен ответственный",
    report_deleted: "Удалена жалоба",
    posts_deleted: "Удалена публикация",
    post_comments_deleted: "Удалён комментарий",
    role_changed: "Изменена роль пользователя"
  };
  async function loadJournal() {
    journalList.innerHTML = '<div class="list-note">Загружаем журнал…</div>';
    const { data, error } = await sb.from("staff_action_log")
      .select("id,actor_id,action,target_type,target_id,details,created_at")
      .order("created_at", { ascending: false }).limit(100);
    journalList.innerHTML = "";
    if (error) { journalList.textContent = "Не удалось загрузить журнал: " + error.message; return; }
    if (!data || !data.length) { journalList.innerHTML = '<div class="list-note">Записей пока нет</div>'; return; }
    const actorIds = [...new Set(data.map((entry) => entry.actor_id).filter(Boolean))];
    let actorProfiles = {};
    if (actorIds.length) {
      const { data: people } = await sb.from("profiles").select("id,display_name,username").in("id", actorIds);
      (people || []).forEach((person) => { actorProfiles[person.id] = person; });
    }
    data.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "journal-entry";
      const title = document.createElement("strong");
      title.textContent = actionNames[entry.action] || entry.action.replace(/_/g, " ");
      const date = document.createElement("small");
      const actor = actorProfiles[entry.actor_id];
      date.textContent = (actor ? "@" + actor.username + " · " : "") + new Date(entry.created_at).toLocaleString("ru-RU");
      card.append(title, date);
      const details = document.createElement("p");
      details.textContent = JSON.stringify(entry.details || {}, null, 2);
      card.append(details);
      journalList.append(card);
    });
  }
  document.getElementById("railJournal").addEventListener("click", () => {
    if (!(window.appStatus.is_owner || window.appStatus.is_admin_role || window.appStatus.is_moderator)) return;
    journal.classList.add("open");
    loadJournal();
  });
  document.getElementById("journalClose").addEventListener("click", () => journal.classList.remove("open"));
  journal.addEventListener("click", (event) => { if (event.target === journal) journal.classList.remove("open"); });

  document.getElementById("railReports").addEventListener("click", () => {
    if (!canSeeQueue()) return;
    queue.classList.add("open");
    subscribe();
    loadQueue();
  });
  document.getElementById("reportQueueClose").addEventListener("click", () => {
    queue.classList.remove("open");
    unsubscribe();
  });
  queue.addEventListener("click", (event) => {
    if (event.target === queue) { queue.classList.remove("open"); unsubscribe(); }
  });
  document.querySelectorAll("[data-report-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      filter = button.dataset.reportFilter;
      document.querySelectorAll("[data-report-filter]").forEach((b) => b.classList.toggle("active", b === button));
      loadQueue();
    });
  });
})();
