import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

await pool.query('SELECT 1');
const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`MiniLedger API listening on http://localhost:${config.PORT}`);
  console.log('Development mock login: OTPs appear in this terminal.');
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
