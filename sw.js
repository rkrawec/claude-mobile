/* Tombstone service worker.
 *
 * The first version of this site lived at the root and registered a service
 * worker here, with a scope covering everything under /claude-mobile/. That
 * worker cached the old task app and would keep serving it at the root URL,
 * shadowing the launcher. Phones already carrying it fetch this file on their
 * next visit, install this version instead, and it erases itself.
 *
 * Deletes only the one old cache by exact name — caches are shared across the
 * whole origin, so a prefix match would take out the live apps' caches too.
 */

const OLD_CACHE = 'tasks-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await caches.delete(OLD_CACHE);
    await self.registration.unregister();

    // Reload any open windows so they drop this worker and fetch the live site.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.navigate(client.url).catch(() => {});
    }
  })());
});
