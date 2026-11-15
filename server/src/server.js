import app from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

let server;
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Stop accepting new HTTP requests
  if (server) {
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) {
          console.error('Error closing HTTP server:', err.message);
        } else {
          console.log('HTTP server closed.');
        }
        resolve();
      });
    });
  }

  // Close MongoDB connection
  try {
    await disconnectDatabase();
  } catch (err) {
    console.error('Error disconnecting MongoDB:', err.message);
  }

  console.log('Graceful shutdown complete.');
  process.exit(0);
}

// Register process signal handlers for graceful shutdown
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function startServer() {
  try {
    // Connect to database before starting HTTP listener
    await connectDatabase();

    server = app.listen(config.port, () => {
      console.log(`Server running in ${config.env} mode on port ${config.port}`);
    });

    server.on('error', (err) => {
      console.error('Server startup error:', err.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('Application startup failed due to database connection error:', error.message);
    process.exit(1);
  }
}

startServer();

export default app;
