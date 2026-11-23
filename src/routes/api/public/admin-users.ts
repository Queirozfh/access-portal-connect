import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { aiMonth } from '@/lib/ai-quota';
import { ACCESS_FEATURE_IDS } from '@/lib/access-control';

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
        let body: { action?: string; amount?: number; unit?: string; email?: string; password?: string; id?: string; name?: string; enabled?: boolean; access_level?: number; policies?: Array<{ level: number; features: string[] }> };
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
            const [permissions, usage] = await Promise.all([
              supabaseAdmin.from('ai_account_access').select('user_id, enabled'),
              supabaseAdmin.from('ai_monthly_usage').select('user_id, used').eq('month', aiMonth()),
            ]);
            if (permissions.error || usage.error) return json({ error: 'Não foi possível consultar o consumo de IA.' }, 503);
            const aiPermissions = new Map((permissions.data || []).map(row => [row.user_id, row.enabled]));
            const aiUsage = new Map((usage.data || []).map(row => [row.user_id, row.used]));
            const { data: accessLevels, error: accessLevelError } = await supabaseAdmin.from('user_access_levels').select('user_id, level');
            const levelByUser = new Map((accessLevels || []).map(row => [row.user_id, row.level]));
            const { data: rows } = await supabaseAdmin.from("app_state").select("id, json, updated_at");
            const names: Record<string, string> = {};
            const stats: Record<string, { total: number; ativos: number; updated_at: string }> = {};
            const now = new Date(), ym = now.getFullYear() * 12 + now.getMonth();
            const toN = (m: string) => { const [y, mo] = String(m || "").split("-").map(Number); return (y ?? 0) * 12 + ((mo ?? 1) - 1); };
            for (const r of rows || []) {
              try {
                const st = JSON.parse(r.json);
                const current = st.patrimonioApp || st;
                names[r.id] = current.settings?.ownerName || st.titular || "";
                if (Array.isArray(current.items)) {
                  const month = new Date().toISOString().slice(0, 7);
                  stats[r.id] = { total: current.items.length + (current.bills?.length || 0) + (current.reimbursements?.length || 0), ativos: current.items.filter((item: {month?: string; due?: string; recurring?: boolean}) => item.month === month || item.due === month || (item.recurring && (item.month || '') <= month)).length, updated_at: r.updated_at };
                  continue;
                }
                const ps: { start?: string; n?: number | null }[] = Array.isArray(st.purchases) ? st.purchases : [];
                const inc: { start?: string; n?: number | null }[] = Array.isArray(st.incomes) ? st.incomes : [];
                const on = (p: { start?: string; n?: number | null }) => { const i = ym - toN(p.start || ""); return i >= 0 && (p.n == null || i < p.n); };
                const total = ps.length + inc.length + (st.bills?.length || 0) + (st.received?.length || 0);
                stats[r.id] = { total, ativos: ps.filter(on).length + inc.filter(on).length, updated_at: r.updated_at };
              } catch { /* ignore */ }
            }
            const key = (id: string) => (id === adminId ? (stats[id] ? id : "main") : id);
            return json({ users: data.users.map((u) => ({ id: u.id, name: names[u.id] || names[key(u.id)] || "", stats: stats[u.id] || stats[key(u.id)] || null, expires_at: (u.app_metadata as { expires_at?: string } | undefined)?.expires_at || null, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, suspended: Boolean((u as { banned_until?: string }).banned_until && new Date(String((u as { banned_until?: string }).banned_until)).getTime() > Date.now()), admin: u.id === adminId, access_level: u.id === adminId ? 5 : levelByUser.get(u.id) ?? (accessLevelError ? 5 : 1), ai_enabled: aiPermissions.get(u.id) ?? true, ai_used: aiUsage.get(u.id) ?? 0, ai_limit: u.id === adminId ? null : 4, access_levels_ready: !accessLevelError })) });
          }
          case 'access-policies': {
            const { data, error } = await supabaseAdmin.from('feature_access_levels').select('level, features').order('level');
            if (error) return json({ error: 'Não foi possível carregar a matriz de permissões.' }, 503);
            return json({ policies: data || [] });
          }
          case 'save-access-policies': {
            const policies = body.policies || [];
            if (policies.length !== 5 || new Set(policies.map(policy => policy.level)).size !== 5) return json({ error: 'Envie uma configuração para cada nível de 1 a 5.' }, 400);
            const featuresByLevel = new Map<number, Set<string>>();
            for (const policy of policies) {
              if (!Number.isInteger(policy.level) || policy.level < 1 || policy.level > 5 || !Array.isArray(policy.features)) return json({ error: 'A configuração de nível é inválida.' }, 400);
              if (policy.features.some(feature => !ACCESS_FEATURE_IDS.includes(feature))) return json({ error: 'A matriz contém uma funcionalidade desconhecida.' }, 400);
              featuresByLevel.set(policy.level, new Set(policy.features));
            }
            if (ACCESS_FEATURE_IDS.some(feature => !featuresByLevel.get(5)?.has(feature))) return json({ error: 'O nível 5 deve manter acesso completo.' }, 400);
            for (let level = 2; level <= 5; level++) {
              for (const feature of featuresByLevel.get(level - 1) || []) {
                if (!featuresByLevel.get(level)?.has(feature)) return json({ error: 'Os níveis superiores precisam preservar os acessos dos níveis inferiores.' }, 400);
              }
            }
            const rows = policies.map(policy => ({ level: policy.level, features: [...new Set(policy.features)].sort(), updated_at: new Date().toISOString() }));
            const { error } = await supabaseAdmin.from('feature_access_levels').upsert(rows);
            if (error) return json({ error: 'Não foi possível salvar a matriz de permissões.' }, 500);
            return json({ ok: true });
          }
          case 'access-level': {
            const level = Number(body.access_level);
            if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(level) || level < 1 || level > 5 || id === adminId) return json({ error: 'Usuário ou nível inválido.' }, 400);
            const { data: target, error: lookupError } = await a.getUserById(id);
            if (lookupError || !target.user) return json({ error: 'Acesso não encontrado.' }, 404);
            const { error } = await supabaseAdmin.from('user_access_levels').upsert({ user_id: id, level, updated_at: new Date().toISOString() });
            if (error) return json({ error: 'Não foi possível atribuir o nível.' }, 500);
            return json({ ok: true, level });
          }
          case 'ai-permission': {
            if (!/^[0-9a-f-]{36}$/i.test(id) || typeof body.enabled !== 'boolean' || id === adminId) return json({ error: 'Acesso ou permissão inválida.' }, 400);
            const { data: target, error: lookupError } = await a.getUserById(id);
            if (lookupError || !target.user) return json({ error: 'Acesso não encontrado.' }, 404);
            const { error } = await supabaseAdmin.from('ai_account_access').upsert({ user_id: id, enabled: body.enabled });
            if (error) return json({ error: 'Não foi possível alterar a permissão.' }, 500);
            return json({ ok: true });
          }
          case "create": {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return json({ error: "E-mail inválido." }, 400);
            if (password.length < 6 || password.length > 72) return json({ error: "A senha precisa ter de 6 a 72 caracteres." }, 400);
            const { data, error } = await a.createUser({ email, password, email_confirm: true });
            if (error) return json({ error: /already/i.test(error.message) ? "Esse e-mail já tem acesso." : error.message }, 400);
            if (data.user?.id) {
              const requestedLevel = Number(body.access_level ?? 1);
              const level = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 5 ? requestedLevel : 1;
              const [{ error: stateError }, { error: levelError }] = await Promise.all([
                writeState(data.user.id, blank(name)),
                supabaseAdmin.from('user_access_levels').upsert({ user_id: data.user.id, level, updated_at: new Date().toISOString() }),
              ]);
              if (stateError || levelError) {
                await a.deleteUser(data.user.id);
                await supabaseAdmin.from('app_state').delete().eq('id', data.user.id);
                return json({ error: 'A conta foi criada, mas não foi possível preparar o acesso. Tente novamente.' }, 500);
              }
            }
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
            const current = st.patrimonioApp || st;
            if (current.settings) {
              const previous = current.settings.ownerName;
              current.settings.ownerName = name;
              current.people = (current.people || []).map((person: string) => person === previous ? name : person);
              current.peopleInBill = (current.peopleInBill || []).map((person: string) => person === previous ? name : person);
              for (const item of current.items || []) if (item.person === previous) item.person = name;
            }
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
              const unitMs = units[body.unit || ''];
              if (unitMs) d.setTime(d.getTime() + n * unitMs);
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
