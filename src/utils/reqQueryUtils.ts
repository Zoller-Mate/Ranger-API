import { Request } from 'express';

import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import * as db from '../db';

const getFieldFromString: Record<string, AnyPgColumn> = {
  'user.email': db.user.email,
  'user.name': db.user.name,
  'camp.name': db.camp.name,
  'camp.startDate': db.camp.startDate,
  'camp.endDate': db.camp.endDate,
  'chat.lastMessageAt': db.chat.lastMessageAt,
}; //Could be extended if needed

/**
 * Adds sorting and pagination to the query object.
 * @param req the request object from witch the util params are got
 * @param query The query object to chain the utilst to
 * @returns The modified query object
 */
const reqQueryUtils: (req: Request, query: any) => any = (
  req: Request,
  query: any,
): any => {
  if (
    req.query.orderBy &&
    Object.keys(getFieldFromString).includes(req.query.orderBy as string)
  )
    query = query.orderBy(getFieldFromString[req.query.orderBy as string]);

  if (!!req.query.limit || !!req.query.page) {
    const page = req.query.page ? parseInt(req.query.page.toString()) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit.toString()) : 10;
    const offset = (page - 1) * limit;

    query = query.limit(limit).offset(offset);

    req.links = {
      prev:
        page > 1
          ? (process.env.URL as string) +
            req.originalUrl.split('?')[0] +
            `?limit=${limit}&page=${Math.max(page - 1, 1)}${req.query.orderBy ? `&${req.query.orderBy}` : ''}`
          : '',
      next:
        (process.env.URL as string) +
        req.originalUrl.split('?')[0] +
        `?limit=${limit}&page=${Math.max(page + 1, 1)}${req.query.orderBy ? `&${req.query.orderBy}` : ''}`,
    };
  }

  return query;
};

export = reqQueryUtils;
