import { Request, Response, NextFunction } from 'express';
import AppError from '../../utils/appError';

// Specific error handlers
const handleJWTError = (): AppError =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = (): AppError =>
  new AppError('Your token has expired! Please log in again.', 401);

// Error response functions
const sendErrorDev = (err: AppError, req: Request, res: Response): Response => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }
  return res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
  });
};

const sendErrorProd = (err: AppError, req: Request, res: Response): Response => {
  if (req.originalUrl.startsWith('/api')) {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }
    // Programming or other unknown error: don't leak error details
    // Log error
    console.error('ERROR: ', err);
    // Send generic message
    return res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }
  // Fallback for non-API routes
  return res.status(500).json({
    status: 'error',
    message: 'Something went very wrong!',
  });
};

const errorController = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Normalize error properties with defaults
  err.statusCode = err.statusCode ?? 500;
  err.status = err.status ?? 'error';
  err.isOperational = err.isOperational ?? false;

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = err;

    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};

export default errorController;