import app from './app.js';
import { config } from './config/env.js';

const server = app.listen(config.port, () => {
  console.log(`Server running in ${config.env} mode on port ${config.port}`);
});

server.on('error', (err) => {
  console.error('Server startup error:', err.message);
  process.exit(1);
});

export default server;

