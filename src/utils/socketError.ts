/**
 * WebSocket Error Class
 * 
 * Socket.IO has different error handling than Express:
 * - Express: Uses middleware chain with next(error)
 * - Socket.IO: Uses next(new Error(message)) which sends to client
 * 
 * This class provides structured error responses for WebSocket connections
 */
class SocketError extends Error {
  public code: string;
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, code: string = 'SOCKET_ERROR', statusCode: number = 401) {
    super(message);
    this.name = 'SocketError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
  }

  // Format error for Socket.IO client
  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
      },
    };
  }

  // Emit error to socket
  static emit(socket: any, message: string, code: string = 'SOCKET_ERROR', statusCode: number = 400) {
    const error = new SocketError(message, code, statusCode);
    socket.emit('error', {
      code: error.code,
      message: error.message,
    });
  }
}

export default SocketError;
