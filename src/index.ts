// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.log('UNCAUGHT EXCEPTION! Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

// This must be the first import to ensure env vars are available
import './loadEnv';

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { instrument } from '@socket.io/admin-ui';
import app from './api/app';
import { pool } from './db';
import { initializeSocketIO } from './socket/manager';

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Failed to connect to database:', err.message);
    console.error('Shutting down...');
    process.exit(1);
  }
  console.log('Database connected successfully!');
  if (client) {
    release();
  }
});

// Handle unexpected database errors
pool.on('error', (err: Error) => {
  console.error('Unexpected database error on idle client:', err);
  process.exit(-1);
});

const server = http.createServer(app);

// Initialize Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.URL?.split(',') || '*',
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Socket.IO Admin UI (development/staging only)
if (process.env.NODE_ENV !== 'production') {
  instrument(io, {
    auth: false,
    mode: 'development',
  });
  console.log(
    `Socket.IO Admin UI available at http://localhost:${process.env.PORT}/admin`,
  );
  console.log(`Current NODE_ENV: ${process.env.NODE_ENV}`);
}

// Initialize Socket.IO event handlers
initializeSocketIO(io);

const port = process.env.PORT;
server.listen(port, () => {
  console.log(`Server started on port ${port}`);
  console.log(`Socket.IO server ready`);
});

process.on('unhandledRejection', (err: Error) => {
  console.log('UNHANDLED REJECTION! Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

/*
Graceful shutdown on SIGTERM
This is optional and depends on deployment environment

process.on('SIGTERM', () => {
  console.log('SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated!');
  });
});
*/
