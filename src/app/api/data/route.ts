import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const db = await serverClient();
    const { data: identity } = await db.auth.getUser();
    if (!identity.user)
      return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 });
    const business = url.searchParams.get('business');
    const entity = url.searchParams.get('entity');
    if (!business || !entity)
      return NextResponse.json({ error: 'Selecciona el negocio.' }, { status: 400 });
    let result;
    if (entity === 'report') {
      result = await db.rpc('report', {
        p_business: business,
        p_from: url.searchParams.get('from'),
        p_to: url.searchParams.get('to'),
        p_branch: url.searchParams.get('branch_id') || null,
        p_user: url.searchParams.get('user_id') || null,
      });
    } else {
      const filters: Record<string, string> = {};
      for (const name of [
        'branch_id',
        'warehouse_id',
        'id',
        'kind',
        'from',
        'to',
        'party_id',
        'state',
        'pending',
        'document_id',
        'sort',
        'user_id',
      ]) {
        const value = url.searchParams.get(name);
        if (value) filters[name] = value;
      }
      result = await db.rpc('read_data', {
        p_business: business,
        p_entity: entity,
        p_term: url.searchParams.get('q') || '',
        p_page: Number(url.searchParams.get('page') || 0),
        p_filters: filters,
      });
    }
    if (result.error)
      return NextResponse.json(
        {
          error: result.error.message.startsWith('APP:')
            ? result.error.message.slice(4)
            : 'No se pudo cargar la información.',
        },
        { status: 400 },
      );
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar. Vuelve a intentar.' }, { status: 503 });
  }
}
