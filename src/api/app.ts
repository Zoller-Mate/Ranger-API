import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import compression from 'compression';
import { join } from 'path';

import AppError from '../utils/appError';
import globalErrorHandler from './controllers/errorController';
import httpLogger from '../utils/logger';
import campRouter from './routes/v1/campRouter';
import selfRouter from './routes/v1/selfRouter';
import authRouter from './routes/v1/authRouter';
import rawRouter from './routes/v1/rawRouter';
import viewRouter from './routes/v1/viewRouter';
import devRouter from './routes/v1/devRouter';

const app = express();
app.set('trust proxy', 1);

// Security HTTP headers
app.use(helmet());

// Logging
app.use(httpLogger);

// Limit requests from same API
const limiter = rateLimit({
  max: 1000,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
});

app.use('/api', limiter);

// Parse URL-encoded bodies (as sent by HTML forms)
//app.use(express.urlencoded({ extended: true, limit: '10kb' })); // kell ez nekunk?
// Cookie parser - reads cookies from incoming requests
app.use(cookieParser());

// Compress responses - very important for performance
app.use(compression());

//handle routes that require raw parsing
app.use('/api/v1/', rawRouter);

//loads req.body
app.use(
  express.json({
    limit: '10kb',
  }),
);

app.set('view engine', 'pug');
app.set('views', join(__dirname, './_views/web/'));

app.use(express.static(join(__dirname, '../../node_modules/bootstrap/dist')));
app.use(express.static(join(__dirname, '../../node_modules/cropperjs/dist')));
app.use(express.static(join(__dirname, '../../node_modules/jquery/dist')))
app.use(
  '/css/fonts',
  express.static(
    join(__dirname, '../../node_modules/bootstrap-icons/font/fonts'),
  ),
);
app.use(express.static(join(__dirname, 'views')));
app.use(express.static(join(__dirname, '../images/profilePics')));

app.use('/', viewRouter);
app.use('/api/v1/camps', campRouter);
app.use('/api/v1/me', selfRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/dev', devRouter);

// Handle unhandled routes - must be AFTER all other routes
app.use((req: Request, res: Response, next: NextFunction) => {
  // If it's an API route, return JSON error
  if (req.originalUrl.startsWith('/api')) {
    return next(
      new AppError(`Can't find ${req.originalUrl} on this server!`, 404),
    );
  }
  
  // Otherwise render 404 page for web routes
  res.status(404).render('./404.pug');
});

// Global error handling middleware
app.use(globalErrorHandler);

export default app;
