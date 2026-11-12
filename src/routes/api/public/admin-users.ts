import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function requireAdmin(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.split(".").length !== 3) return null;
  const url = process.env['SUPABASE_URL']!, key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
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
        let body: { action?: string; amount?: number; unit?: string; email?: string; password?: string; id?: string; name?: string };
        try { body = await request.json(); } catch { return json({ error: "Pedido inválido." }, 400); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const a = supabaseAdmin.auth.admin;
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const id = String(body.id || "");
        const name = String(body.name || "").trim().slice(0, 60);
        const blank = (titular: string) => JSON.stringify({ v: 1, titular: titular || "Eu", people: [], incomes: [], bills: [], purchases: [], received: [], hidden: [] });
        const readState = async (uid: string) => {
          const { data } = await supabaseAdmin.from("app_state").select("json").eq("id", uid).maybeSingle();
          try { return data ? JSON.parse(data.json) : null; } catch { return null; }
        };
        const writeState = (uid: string, j: string) =>
          supabaseAdmin.from("app_state").upsert({ id: uid, json: j, updated_at: new Date().toISOString() });
        switch (body.action) {
          case "list": {
            const { data, error } = await a.listUsers({ perPage: 1000 });
            if (error) return json({ error: error.message }, 500);
            const { data: rows } = await supabaseAdmin.from("app_state").select("id, json, updated_at");
            const names: Record<string, string> = {};
            const stats: Record<string, { total: number; ativos: number; updated_at: string }> = {};
            const now = new Date(), ym = now.getFullYear() * 12 + now.getMonth();
            const toN = (m: string) => { const [y, mo] = String(m || "").split("-").map(Number); return (y ?? 0) * 12 + ((mo ?? 1) - 1); };
            for (const r of rows || []) {
              try {
                const st = JSON.parse(r.json);
                names[r.id] = st.titular || "";
                const ps: { start?: string; n?: number | null }[] = Array.isArray(st.purchases) ? st.purchases : [];
                const inc: { start?: string; n?: number | null }[] = Array.isArray(st.incomes) ? st.incomes : [];
                const on = (p: { start?: string; n?: number | null }) => { const i = ym - toN(p.start || ""); return i >= 0 && (p.n == null || i < p.n); };
                const total = ps.length + inc.length + (st.bills?.length || 0) + (st.received?.length || 0);
                stats[r.id] = { total, ativos: ps.filter(on).length + inc.filter(on).length, updated_at: r.updated_at };
              } catch { /* ignore */ }
            }
            const key = (id: string) => (id === adminId ? (stats[id] ? id : "main") : id);
            return json({ users: data.users.map((u) => ({ id: u.id, name: names[u.id] || names[key(u.id)] || "", stats: stats[u.id] || stats[key(u.id)] || null, expires_at: (u.app_metadata as { expires_at?: string } | undefined)?.expires_at || null, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, suspended: !!(u as { banned_until?: string }).banned_until && new Date((u as { banned_until?: string }).banned_until!).getTime() > Date.now(), admin: u.id === adminId })) });
          }
          case "create": {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return json({ error: "E-mail inválido." }, 400);
            if (password.length < 6 || password.length > 72) return json({ error: "A senha precisa ter de 6 a 72 caracteres." }, 400);
            const { data, error } = await a.createUser({ email, password, email_confirm: true });
            if (error) return json({ error: /already/i.test(error.message) ? "Esse e-mail já tem acesso." : error.message }, 400);
            if (data.user?.id) await writeState(data.user.id, blank(name));
            return json({ id: data.user?.id });
          }
          case "password": {
            if (!id || password.length < 6 || password.length > 72) return json({ error: "A senha precisa ter de 6 a 72 caracteres." }, 400);
            const { error } = await a.updateUserById(id, { password });
            if (error) return json({ error: error.message }, 400);
            return json({ ok: true });
          }
          case "rename": {
            if (!id || id === adminId || !name) return json({ error: "Informe um nome." }, 400);
            const st = (await readState(id)) || JSON.parse(blank(name));
            st.titular = name;
            const { error } = await writeState(id, JSON.stringify(st));
            if (error) return json({ error: error.message }, 400);
            return json({ ok: true });
          }
          case "wipe": {
            if (!id || id === adminId) return json({ error: "Não é possível apagar os dados do administrador por aqui." }, 400);
            const st = await readState(id);
            const { error } = await writeState(id, blank(st?.titular || "Eu"));
            if (error) return json({ error: error.message }, 400);
            return json({ ok: true });
          }
          case "suspend":
          case "unsuspend": {
            if (!id || id === adminId) return json({ error: "Não é possível suspender o administrador." }, 400);
            const { error } = await a.updateUserById(id, { ban_duration: body.action === "suspend" ? "876000h" : "none" });
            if (error) return json({ error: error.message }, 400);
            return json({ ok: true });
          }
          case "expiry": {
            if (!id || id === adminId) return json({ error: "Não é possível limitar o acesso do administrador." }, 400);
            const n = Math.floor(Number(body.amount));
            const units: Record<string, number> = { horas: 3600e3, dias: 86400e3 };
            let exp: string | null = null;
            if (body.unit !== "sem") {
              if (!(n >= 1 && n <= 1000)) return json({ error: "Informe uma duração entre 1 e 1000." }, 400);
              const d = new Date();
              if (units[body.unit || ""]) d.setTime(d.getTime() + n * units[body.unit!]!);
              else if (body.unit === "meses") d.setMonth(d.getMonth() + n);
              else if (body.unit === "anos") d.setFullYear(d.getFullYear() + n);
              else return json({ error: "Unidade inválida." }, 400);
              exp = d.toISOString();
            }
            const { data: cu } = await a.getUserById(id);
            const { error } = await a.updateUserById(id, { app_metadata: { ...(cu?.user?.app_metadata || {}), expires_at: exp } });
            if (error) return json({ error: error.message }, 400);
            return json({ ok: true, expires_at: exp });
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
