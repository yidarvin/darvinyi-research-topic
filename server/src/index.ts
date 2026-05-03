import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';

import authRouter from './routes/auth';
import graphRouter from './routes/graph';
import paperRouter from './routes/paper';

const app = express();
const PORT = process.env.PORT ?? 3001;
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

// ── Middleware ──
app.use(
  cors({
    origin: [CLIENT_URL, 'http://localhost:5173', 'http://localhost:4173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

// ── API Routes ──
app.use('/api/auth', authRouter);
app.use('/api/user', authRouter); // apikey routes live in authRouter
app.use('/api/graph', graphRouter);
app.use('/api/paper', paperRouter);

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Serve React build in production ──
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${process.env.NODE_ENV ?? 'development'})`);
});

export default app;
