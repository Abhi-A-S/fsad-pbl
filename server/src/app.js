import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import paperRoutes from './routes/papers.js';
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

// Cookie parser for reading httpOnly auth cookie
app.use(cookieParser());

// API routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/papers', paperRoutes);

// Centralized error handler
app.use(errorHandler);

export default app;
