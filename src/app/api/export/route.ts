import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const db = await serverClient();
    const b = url.searchParams.get('business');
    const { data: workspace, error } = await db.rpc('workspace', {
      p_business: b,
    });
    if (error || !workspace.permissions.includes('export'))
      return NextResponse.json({ error: 'No tienes permiso para exportar.' }, { status: 403 });
    const { data, error: readError } = await db.rpc('read_data', {
      p_business: b,
      p_entity: 'products',
      p_page: Number(url.searchParams.get('page') || 0),
    });
    if (readError) return NextResponse.json({ error: 'No se pudo exportar.' }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar.' }, { status: 503 });
  }
}
