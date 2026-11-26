// Service worker: показывает push-уведомления
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "MessageRoom", {
    body: data.body || "",
    icon: "icon.svg",
    badge: "icon.svg"
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const chat = event.notification.data && event.notification.data.chat;
    for (const c of list) {
      if ("focus" in c) { if (chat) c.postMessage({ openChat: chat }); return c.focus(); }
    }
    return clients.openWindow(self.registration.scope);
  }));
});
