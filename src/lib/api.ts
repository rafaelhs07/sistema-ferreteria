export class ApiError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    cache: 'no-store',
  });
  const payload = await res.json();
  if (!res.ok)
    throw new ApiError(
      payload.error || 'No se pudo completar. Vuelve a intentar.',
      payload.fields || {},
    );
  return payload as T;
}
export function command<T>(
  business: string,
  action: string,
  data: Record<string, unknown>,
  requestId = crypto.randomUUID(),
) {
  return api<T>('/api/command', {
    method: 'POST',
    body: JSON.stringify({
      business_id: business,
      request_id: requestId,
      action,
      data,
    }),
  });
}
