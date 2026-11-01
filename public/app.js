// Lógica del cliente: registrar SW, pedir permiso, suscribirse y enviar pruebas.
const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  $('log').prepend(li);
};

// La clave VAPID llega en base64url; PushManager necesita un Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function getRegistration() {
  return navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
}

async function refreshState() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  $('state').textContent = sub ? 'Suscrito ✅' : 'No suscrito';
  $('subscribe').disabled = !!sub;
  $('unsubscribe').disabled = !sub;
  $('send').disabled = !sub;
  $('perm').textContent = Notification.permission;
}

async function subscribe() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    log('Permiso denegado. Actívalo en la configuración del navegador.');
    return refreshState();
  }
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await (await fetch('/api/vapid-public-key')).json();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true, // obligatorio: toda push debe mostrar una notificación
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
  log('Suscripción creada y enviada al servidor.');
  refreshState();
}

async function unsubscribe() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
    log('Suscripción cancelada.');
  }
  refreshState();
}

async function sendTest() {
  const res = await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: $('title').value || 'Hola 👋',
      body: $('body').value || 'Notificación de prueba',
      url: '/',
    }),
  });
  const data = await res.json();
  log(`Servidor envió ${data.sent} de ${data.total} notificación(es).`);
}

async function init() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    $('state').textContent = 'Este navegador no soporta Push API';
    document.querySelectorAll('button').forEach((b) => (b.disabled = true));
    return;
  }
  await getRegistration();
  $('subscribe').addEventListener('click', subscribe);
  $('unsubscribe').addEventListener('click', unsubscribe);
  $('send').addEventListener('click', sendTest);
  refreshState();
}

init().catch((e) => log('Error: ' + e.message));
