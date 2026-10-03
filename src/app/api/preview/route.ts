import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { documentSchema } from '@/lib/validation';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = documentSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Revisa cantidades, precios y descuentos.' },
        { status: 400 },
      );
    const db = await serverClient();
    const { data, error } = await db.rpc('preview', {
      p_business: body.business_id,
      p_data: parsed.data,
    });
    if (error)
      return NextResponse.json(
        {
          error: error.message.startsWith('APP:')
            ? error.message.slice(4)
            : 'No se pudo validar el total.',
        },
        { status: 400 },
      );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'No se pudo validar el total. Revisa la conexión.' },
      { status: 503 },
    );
  }
}
