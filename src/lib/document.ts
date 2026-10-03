import 'server-only';
import { serverClient } from './supabase/server';
import type { Row } from './types';
export async function loadDocument(business: string, id: string) {
  const db = await serverClient();
  const { data: identity } = await db.auth.getUser();
  if (!identity.user) throw new Error('Acceso no autorizado.');
  const { data: result, error } = await db.rpc('read_data', {
    p_business: business,
    p_entity: 'documents',
    p_filters: { id },
  });
  if (error || !result.rows?.[0]) throw new Error('Documento no disponible.');
  const document = result.rows[0] as Row;
  if (document.kind === 'purchase' && document.total === undefined)
    throw new Error('No tienes permiso para ver costos.');
  const lines: Row[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db.rpc('read_data', {
      p_business: business,
      p_entity: 'document_lines',
      p_page: page,
      p_filters: { id },
    });
    if (error) throw new Error('No se pudo cargar el detalle.');
    lines.push(...data.rows);
    if (lines.length >= data.count) break;
  }
  const { data: workspace } = await db.rpc('workspace', {
    p_business: business,
  });
  const { data: balance } = await db.rpc('read_data', {
    p_business: business,
    p_entity: 'balances',
    p_filters: { id },
  });
  const { data: party } = document.party_id
    ? await db.rpc('read_data', {
        p_business: business,
        p_entity: 'parties',
        p_filters: { id: document.party_id },
      })
    : { data: null };
  return {
    document,
    lines,
    business: workspace.settings as Row,
    balance: balance?.rows?.[0] as Row | undefined,
    party: party?.rows?.[0] as Row | undefined,
  };
}
