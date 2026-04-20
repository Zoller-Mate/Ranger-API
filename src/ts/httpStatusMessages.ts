/**
 * Adds status messages, evaluated from the status code.
 */
const httpStatusMessages: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  413: "Content Too Large",
  500: 'Internal Server Error',
};

export = httpStatusMessages;
