// Servidor de ejemplo: guarda suscripciones y envía notificaciones push con web-push.
const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

const PORT = process.env.PORT || 3000;
const VAPID_FILE = path.join(__dirname, 'vapid.json');
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

// ---------- 1. Claves VAPID (se generan una sola vez y se reutilizan) ----------
let vapid;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapid = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  };
} else if (fs.existsSync(VAPID_FILE)) {
  vapid = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
} else {
  vapid = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid, null, 2));
  console.log('Claves VAPID generadas y guardadas en vapid.json');
}

// "subject" identifica al emisor ante el servicio push (mailto: o https:)
webpush.setVapidDetails('mailto:admin@example.com', vapid.publicKey, vapid.privateKey);

// ---------- 2. Almacenamiento simple de suscripciones (archivo JSON) ----------
const loadSubs = () =>
  fs.existsSync(SUBS_FILE) ? JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')) : [];
const saveSubs = (subs) => fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));

// ---------- 3. API ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// La clave pública la necesita el navegador para suscribirse
app.get('/api/vapid-public-key', (_req, res) => res.json({ publicKey: vapid.publicKey }));

// Guarda la suscripción que genera el navegador
app.post('/api/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint || !sub.keys) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }
  const subs = loadSubs().filter((s) => s.endpoint !== sub.endpoint);
  subs.push(sub);
  saveSubs(subs);
  res.status(201).json({ ok: true, total: subs.length });
});

// Elimina una suscripción
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  saveSubs(loadSubs().filter((s) => s.endpoint !== endpoint));
  res.json({ ok: true });
});

// Envía una notificación a todos los suscriptores
app.post('/api/send', async (req, res) => {
  const { title = 'Hola desde el servidor', body = 'Esta es una notificación push', url = '/' } =
    req.body || {};
  const payload = JSON.stringify({ title, body, url });

  const subs = loadSubs();
  let sent = 0;
  const alive = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 60 });
        sent++;
        alive.push(sub);
      } catch (err) {
        // 404/410: la suscripción expiró o el usuario la revocó -> se elimina
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log('Suscripción expirada, eliminada:', sub.endpoint.slice(0, 50) + '…');
        } else {
          console.error('Error enviando push:', err.statusCode, err.body || err.message);
          alive.push(sub);
        }
      }
    })
  );

  saveSubs(alive);
  res.json({ sent, total: subs.length });
});

app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
});
