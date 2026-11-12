import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function requireAdmin(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.split(".").length !== 3) return null;
  const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const sb = createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  const { data: ok } = await sb.rpc("has_role", { _user_id: data.claims.sub, _role: "admin" });
  return ok ? data.claims.sub : null;
}

export const Route = createFileRoute("/api/public/admin-users")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const adminId = await requireAdmin(request);
        if (!adminId) return json({ error: "Acesso negado." }, 403);
        let body: { action?: string; email?: string; password?: string; id?: string };
        try { body = await request.json(); } catch { return json({ error: "Pedido inválido." }, 400); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const a = supabaseAdmin.auth.admin;
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const id = String(body.id || "");
        switch (body.action) {
          case "list": {
            const { data, error } = await a.listUsers({ perPage: 1000 });
            if (error) return json({ error: error.message }, 500);
            return json({ users: data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, admin: u.id === adminId })) });
          }
          case "create": {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return json({ error: "E-mail inválido." }, 400);
            if (password.length < 6 || password.length > 72) return json({ error: "A senha precisa ter de 6 a 72 caracteres." }, 400);
            const { data, error } = await a.createUser({ email, password, email_confirm: true });
            if (error) return json({ error: /already/i.test(error.message) ? "Esse e-mail já tem acesso." : error.message }, 400);
            return json({ id: data.user?.id });
          }
          case "password": {
            if (!id || password.length < 6 || password.length > 72) return json({ error: "A senha precisa ter de 6 a 72 caracteres." }, 400);
            const { error } = await a.updateUserById(id, { password });
            if (error) return json({ error: error.message }, 400);
            return json({ ok: true });
          }
          case "delete": {
            if (!id || id === adminId) return json({ error: "Não é possível remover a conta do administrador." }, 400);
            const { error } = await a.deleteUser(id);
            if (error) return json({ error: error.message }, 400);
            await supabaseAdmin.from("app_state").delete().eq("id", id);
            return json({ ok: true });
          }
        }
        return json({ error: "Ação desconhecida." }, 400);
      },
    },
  },
});
