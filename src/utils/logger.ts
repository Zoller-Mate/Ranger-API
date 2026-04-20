import { createLogger, format, transports, Logger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

const { combine, timestamp, printf } = format;

const logs = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logs)) {
  fs.mkdirSync(logs);
}

const logger: Logger = createLogger({
  level: 'info',
  transports: [
    new transports.Console({
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, consoleMessage, message }) => {
          return `\x1b[90m[${timestamp}]\x1b[0m ${consoleMessage ?? message}`;
        }),
      ),
    }),

    new DailyRotateFile({
      dirname: logs,
      filename: '%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, message }) => {
          return `[${timestamp}] ${message}`;
        }),
      ),
    }),
  ],
});

const httpLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const timeMs = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2);

    const methodColor =
      {
        GET: chalk.green,
        POST: chalk.yellow,
        DELETE: chalk.red,
        PATCH: chalk.magenta,
      }[req.method] ?? chalk.white;

    const statusColor =
      res.statusCode >= 500
        ? chalk.red
        : res.statusCode >= 400
          ? chalk.yellow
          : chalk.green;

    const plainMessage =
      `[${req.method}] ` +
      `${req.originalUrl} ` +
      `${res.statusCode} ` +
      `- ${timeMs} ms`;

    const colorMessage =
      `${methodColor(req.method)} ` +
      `${req.originalUrl} ` +
      `${statusColor(res.statusCode.toString())} ` +
      `${chalk.cyan(`- ${timeMs} ms`)}`;

    logger.info(plainMessage, {
      consoleMessage: colorMessage,
    });
  });

  next();
};

export default httpLogger;
