// ===================== Push-уведомления в браузере =====================
const pushToggle = document.getElementById("pushToggle");
const pushMsg = document.getElementById("pushMsg");
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function vapidKeyBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

async function currentPushSub() {
  if (!pushSupported) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function savePushSub(sub) {
  const j = sub.toJSON();
  const { error } = await sb.rpc("save_push_subscription", { _endpoint: j.endpoint, _p256dh: j.keys.p256dh, _auth: j.keys.auth });
  if (error) throw error;
}

async function refreshPushUi() {
  if (!pushSupported) {
    pushToggle.style.display = "none";
    pushMsg.textContent = "Этот браузер не поддерживает push-уведомления. На iPhone сначала добавьте сайт на экран «Домой».";
    return;
  }
  const sub = await currentPushSub();
  pushToggle.textContent = sub ? "Выключить push-уведомления" : "Включить push-уведомления";
  pushMsg.className = "settings-msg";
  pushMsg.textContent = Notification.permission === "denied"
    ? "Уведомления запрещены в настройках браузера для этого сайта" : (sub ? "Push-уведомления включены" : "");
}

pushToggle.addEventListener("click", async () => {
  pushToggle.disabled = true;
  try {
    const sub = await currentPushSub();
    if (sub) {
      await sb.rpc("delete_push_subscription", { _endpoint: sub.endpoint });
      await sub.unsubscribe();
    } else {
      if (await Notification.requestPermission() !== "granted") throw new Error("Вы не разрешили уведомления");
      const reg = await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      const fresh = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(window.APP_CONFIG.vapidPublicKey)
      });
      await savePushSub(fresh);
    }
    await refreshPushUi();
  } catch (e) {
    pushMsg.className = "settings-msg error";
    pushMsg.textContent = "Не получилось: " + (e.message || e);
  } finally {
    pushToggle.disabled = false;
  }
});

document.getElementById("menuBtn").addEventListener("click", refreshPushUi);

// После входа привязываем уже существующую подписку браузера к текущему аккаунту
async function relinkPushSub() {
  try {
    const sub = await currentPushSub();
    if (sub && Notification.permission === "granted") await savePushSub(sub);
  } catch (e) { console.warn(e); }
}
