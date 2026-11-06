import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Passkey } from '@passkey-kit/core';
import { passkeyRouter } from '@passkey-kit/express';
// Memory stores are for this demo only. Use @passkey-kit/postgres (or mysql/mongodb) in production.
import { MemoryChallengeStore, MemoryCredentialStore } from '@passkey-kit/memory';

const PORT = Number(process.env.PORT ?? 3000);
// Directory containing a package's ESM entry file.
const entryDir = (name) => dirname(fileURLToPath(import.meta.resolve(name)));

const passkey = new Passkey({
  rpName: 'passkey-kit demo',
  rpID: 'localhost',
  origin: `http://localhost:${PORT}`,
  credentials: new MemoryCredentialStore(),
  challenges: new MemoryChallengeStore(),
});

const app = express();
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  }),
);

// Demo "account creation": in a real app this is your sign-up flow.
app.post('/signup', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });
  req.session.regenerate(() => {
    req.session.user = { id: crypto.randomUUID(), username };
    res.json(req.session.user);
  });
});
app.get('/me', (req, res) => res.json(req.session.user ?? null));
app.post('/logout', (req, res) => req.session.destroy(() => res.status(204).end()));

app.use(
  '/auth/passkey',
  passkeyRouter({
    passkey,
    getUser: (req) => req.session.user ?? null,
    onAuthenticated: (req, result) =>
      new Promise((resolve, reject) =>
        // Regenerate the session on login to prevent session fixation.
        req.session.regenerate((err) => {
          if (err) return reject(err);
          // ponytail: username isn't stored with credentials; look it up from your user table.
          req.session.user = { id: result.userId, username: result.userId };
          resolve({ verified: true, userId: result.userId });
        }),
      ),
  }),
);

app.use('/vendor/passkey-kit', express.static(entryDir('@passkey-kit/browser')));
app.use('/vendor/simplewebauthn', express.static(entryDir('@simplewebauthn/browser')));
app.use(express.static(new URL('./public', import.meta.url).pathname));

app.listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
