import { createFileRoute } from "@tanstack/react-router";
import { portalAuth } from "@/lib/portal-auth.server";
import { ACCESS_FEATURES, ACCESS_FEATURE_GROUPS, configuredAccessFeatures } from "@/lib/access-control";
import { rejectCrossSiteRequest } from "@/lib/session-cookie.server";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  duration_days: number;
  access_level: number;
  is_free: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function planSlug(name: string) {
  return `${name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "plano"}-${crypto.randomUUID().slice(0, 8)}`;
}

function planWriteErrorMessage(error: { code?: string } | null, action: "criar" | "atualizar") {
  const code = error?.code || "desconhecido";
  console.error(`[subscriptions] Could not ${action} plan`, { code });
  if (code === "23505") return "Já existe um plano com estes dados. Atualize o nome e tente novamente.";
  if (code === "42501") return "O servidor não tem permissão para salvar planos. Verifique a configuração administrativa do banco.";
  if (code === "42P01" || code === "PGRST205") return "A tabela de planos não está disponível no banco. A migração de planos precisa ser aplicada.";
  return `Não foi possível ${action} o plano (código ${code}). Tente novamente; se persistir, informe este código ao administrador.`;
}

async function withFeatures(plan: PlanRow) {
  const enabled = new Set(await configuredAccessFeatures(plan.access_level));
  const category = new Map<string, string>();
  for (const group of ACCESS_FEATURE_GROUPS) {
    for (const feature of group.features) category.set(feature.id, group.label);
  }
  return {
    ...plan,
    features: ACCESS_FEATURES.filter((feature) => enabled.has(feature.id)).map((feature) => ({
      id: feature.id,
      label: feature.label,
      category: category.get(feature.id) || "Recursos",
    })),
  };
}

export const Route = createFileRoute("/api/public/subscriptions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await portalAuth(request, { allowExpired: true });
          if (!auth) return json({ error: "Entre novamente para consultar os planos." }, 403);
          const { data: isAdmin, error: roleError } = await auth.client.rpc("has_role", {
            _user_id: auth.userId,
            _role: "admin",
          });
          if (roleError) return json({ error: "Não foi possível confirmar o perfil da conta." }, 503);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let plansQuery = supabaseAdmin.from("subscription_plans").select("*").order("price_cents");
          if (!isAdmin) plansQuery = plansQuery.eq("is_active", true);
          const [{ data: plans, error: plansError }, { data: subscription, error: subscriptionError }] =
            await Promise.all([
              plansQuery,
              supabaseAdmin.from("user_subscriptions").select("*").eq("user_id", auth.userId).maybeSingle(),
            ]);
          if (plansError || subscriptionError) {
            console.error("[subscriptions] Could not load subscription catalog", {
              plans: plansError?.code || null,
              subscription: subscriptionError?.code || null,
            });
            return json({ error: "A configuração dos planos ainda não está disponível." }, 503);
          }
          const planRows = (plans || []) as PlanRow[];
          const currentIds = [subscription?.plan_id, subscription?.pending_plan_id].filter(
            (id): id is string => typeof id === "string",
          );
          let related: PlanRow[] = [];
          if (currentIds.length) {
            const { data, error } = await supabaseAdmin.from("subscription_plans").select("*").in("id", currentIds);
            if (error) return json({ error: "Não foi possível consultar o plano atual." }, 503);
            related = (data || []) as PlanRow[];
          }
          const allRows = new Map([...planRows, ...related].map((plan) => [plan.id, plan]));
          const metadata = (auth.user.app_metadata || {}) as Record<string, unknown>;
          const legacyExpiry = typeof metadata.expires_at === "string" ? metadata.expires_at : null;
          const fallbackLevel = Math.max(1, Math.min(5, Number(metadata.access_level) || 1));
          const expiresAt = subscription?.expires_at || legacyExpiry;
          const status = subscription
            ? expiresAt && new Date(expiresAt).getTime() <= Date.now()
              ? "expired"
              : subscription.status
            : expiresAt
              ? new Date(expiresAt).getTime() <= Date.now()
                ? "expired"
                : "trialing"
              : "active";
          const currentPlanRow = subscription?.plan_id ? allRows.get(subscription.plan_id) : null;
          const pendingPlanRow = subscription?.pending_plan_id ? allRows.get(subscription.pending_plan_id) : null;
          const [decoratedPlans, currentPlan, pendingPlan] = await Promise.all([
            Promise.all(planRows.map(withFeatures)),
            currentPlanRow ? withFeatures(currentPlanRow) : null,
            pendingPlanRow ? withFeatures(pendingPlanRow) : null,
          ]);
          return json({
            plans: decoratedPlans,
            subscription: {
              status: isAdmin ? "admin" : status,
              currentPlan,
              pendingPlan,
              pendingRequestedAt: subscription?.pending_requested_at || null,
              expiresAt,
              currentAccessLevel: isAdmin
                ? 5
                : subscription?.access_level_override || currentPlan?.access_level || fallbackLevel,
              legacy: !subscription,
            },
            admin: Boolean(isAdmin),
            expired: Boolean(auth.expired),
          });
        } catch (error) {
          console.error("[subscriptions] Catalog request failed", error);
          return json({ error: "Não foi possível carregar os planos agora." }, 503);
        }
      },
      POST: async ({ request }) => {
        if (rejectCrossSiteRequest(request)) return json({ error: "Origem inválida." }, 403);
        try {
          const auth = await portalAuth(request, { allowExpired: true });
          if (!auth) return json({ error: "Entre novamente para continuar." }, 403);
          let body: Record<string, unknown>;
          try {
            body = await request.json();
          } catch {
            return json({ error: "Pedido inválido." }, 400);
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: isAdmin, error: roleError } = await auth.client.rpc("has_role", {
            _user_id: auth.userId,
            _role: "admin",
          });
          if (roleError) return json({ error: "Não foi possível confirmar o perfil da conta." }, 503);

          if (body.action === "request-plan") {
            const planId = String(body.plan_id || "");
            if (!/^[0-9a-f-]{36}$/i.test(planId)) return json({ error: "Selecione um plano válido." }, 400);
            const { data: plan, error: planError } = await supabaseAdmin
              .from("subscription_plans")
              .select("id, is_free, is_active")
              .eq("id", planId)
              .maybeSingle();
            if (planError || !plan) return json({ error: "Esse plano não está disponível." }, 404);
            if (!plan.is_active || plan.is_free) return json({ error: "Selecione um plano pago ativo." }, 400);
            const { data: current, error: currentError } = await supabaseAdmin
              .from("user_subscriptions")
              .select("user_id, plan_id, status, expires_at")
              .eq("user_id", auth.userId)
              .maybeSingle();
            if (currentError) return json({ error: "Não foi possível consultar sua assinatura." }, 503);
            if (
              current?.plan_id === planId &&
              ["active", "trialing"].includes(current.status) &&
              (!current.expires_at || new Date(current.expires_at).getTime() > Date.now())
            )
              return json({ error: "Sua conta já está neste plano." }, 409);
            const now = new Date().toISOString();
            let writeError: string | null = null;
            if (current) {
              const { error } = await supabaseAdmin
                .from("user_subscriptions")
                .update({ pending_plan_id: planId, pending_requested_at: now, updated_at: now })
                .eq("user_id", auth.userId);
              writeError = error?.message || null;
            } else {
              const { error } = await supabaseAdmin.from("user_subscriptions").insert({
                  user_id: auth.userId,
                  plan_id: null,
                  status: "expired",
                  pending_plan_id: planId,
                  pending_requested_at: now,
                  updated_at: now,
                });
              writeError = error?.message || null;
            }
            if (writeError) return json({ error: "Não foi possível registrar a solicitação do plano." }, 500);
            return json({ ok: true, status: "pending_payment" });
          }

          if (!isAdmin) return json({ error: "Acesso negado." }, 403);
          if (body.action === "rename-legacy-duplicate-plans") {
            const renamedPlans = [
              ["Cópia de Free", "Essencial"],
              ["Cópia de Cópia de Free", "Intermediário"],
              ["Cópia de Cópia de Cópia de Free", "Avançado"],
              ["Cópia de Cópia de Cópia de Cópia de Free", "Completo e PJ"],
            ];
            let renamed = 0;
            const now = new Date().toISOString();
            for (const [oldName, newName] of renamedPlans) {
              const { data, error } = await supabaseAdmin
                .from("subscription_plans")
                .update({ name: newName, slug: planSlug(newName), updated_at: now })
                .eq("name", oldName)
                .select("id");
              if (error) {
                console.error("[subscriptions] Could not rename legacy duplicated plan", { code: error.code || "unknown" });
                return json({ error: "Não foi possível atualizar os nomes dos planos. Tente novamente." }, 500);
              }
              renamed += data?.length || 0;
            }
            return json({ ok: true, renamed });
          }
          if (body.action === "save-plan") {
            const id = String(body.id || "");
            const name = String(body.name || "").trim();
            const description = String(body.description || "").trim();
            const priceCents = Number(body.price_cents);
            const durationDays = Number(body.duration_days);
            const accessLevel = Number(body.access_level);
            const isActive = body.is_active !== false;
            if (
              name.length < 1 || name.length > 80 || description.length > 500 ||
              !Number.isInteger(priceCents) || priceCents < 1 || priceCents > 99999999 ||
              !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650 ||
              !Number.isInteger(accessLevel) || accessLevel < 1 || accessLevel > 5
            )
              return json({ error: "Revise nome, preço, prazo e nível do plano." }, 400);
            const now = new Date().toISOString();
            if (id) {
              if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Plano inválido." }, 400);
              const { data: existing, error: existingError } = await supabaseAdmin
                .from("subscription_plans")
                .select("id, slug, is_free")
                .eq("id", id)
                .maybeSingle();
              if (existingError || !existing) return json({ error: "Plano não encontrado." }, 404);
              const { error } = await supabaseAdmin
                .from("subscription_plans")
                .update({
                  name,
                  description,
                  price_cents: existing.is_free ? 0 : priceCents,
                  duration_days: durationDays,
                  access_level: accessLevel,
                  is_active: existing.is_free ? true : isActive,
                  updated_at: now,
                })
                .eq("id", id);
              if (error) return json({ error: planWriteErrorMessage(error, "atualizar") }, 500);
              return json({ ok: true });
            }
            const { data: created, error } = await supabaseAdmin.from("subscription_plans").insert({
              slug: planSlug(name),
              name,
              description,
              price_cents: priceCents,
              duration_days: durationDays,
              access_level: accessLevel,
              is_active: isActive,
            }).select("id").single();
            if (error) return json({ error: planWriteErrorMessage(error, "criar") }, 500);
            return json({ ok: true, id: created.id });
          }
          if (body.action === "archive-plan") {
            const id = String(body.id || "");
            if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Plano inválido." }, 400);
            const { data: plan, error: planError } = await supabaseAdmin
              .from("subscription_plans")
              .select("id, is_free, is_active")
              .eq("id", id)
              .maybeSingle();
            if (planError || !plan) return json({ error: "Plano não encontrado." }, 404);
            if (plan.is_free) return json({ error: "O plano Free é necessário para novos cadastros." }, 400);
            const { error } = await supabaseAdmin
              .from("subscription_plans")
              .update({ is_active: !plan.is_active, updated_at: new Date().toISOString() })
              .eq("id", id);
            if (error) return json({ error: "Não foi possível atualizar a disponibilidade do plano." }, 500);
            return json({ ok: true });
          }
          return json({ error: "Ação desconhecida." }, 400);
        } catch (error) {
          console.error("[subscriptions] Plan operation failed", error);
          return json({ error: "Não foi possível concluir a operação agora." }, 503);
        }
      },
    },
  },
});
