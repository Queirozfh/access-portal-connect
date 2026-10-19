import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Contas do mês — Finanças de Gio" },
    { name: "description", content: "Controle mensal de faturas, compras, parcelas e recebimentos de Gio." },
    { property: "og:title", content: "Contas do mês — Finanças de Gio" },
    { property: "og:description", content: "Acompanhe faturas, compras e quitação dos meses no controle financeiro de Gio." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ href: "/contas-do-mes.html" });
  },
});
