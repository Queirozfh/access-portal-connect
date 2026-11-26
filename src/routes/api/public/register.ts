import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { publicSession, refreshCookie, rejectCrossSiteRequest } from "@/lib/session-cookie.server";

const json = (body: unknown, status = 200, extraHeaders?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "Cache-Control": "no-store", ...Object.fromEntries(new Headers(extraHeaders)) } });
async function authAttemptKey(ip: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}
function signupErrorMessage(error: { code?: string; message?: string; status?: number }): string {
  const code = String(error.code || "").toLowerCase(),
    message = String(error.message || "").toLowerCase();
  if (code === "signup_disabled" || /signups? (are )?disabled|signups? not allowed/.test(message))
    return "O cadastro público está desativado nas configurações de autenticação do projeto.";
  if (code === "email_address_not_authorized" || /email address not authorized/.test(message))
    return "O serviço de e-mail atual não está autorizado a enviar para este endereço. Configure um servidor SMTP próprio no Supabase.";
  if (code === "over_email_send_rate_limit" || /email rate limit exceeded/.test(message))
    return "O limite de envio de e-mails foi atingido. Aguarde antes de tentar novamente ou configure um SMTP próprio.";
  if (code === "weak_password" || /password.*(weak|characters|strength)/.test(message))
    return "A senha deve ter pelo menos 8 caracteres, incluindo letras e números.";
  if (code === "user_already_exists" || /user already registered|already been registered/.test(message))
    return "Não foi possível usar este e-mail. Se você já tem uma conta, escolha “Já tenho uma conta · Entrar”.";
  if (error.status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (/sending.*(confirmation|email)|smtp|email.*provider/.test(message))
    return "O serviço de confirmação por e-mail falhou. Revise o SMTP nas configurações de autenticação do Supabase.";
  return "Não foi possível concluir o cadastro. Verifique o e-mail e os requisitos da senha.";
}
function validEmail(email: string) {
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validSignupPassword(password: string) {
  return password.length >= 8 && password.length <= 72 && /\p{L}/u.test(password) && /\p{N}/u.test(password);
}

export const Route = createFileRoute("/api/public/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (rejectCrossSiteRequest(request)) return json({ error: "Origem inválida." }, 403);
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        let body: { action?: unknown; email?: unknown; password?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Dados inválidos." }, 400);
        }
        const isLogin = body.action === "login",
          email = String(body.email || "")
            .trim()
            .toLowerCase(),
          password = String(body.password || "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const attemptKey = await authAttemptKey(ip);
        const action = isLogin ? "login" : "signup";
        const { data: attemptAllowed, error: attemptError } = await supabaseAdmin.rpc("consume_auth_attempt", {
          p_key: attemptKey, p_action: action, p_limit: 5, p_window_seconds: 900,
        });
        if (attemptError) return json({ error: "O controle de acesso está temporariamente indisponível." }, 503);
        if (attemptAllowed !== true)
          return json(
            { error: isLogin
                ? "Muitas tentativas de login. Aguarde 15 minutos e tente novamente."
                : "Muitas tentativas de cadastro. Aguarde 15 minutos e tente novamente." },
            429,
          );
        if (!validEmail(email)) return json({ error: "Informe um e-mail válido." }, 400);
        if (isLogin) {
          if (!password || password.length > 72) return json({ error: "Informe seu e-mail e senha." }, 400);
        } else if (!validSignupPassword(password))
          return json(
            { error: "A senha deve ter entre 8 e 72 caracteres, incluindo pelo menos uma letra e um número." },
            400,
          );
        const url = process.env["SUPABASE_URL"],
          key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key)
          return json(
            {
              error: isLogin
                ? "O login está temporariamente indisponível."
                : "O cadastro está temporariamente indisponível.",
            },
            503,
          );
        const authClient = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        if (isLogin) {
          const { data, error } = await authClient.auth.signInWithPassword({ email, password });
          if (error) {
            console.error("[login] Supabase sign-in failed", {
              code: error.code || "unknown",
              status: error.status || 0,
            });
            return json(
              {
                error:
                  error.status === 429
                    ? "Muitas tentativas. Aguarde antes de tentar novamente."
                    : "E-mail ou senha incorretos.",
              },
              error.status === 429 ? 429 : 401,
            );
          }
          if (!data.session)
            return json({ error: "Não foi possível iniciar a sessão. Confirme seu e-mail e tente novamente." }, 401);
          await supabaseAdmin.rpc('reset_auth_attempts', { p_key: attemptKey, p_action: 'login' });
          return json({ ok: true, session: publicSession(data.session) }, 200, { "Set-Cookie": refreshCookie(data.session.refresh_token) });
        }
        const { data, error } = await authClient.auth.signUp({ email, password });
        if (error) {
          console.error("[register] Supabase signup failed", {
            code: error.code || "unknown",
            status: error.status || 0,
          });
          return json({ error: signupErrorMessage(error) }, error.status === 429 ? 429 : 400);
        }
        const user = data.user;
        if (!user) return json({ error: "Não foi possível concluir o cadastro. Tente novamente." }, 400);
        await supabaseAdmin.rpc("reset_auth_attempts", { p_key: attemptKey, p_action: "signup" });
        if (Array.isArray(user.identities) && user.identities.length === 0)
          return json({ ok: true, confirmationRequired: true });
        try {
          const { data: fresh, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(user.id);
          if (lookupError || !fresh.user) throw new Error("Cadastro indisponível.");
          const metadata = (fresh.user.app_metadata || {}) as Record<string, unknown>;
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          const [{ error: levelError }, { error: stateError }] = await Promise.all([
            supabaseAdmin.auth.admin.updateUserById(user.id, {
              app_metadata: { ...metadata, access_level: 1, expires_at: expiresAt },
            }),
            supabaseAdmin.from("app_state").upsert({
              id: user.id,
              json: JSON.stringify({
                v: 1,
                titular: "Eu",
                people: [],
                incomes: [],
                bills: [],
                purchases: [],
                received: [],
                hidden: [],
              }),
              updated_at: new Date().toISOString(),
            }),
          ]);
          if (levelError || stateError) throw new Error("Cadastro indisponível.");
        } catch {
          await supabaseAdmin.auth.admin.deleteUser(user.id).catch(() => {});
          await supabaseAdmin.from("app_state").delete().eq("id", user.id);
          return json({ error: "Não foi possível preparar a conta. Tente novamente mais tarde." }, 503);
        }
        return json({ ok: true, confirmationRequired: !data.session, session: data.session ? publicSession(data.session) : null }, 200, data.session ? { "Set-Cookie": refreshCookie(data.session.refresh_token) } : undefined);
      },
    },
  },
});
