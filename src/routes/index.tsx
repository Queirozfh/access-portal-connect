import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Meu Patrimônio — Finanças pessoais" },
    { name: "description", content: "Controle receitas, compras, parcelas, reembolsos e patrimônio com acesso protegido por perfil." },
    { property: "og:title", content: "Meu Patrimônio — Finanças pessoais" },
    { property: "og:description", content: "Acompanhe suas finanças e saldos com dados separados para cada acesso." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ href: "/meu-patrimonio/index.html" });
  },
});
