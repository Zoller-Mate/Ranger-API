import { Request, Response, NextFunction } from 'express';
import catchAsync from '../../utils/catchAsync';
import AppError from '../../utils/appError';
import ApiResponse from '../../utils/ApiResponse';
import * as devModel from '../models/devModel';

/**
 * Get available log dates
 * Returns list of dates for which log files exist
 */
export const getAvailableLogDates = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const dates = devModel.getAvailableLogDates();

    new ApiResponse(200, {
      dates,
    }).send(res);
  },
);

/**
 * Get logs for a specific date
 * Returns parsed log entries as JSON array
 */
export const getLogsByDate = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { date } = req.params;

    // Check if date parameter exists
    if (!date) {
      return next(new AppError('Date parameter is required', 400));
    }

    // Validate date format
    if (!devModel.isValidDateFormat(date)) {
      return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
    }

    // Check if log file exists
    if (!devModel.logFileExists(date)) {
      return next(
        new AppError('Log file not found for the specified date', 404),
      );
    }

    const parsedLogs = devModel.getLogsByDate(date);

    new ApiResponse(200, {
      logs: parsedLogs,
    }).send(res);
  },
);

/**
 * Get complete database dump
 * Returns all data from all tables with statistics
 */
export const getDatabaseDump = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const databaseDump = await devModel.getDatabaseDump();

    new ApiResponse(200, databaseDump).send(res);
  },
);
