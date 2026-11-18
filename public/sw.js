// Service worker: recibe los avisos push, abre la oferta al pulsarlos y atiende los botones Guardar / Descartar.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const actions = data.matchId
    ? [
        { action: "save", title: "Guardar" },
        { action: "dismiss", title: "Descartar" },
      ]
    : [];
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/", matchId: data.matchId },
      actions,
    }),
  );
});

function openUrl(url) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) {
      if ("focus" in w) {
        w.navigate(url);
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url = "/", matchId } = event.notification.data || {};
  const status = { save: "saved", dismiss: "dismissed" }[event.action];
  if (matchId && status) {
    // Se decide sin abrir la app; si falla (sin conexión, sesión...), se abre la oferta para hacerlo a mano.
    event.waitUntil(
      fetch(`/api/matches/${matchId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      })
        .then((r) => (r.ok ? undefined : openUrl(url)))
        .catch(() => openUrl(url)),
    );
    return;
  }
  event.waitUntil(openUrl(url));
});
