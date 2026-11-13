import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';
import { z } from 'zod';

export const Route = createFileRoute('/api/public/dollar-rate')({
  server: { handlers: { GET: async ({ request }) => {
    if (!await portalAuth(request)) return Response.json({ error: 'Entre novamente para consultar a cotação.' }, { status: 403 });
    try {
      const response = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL', { signal: request.signal });
      if (!response.ok) return Response.json({ error: 'A fonte de cotação está indisponível. Informe uma cotação manual.' }, { status: response.status });
      const value = z.object({ date: z.string(), rates: z.object({ BRL: z.number().positive() }) }).parse(await response.json());
      return Response.json({ rate: value.rates.BRL, date: value.date, source: 'Frankfurter / bancos centrais', fetchedAt: new Date().toISOString() });
    } catch { return Response.json({ error: 'Não foi possível atualizar a cotação. A última cotação foi mantida.' }, { status: 502 }); }
  } } },
});