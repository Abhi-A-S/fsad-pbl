import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import healthRoutes from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security headers
app.use(helmet());

// Cross-Origin Resource Sharing
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

// JSON body parser
app.use(express.json());

// API routes
app.use('/api', healthRoutes);

// Centralized error handler
app.use(errorHandler);

export default app;

