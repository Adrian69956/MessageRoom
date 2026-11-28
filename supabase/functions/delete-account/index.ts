import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function storagePath(value: string | null | undefined, bucket: string): string | null {
  if (!value) return null;
  const marker = `/${bucket}/`;
  const i = value.indexOf(marker);
  const path = i >= 0 ? value.slice(i + marker.length).split("?")[0] : value;
  return path && !path.startsWith("http") ? decodeURIComponent(path) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply({ error: "server configuration error" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");
  const { data: auth, error: authError } = await db.auth.getUser(token);
  const actorId = auth?.user?.id;
  if (authError || !actorId) return reply({ error: "not authenticated" }, 401);

  const body = await req.json().catch(() => ({}));
  const targetId = typeof body.targetUserId === "string" ? body.targetUserId : actorId;
  if (!targetId) return reply({ error: "target user required" }, 400);

  const { data: ownerRow, error: ownerError } = await db.from("app_admins")
    .select("user_id").eq("user_id", actorId).maybeSingle();
  if (ownerError) return reply({ error: ownerError.message }, 500);
  const isOwner = !!ownerRow;
  const isSelf = targetId === actorId;
  if (!isSelf && !isOwner) return reply({ error: "forbidden" }, 403);

  const { data: targetOwner, error: targetOwnerError } = await db.from("app_admins")
    .select("user_id").eq("user_id", targetId).maybeSingle();
  if (targetOwnerError) return reply({ error: targetOwnerError.message }, 500);
  if (targetOwner) return reply({ error: "Нельзя удалить аккаунт владельца. Сначала передайте владение." }, 403);

  const { data: targetUser, error: targetError } = await db.auth.admin.getUserById(targetId);
  if (targetError || !targetUser?.user) return reply({ error: "Пользователь не найден" }, 404);

  // Collect media paths before cascading deletion removes the related rows.
  const files: Record<string, Set<string>> = {
    avatars: new Set(), voice: new Set(), "chat-media": new Set(),
    "post-media": new Set(), "support-attachments": new Set(),
  };
  const add = (bucket: string, value: string | null | undefined) => {
    const path = storagePath(value, bucket);
    if (path) files[bucket].add(path);
  };

  const { data: profile } = await db.from("profiles").select("avatar_url").eq("id", targetId).maybeSingle();
  add("avatars", profile?.avatar_url);

  const { data: posts } = await db.from("posts").select("media_path, voice_path").eq("author_id", targetId);
  for (const p of posts || []) { add("post-media", p.media_path); add("voice", p.voice_path); }

  const { data: sentMessages } = await db.from("messages").select("id, media_path, voice_path").eq("sender_id", targetId);
  const messageIds = (sentMessages || []).map((m: {id:string}) => m.id);
  for (const m of sentMessages || []) { add("chat-media", m.media_path); add("voice", m.voice_path); }

  const { data: tickets } = await db.from("support_tickets").select("id").eq("user_id", targetId);
  const ticketIds = (tickets || []).map((t: {id:string}) => t.id);
  if (ticketIds.length) {
    const { data: supportMessages } = await db.from("support_messages").select("attachment_path").in("ticket_id", ticketIds);
    for (const m of supportMessages || []) add("support-attachments", m.attachment_path);
  }

  // Clear non-cascading references that otherwise prevent Auth deletion.
  if (messageIds.length) {
    for (let i = 0; i < messageIds.length; i += 100) {
      const chunk = messageIds.slice(i, i + 100);
      const { error } = await db.from("messages").update({ reply_to: null }).in("reply_to", chunk);
      if (error) return reply({ error: "Не удалось очистить ответы на сообщения: " + error.message }, 500);
    }
  }
  const { error: messagesError } = await db.from("messages").delete().eq("sender_id", targetId);
  if (messagesError) return reply({ error: "Не удалось удалить сообщения: " + messagesError.message }, 500);
  const { error: chatsError } = await db.from("chats").update({ created_by: null }).eq("created_by", targetId);
  if (chatsError) return reply({ error: "Не удалось отвязать созданные чаты: " + chatsError.message }, 500);

  const { error: deleteError } = await db.auth.admin.deleteUser(targetId);
  if (deleteError) return reply({ error: "Не удалось удалить аккаунт: " + deleteError.message }, 500);

  const storageErrors: string[] = [];
  for (const [bucket, paths] of Object.entries(files)) {
    const list = [...paths];
    for (let i = 0; i < list.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(list.slice(i, i + 100));
      if (error) storageErrors.push(bucket + ": " + error.message);
    }
  }

  return reply({ success: true, storageWarnings: storageErrors });
});
