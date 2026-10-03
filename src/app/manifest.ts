import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ferro · Gestión de ferretería',
    short_name: 'Ferro',
    description: 'La operación de tu ferretería.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f6f5',
    theme_color: '#155b52',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
