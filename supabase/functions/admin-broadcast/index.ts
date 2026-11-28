// Рассылка от администратора: служебный чат, push-уведомления и почта.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Проверяем, что запрос от администратора
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const adminId = auth?.user?.id;
  if (!adminId) return reply({ error: "not authenticated" }, 401);
  const { data: adminRow } = await db.from("app_admins").select("user_id").eq("user_id", adminId).maybeSingle();
  if (!adminRow) return reply({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  const subject = String(body.subject || "").trim() || "MessageRoom";
  if (!text || text.length > 4000) return reply({ error: "Текст пустой или длиннее 4000 символов" }, 400);

  const result: Record<string, unknown> = {};

  // 1. Служебный чат
  if (body.chat) {
    const { data: s } = await db.from("app_settings").select("system_chat_id").eq("id", 1).single();
    const { error } = await db.from("messages").insert({ chat_id: s!.system_chat_id, sender_id: adminId, text });
    result.chat = error ? "ошибка: " + error.message : "отправлено";
  }

  // Незаблокированные пользователи
  const { data: active } = await db.from("profiles").select("id").eq("banned", false);
  const activeIds = new Set((active || []).map((p: { id: string }) => p.id));

  // 2. Push-уведомления
  if (body.push) {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY");
    const priv = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!pub || !priv) {
      result.push = "не настроено: добавьте VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY в секреты";
    } else {
      webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", pub, priv);
      const { data: subs } = await db.from("push_subscriptions").select("endpoint, user_id, p256dh, auth");
      const payload = JSON.stringify({ title: subject, body: text });
      let sent = 0, failed = 0;
      await Promise.all((subs || []).filter((s) => activeIds.has(s.user_id)).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          sent++;
        } catch (e) {
          failed++;
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }));
      result.push = `доставлено ${sent}, ошибок ${failed}`;
    }
  }

  // 3. Почта через Brevo
  if (body.email) {
    const key = Deno.env.get("BREVO_API_KEY");
    const sender = Deno.env.get("BREVO_SENDER_EMAIL");
    if (!key || !sender) {
      result.email = "не настроено: добавьте BREVO_API_KEY и BREVO_SENDER_EMAIL в секреты";
    } else {
      const emails: string[] = [];
      for (let page = 1; ; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
        if (error || !data.users.length) break;
        data.users.forEach((u) => { if (u.email && activeIds.has(u.id)) emails.push(u.email); });
        if (data.users.length < 1000) break;
      }
      const html = "<p>" + escapeHtml(text).replace(/\n/g, "<br>") + "</p>";
      let sent = 0, failed = 0;
      for (let i = 0; i < emails.length; i += 100) {
        const chunk = emails.slice(i, i + 100);
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            sender: { email: sender, name: "MessageRoom" },
            subject,
            htmlContent: html,
            messageVersions: chunk.map((email) => ({ to: [{ email }] })),
          }),
        });
        if (res.ok) sent += chunk.length;
        else { failed += chunk.length; result.email_error = await res.text(); }
      }
      result.email = `отправлено ${sent}, ошибок ${failed}`;
    }
  }

  return reply(result);
});
