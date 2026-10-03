// Solo permite instalación. No intercepta solicitudes ni almacena datos privados.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
