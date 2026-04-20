import { AnyPgTable, AnyPgColumn, PgColumn } from 'drizzle-orm/pg-core';
import { PgSelectQueryBuilder } from 'drizzle-orm/pg-core/query-builders'
import type { Request, Response, NextFunction } from 'express';
import type { SQL } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';

import { db, user } from '../db';
import catchAsync from './catchAsync';
import ApiResponse from './ApiResponse';
import AppError from './appError';
import reqQueryUtils from './reqQueryUtils';
import PatchError from './PatchError';

function queryJoiner(
  query: any,
  joins: Array<{
    table: AnyPgTable;
    on: any;
    joinType: string;
    alias?: string;
  }>,
): any {
  joins.forEach((join) => {
    switch (join.joinType) {
      case 'left':
        query = query.leftJoin(join.table, join.on);
        break;
      case 'right':
        query = query.rightJoin(join.table, join.on);
        break;
      case 'inner':
        query = query.innerJoin(join.table, join.on);
        break;
      case 'full':
        query = query.fullJoin(join.table, join.on);
        break;
    }
  });
  return query;
}

function createConditions(
  req: Request,
  conditions: Array<{ field: AnyPgColumn; param?: any; value?: any }>,
  isUserLoggedIn: boolean,
  userIdField: any,
): SQL<any>[] {
  let drizzleConditions = conditions.map((condition) => {
    if(condition.param) return eq(condition.field, req.params[condition.param]);
    if(condition.value) return eq(condition.field, condition.value);
    return eq(condition.field,'');
  });
  let userParam: SQL<any>[] = [];
  if (isUserLoggedIn) userParam = [eq(userIdField, req.user?.id)];
  return [...drizzleConditions, ...userParam];
}

/**
 * Creates a function that:
 * Manages query endpoints for one record from the database.
 * @param table the table the query should start from
 * @param columns the columns that should be bart of the result
 * @param joins describes the tables and how they are joined to the base table
 * @param conditions the conditions that should be met for the records in the result
 * @param isUserLoggedIn true if have to check weather the logged-in user is somehow part of the record for update defaults to false
 * @param userIdField the field the user check will be done defaults to user id
 */
export const getOneFactory = (
  table: AnyPgTable,
  columns: any,
  joins: Array<{ table: AnyPgTable; on: any; joinType: string}>,
  conditions: Array<{ field: AnyPgColumn; param?: any; value?: any }>,
  isUserLoggedIn: boolean = false,
  userIdField: any = user.id,
) => {
  let query = queryJoiner(db.select(columns).from(table), joins);
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    let data = await query
      .where(
        and(...createConditions(req, conditions, isUserLoggedIn, userIdField)),
      )
      .groupBy(...Object.values(columns).filter((x) => x instanceof PgColumn))
      .limit(1);
    if(!data[0]) new ApiResponse(404, "Couldn't find what you're looking for").send(res);
    else new ApiResponse(200, data[0]).send(res);
  });
};

/**
 * Creates a function that:
 * Manages query endpoints for more records from the database while utilising the reqUtils with pagination and ect.
 * @param table the table the query should start from
 * @param columns the columns that should be bart of the result
 * @param joins describes the tables and how they are joined to the base table
 * @param conditions the conditions that should be met for the records in the result
 * @param isUserLoggedIn true if have to check weather the logged-in user is somehow part of the record for update defaults to false
 * @param userIdField the field the user check will be done defaults to user id
 */
export const getMoreFactory = (
  table: AnyPgTable,
  columns: any,
  joins: Array<{ table: AnyPgTable; on: any; joinType: string }>,
  conditions: Array<{ field: AnyPgColumn; param?: any; value?: any   }>,
  isUserLoggedIn: boolean = false,
  userIdField: any = user.id,
) => {
  let query = queryJoiner(db.select(columns).from(table), joins);
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    let data = await reqQueryUtils(
      req,
      query
        .where(
          and(
            ...createConditions(req, conditions, isUserLoggedIn, userIdField),
          ),
        )
        .groupBy(
          ...Object.values(columns).filter((x) => x instanceof PgColumn),
        ),
    );
    new ApiResponse(200, data, req.links?.prev, req.links?.next).send(res);
  });
};

/**
 * Creates a function that:
 * Manages patch endpoints and middlewares for the database record update.
 * @param table the table the update will occur
 * @param updateableFields the fields available for update
 * @param validators the validators for the fields that require validation before updating
 * @param conditions the conditions when updating this will be but in the where clause. The field will be made equal with the req.param.{param}.
 * @param postFunc true if there is a function in the req-res cycle after this defaults to false
 * @param isUserLoggedIn true if have to check weather the logged-in user is somehow part of the record for update defaults to false
 * @param userIdField the field the user check will be done defaults to user id
 */
export const updateFactory = (
  table: AnyPgTable,
  updateableFields: Array<string>,
  validators: any,
  conditions: Array<{ field: AnyPgColumn; param: any }>,
  postFunc: boolean = false,
  isUserLoggedIn: boolean = false,
  userIdField: any = user.id,
) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    let _data = {};
    let _err: string[] = [];
    await Promise.all(
      Object.entries(req.body).map(async (x) => {
        const key: string = x[0] ?? '',
          value = x[1];
        if (updateableFields.includes(key)) {
          if (Object.keys(validators).includes(key)) {
            if (!(await validators[key](value))) {
              _err.push(key);
              console.log(_err);
              /*(
                new AppError(
                  `Couldn't validate value ${value} for field ${key}`,
                  400,
                ),
              );*/
            }
          }
          // @ts-ignore
          _data[key] = value;
        }
      }),
    );
    if (_err.length == 0) {
      const createdData =
        (
          await db
            .update(table)
            .set(_data)
            .where(
              and(
                ...createConditions(
                  req,
                  conditions,
                  isUserLoggedIn,
                  userIdField,
                ),
              ),
            )
            .returning()
        )[0] ?? '';
      if (postFunc) {
        req.createdData = createdData;
        next();
      } else {
        new ApiResponse(202, createdData).send(res);
      }
    } else {
      next(new PatchError("Couldn't validate some fields", 400, _err));
    }
  });
};
