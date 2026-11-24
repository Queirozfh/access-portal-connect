import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';

export const Route = createFileRoute('/api/public/google-calendar-config')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!await portalAuth(request)) {
          return Response.json({ error: 'Entre novamente para configurar o Google Agenda.' }, { status: 401 });
        }
        const clientId = process.env['GOOGLE_CALENDAR_CLIENT_ID'];
        if (!clientId) {
          return Response.json({ error: 'O administrador precisa configurar GOOGLE_CALENDAR_CLIENT_ID no servidor.' }, { status: 503 });
        }
        return Response.json({ clientId }, { headers: { 'Cache-Control': 'no-store' } });
      },
    },
  },
});
