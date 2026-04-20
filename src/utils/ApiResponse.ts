import httpStatusMessages from '../ts/httpStatusMessages';
import type { Response } from 'express';

/**
 * Handles api responses, in a straight forward way
 */
class ApiResponse<T = any> {
  constructor(
    public code: number,
    public data: T,
    public prev?: string,
    public next?: string,
  ) {}

  /**
   * Sends the response specified, through the given res object
   * @param res the res object the data will be sent through
   */
  send(res: Response): void {
    const json: any = {
      status: httpStatusMessages[this.code] ?? 'Unknown Status',
    };
    if (Array.isArray(this.data)) json.resoults = this.data.length;
    if (this.prev) json.prev = this.prev;
    if (this.next) json.next = this.next;
    json.data = this.data;
    json.timestamp = new Date().toISOString();

    res.status(this.code).json(json);
  }

  cookieSend(res: Response, name: string, value: string, options: any): void {
    res.cookie(name, value, options);
    this.send(res);
  }
}

export = ApiResponse;
