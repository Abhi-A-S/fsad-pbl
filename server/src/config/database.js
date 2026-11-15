import mongoose from 'mongoose';
import { config } from './env.js';

let isListenersAttached = false;

function setupConnectionListeners() {
  if (isListenersAttached) return;
  isListenersAttached = true;

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connection established successfully');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB connection lost. Attempting reconnection...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected successfully');
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection runtime error:', err.message);
  });
}

/**
 * Connects to MongoDB using Mongoose.
 * Relies on Mongoose's built-in reconnection and server selection behavior.
 *
 * @param {string} [uri] - Optional MongoDB connection URI override.
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDatabase(uri = config.mongodbUri) {
  setupConnectionListeners();

  try {
    const conn = await mongoose.connect(uri);
    return conn;
  } catch (error) {
    console.error(`Failed to connect to MongoDB at ${uri}:`, error.message);
    throw error;
  }
}

/**
 * Closes the active Mongoose database connection.
 *
 * @param {boolean} [force=false]
 * @returns {Promise<void>}
 */
export async function disconnectDatabase(force = false) {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
}

