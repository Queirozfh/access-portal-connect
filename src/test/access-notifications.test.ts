import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const html = readFileSync('public/contas-do-mes.html', 'utf8');
const start = html.indexOf('function accessDeadline(');
const end = html.indexOf('function accessNotices(');
const functions = html.slice(start, end);
const now = Date.parse('2026-11-13T12:00:00Z');
function deadline(hours: number) {
  return runInNewContext(functions + `\naccessDeadline('${new Date(now + hours * 3600000).toISOString()}', ${now})`);
}

describe('Notificações de prazo do acesso', () => {
  it('avisa antes do vencimento, a partir dos últimos sete dias', () => {
    expect(deadline(168).level).toBe('week');
    expect(deadline(169).level).toBeNull();
  });
  it('aumenta a urgência nas últimas 24 horas e na última hora', () => {
    expect(deadline(24).level).toBe('day');
    expect(deadline(1).level).toBe('hour');
    expect(deadline(0.5).expired).toBe(false);
  });
  it('considera suspenso exatamente ao terminar o prazo', () => {
    expect(deadline(0).expired).toBe(true);
    expect(deadline(-1).remaining).toBe(0);
  });
  it('não cria aviso para acesso sem prazo', () => {
    expect(runInNewContext(functions + '\naccessDeadline(null)').limited).toBe(false);
  });
  it('notifica o administrador apenas de contas ativas próximas do vencimento', () => {
    const users = [
      {id:'soon', expires_at:new Date(now + 3600000).toISOString()},
      {id:'expired', expires_at:new Date(now - 1).toISOString()},
      {id:'admin', admin:true, expires_at:new Date(now + 3600000).toISOString()},
      {id:'banned', suspended:true, expires_at:new Date(now + 3600000).toISOString()},
      {id:'permanent', expires_at:null},
    ];
    expect(runInNewContext(functions + `\naccessWarnings(${JSON.stringify(users)}, ${now}).map(u => u.id)`)).toEqual(['soon']);
  });
  it('mantém dias, horas e minutos na contagem do prazo restante', () => {
    expect(runInNewContext(functions + '\naccessRemaining((1440 + 120 + 3) * 60000)')).toBe('1 dia e 2 horas e 3 minutos');
  });
});