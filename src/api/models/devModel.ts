import fs from 'fs';
import path from 'path';
import { db } from '../../db';
import * as schema from '../../db/schema';

const logsDir = path.join(process.cwd(), 'logs');

/**
 * Interface for parsed log entry
 */
export interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number | null;
  responseTime: string;
}

/**
 * Get list of available log dates from log files
 * @returns Array of dates (YYYY-MM-DD format) in descending order
 */
export const getAvailableLogDates = (): string[] => {
  try {
    // Read all files in logs directory
    const files = fs.readdirSync(logsDir);

    // Filter only log files with YYYY-MM-DD.log format
    const logFiles = files.filter((file) => /^\d{4}-\d{2}-\d{2}\.log$/.test(file));

    // Extract dates (remove .log extension) and sort descending
    return logFiles.map((file) => file.replace('.log', '')).sort().reverse();
  } catch (error) {
    console.error('Error reading logs directory:', error);
    return [];
  }
};

/**
 * Validate date format
 * @param date Date string to validate
 * @returns true if valid YYYY-MM-DD format
 */
export const isValidDateFormat = (date: string): boolean => {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
};

/**
 * Check if log file exists for given date
 * @param date Date in YYYY-MM-DD format
 * @returns true if log file exists
 */
export const logFileExists = (date: string): boolean => {
  const logFilePath = path.join(logsDir, `${date}.log`);
  return fs.existsSync(logFilePath);
};

/**
 * Parse a single log line into structured object
 * @param line Raw log line
 * @returns Parsed LogEntry object or null if invalid format
 */
const parseLogLine = (line: string): LogEntry | null => {
  // Trim any whitespace or line endings
  line = line.trim();
  
  // Format: [2026-01-30 12:45:13] [POST] /api/v0/actions/login 200 - 177.22 ms
  const regex = /^\[([^\]]+)\]\s+\[(\w+)\]\s+(\S+)\s+(\d+)\s+-\s+([\d.]+\s+ms)$/;
  const match = line.match(regex);

  if (!match) {
    return null;
  }

  // Destructure and validate all required groups exist
  const [, timestamp, method, path, statusCodeStr, responseTime] = match;
  
  if (!timestamp || !method || !path || !statusCodeStr || !responseTime) {
    return null;
  }

  return {
    timestamp,
    method,
    path,
    statusCode: parseInt(statusCodeStr),
    responseTime,
  };
};

/**
 * Read and parse log file for given date
 * @param date Date in YYYY-MM-DD format
 * @returns Array of parsed log entries
 */
export const getLogsByDate = (date: string): LogEntry[] => {
  const logFilePath = path.join(logsDir, `${date}.log`);

  // Read file content
  const content = fs.readFileSync(logFilePath, 'utf-8');

  // Split into lines and parse each line, filter out invalid entries
  // Handle both Unix (LF) and Windows (CRLF) line endings
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const parsedLogs = lines.map(parseLogLine).filter((log): log is LogEntry => log !== null);
  
  return parsedLogs;
};

/**
 * Interface for database dump response
 */
export interface DatabaseDump {
  [tableName: string]: any[];
}

/**
 * Get complete database dump
 * Fetches all data from all tables and returns in a structured format
 * @returns Complete database dump
 */
export const getDatabaseDump = async (): Promise<DatabaseDump> => {
  // Fetch data from all tables in parallel for better performance
  const [
    users,
    userOnlineStatus,
    camps,
    memberToCamp,
    chats,
    messages,
    chatMembers,
    passwordResets,
    tokens,
    groups,
    rooms,
    payments,
    userPayments,
    locations,
  ] = await Promise.all([
    db.select().from(schema.user),
    db.select().from(schema.userOnlineStatus),
    db.select().from(schema.camp),
    db.select().from(schema.memberToCamp),
    db.select().from(schema.chat),
    db.select().from(schema.message),
    db.select().from(schema.chatMember),
    db.select().from(schema.passwordReset),
    db.select().from(schema.token),
    db.select().from(schema.group),
    db.select().from(schema.room),
    db.select().from(schema.payment),
    db.select().from(schema.userPayment),
    db.select().from(schema.location),
  ]);

  // Build tables object with all data
  const tables = {
    users,
    userOnlineStatus,
    camps,
    memberToCamp,
    chats,
    messages,
    chatMembers,
    passwordResets,
    tokens,
    groups,
    rooms,
    payments,
    userPayments,
    locations,
  };

  return tables;
};
