import basicAuth from 'basic-auth-connect';
import bodyParser from 'body-parser';
import debug from 'debug';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import knex, { type Knex } from 'knex';
import _, { type AnyKindOfDictionary } from 'lodash';
import methodOverride from 'method-override';
import { v4 as uuid } from 'uuid';

import type {
  ConfigRouteQuery,
  ConnectionType,
  ErrorResponse,
  FlatResquelConfig,
  PreparedQuery,
  QueryParamLookup,
  ResquelAuth,
  ResquelConfig,
  ResquelConfigNormalized,
} from './types';

import { ErrorCodes } from './types';

const logger: {
  error: debug.Debugger;
  warn: debug.Debugger;
  info: debug.Debugger;
  debug: debug.Debugger;
} = {
  error: debug('resquel:error'),
  warn: debug('resquel:warn'),
  info: debug('resquel:info'),
  debug: debug('resquel:debug'),
};

export class Resquel {
  public knexClient: Knex;
  public readonly router: express.Router = express.Router();
  private normalizedConfig: ResquelConfigNormalized;

  constructor(resquelConfig: ResquelConfig) {
    this.normalizedConfig = this.normalizeConfig(resquelConfig);
  }

  public async init() {
    const config = this.normalizedConfig || ({} as ResquelConfigNormalized);
    logger.info(`routerSetup`);
    this.routerSetup(config.auth);

    logger.info(`createKnexConnections`);
    this.createKnexConnections();

    logger.info(`loadRoutes`);
    this.loadRoutes();
  }

  public sendError(
    res: Response,
    reason: string, // Make this human understandable
    errorCode: ErrorCodes | number,
  ) {
    res.locals.status = res.locals.status || 500;
    const out: ErrorResponse = {
      errorCode,
      message: reason,
      requestId: res.locals.requestId,
      status: res.locals.status,
    };
    res.status(res.locals.status).send(out);
  }

  public sendResponse(res: Response) {
    res.locals.status = res.locals.status || 200;
    logger.info(`[${res.locals.requestId}] Sending response w/ status ${res.locals.status}`);
    logger.debug(res.locals.result);
    res.status(res.locals.status).send(res.locals.result);
  }

  protected createKnexConnections() {
    this.knexClient = knex(this.normalizedConfig.db);
  }

  protected loadRoutes() {
    this.normalizedConfig.routes.forEach((route, idx) => {
      const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
      logger.info(`${idx}) Register Route: ${route.method} ${route.endpoint}`);
      logger.debug(route);
      this.router[method](route.endpoint, async (req: Request, res: Response) => {
        // For aiding tracing in logs, all logs related to the request should contain this id
        res.locals.requestId = req.query.requestId || uuid();
        res.locals.route = route;
        logger.info(`${idx}) ${route.method} ${route.endpoint} :: ${res.locals.requestId}`);
        if (route.before) {
          await new Promise((done) => {
            route.before(req, res, async () => {
              done(null);
            });
          });
        }
        const result = await this.processRouteQuery(route.query, req, this.knexClient);
        if (typeof result === 'number') {
          this.sendError(res, 'processRouteQuery failed, see logs', result);
          return;
        }
        res.locals.result = result || [];
        if (route.after) {
          await new Promise((done) => {
            route.after(req, res, async () => {
              done(null);
            });
          });
          if (res.writableEnded) {
            logger.warn(`[${res.locals.requestId}] Response sent by route.after`);
            return;
          }
        }
        logger.info(`[${res.locals.requestId}] Sending result`);
        this.sendResponse(res);
      });
    });
  }

  protected async processRouteQuery(
    routeQuery: ConfigRouteQuery,
    req: Request,
    knexClient: Knex,
  ): Promise<ErrorCodes | { rows: AnyKindOfDictionary[] | null }> {
    // Resolve route query into an array of prepared statements.
    // Example:
    //   ["SELECT * FROM customers WHERE id=?", "params.customerId"]
    //
    // Where params are passed as strings, use them as object paths on the req object
    // Where params are passed as functions (enterprise), call those and use the return results as params for this query
    //
    // If more than 1 query is passed, then this function will return the results from the final statement
    // Example:
    // [
    //   ["INSERT INTO customers (firstName, lastName, email) VALUES (?, ?, ?);", "body.firstName", "body.lastName", "body.email"],
    //   "SELECT * FROM customers WHERE id=SCOPE_IDENTITY();"
    // ]
    //

    if (typeof routeQuery === 'string') {
      // "SELECT * FROM `customers`"
      routeQuery = [[routeQuery]];
    }
    if (typeof routeQuery[0] === 'string') {
      // ["SELECT * FROM customers WHERE id=?", "params.customerId"]
      routeQuery = [routeQuery as PreparedQuery];
    }
    const isValid = (routeQuery as PreparedQuery[]).every(
      (i, idx) => idx === 0 || typeof i !== 'string',
    );
    if (!isValid) {
      // Probably a mix of prepared queries, and strings like this:
      // [
      //   ["Query 1","param","param"],
      //   "Query 2"
      // ]
      //
      // Should resolve by changing "Query 2" line to ["Query 2"]
      // Keep the types consistent
      //
      throw new Error(`Resquel is unable to resolve route query`);
    }
    const res = req.res;
    res.locals.queries = res.locals.queries || [];
    const queries = res.locals.queries;

    let result: AnyKindOfDictionary[] | null = null;
    for (let i = 0; i < routeQuery.length; i++) {
      const query = [...(routeQuery[i] as PreparedQuery)];
      const queryString = query.shift() as string;
      const params: string[] = [];

      // params builder
      for (let j = 0; j < query.length; j++) {
        if (typeof query[j] === 'string') {
          const val = _.get(req, query[j] as string);
          if (val === undefined) {
            logger.warn(`[${res.locals.requestId}] lookup failed for param "${query[j]}"`);
            logger.debug(req.body);
            return ErrorCodes.paramLookupFailed;
          }
          params.push(val);
        } else {
          params.push(
            await (query[j] as QueryParamLookup)({
              resquel: this,
              knex: knexClient,
              req,
              res,
            }),
          );
        }
      } // /params builder
      try {
        result = this.resultProcess(knexClient, await knexClient.raw(queryString, params));
      } catch (err) {
        logger.error('QUERY FAILED');
        logger.error({
          queryString,
          params: params.map(p => typeof p === 'string' && p.length > 50 ? `${p.substring(0, 50)}...` : p),
          result,
        });
        logger.error(err);
        // Return error instead of silently continuing
        return ErrorCodes.paramLookupFailed;
      }
      // Example result:
      // [
      //   {
      //     id: 1,
      //     firstName: 'John',
      //     lastName: 'Doe',
      //     email: 'example@example.com',
      //   },
      // ];
      //
      // Example prepared query that utilizes result:
      // ["SELECT * FROM customer WHERE id=?", "res.locals.queries[0].id"]
      //
      // This works because `req.res` is a thing:
      // express: After middleware.init executed, Request will contain res and next properties
      // See: express/lib/middleware/init.js
      //

      queries.push({
        queryString,
        params,
        result,
      });
    }
    return {
      rows: result,
    };
  }

  protected resultProcess(knexClient: Knex, result: AnyKindOfDictionary): AnyKindOfDictionary[] {
    switch (knexClient.client.config.client as ConnectionType) {
      case 'postgresql':
        return (result as { rows: AnyKindOfDictionary[] }).rows;
      case 'mysql':
        if ((result as AnyKindOfDictionary[]).length === 1) {
          return result as AnyKindOfDictionary[];
        }
        if (result[0].affectedRows !== undefined) {
          return [];
        }
        return result[0] as AnyKindOfDictionary[];
      default:
        return result as AnyKindOfDictionary[];
    }
  }

  protected routerSetup(auth?: ResquelAuth) {
    const { router } = this;
    router.use(bodyParser.urlencoded({ extended: true }));
    router.use(bodyParser.json());
    router.use(methodOverride('X-HTTP-Method-Override') as NextFunction);

    if (auth) {
      router.use(basicAuth(auth.username, auth.password));
    }
  }

  protected normalizeConfig(config: ResquelConfig): ResquelConfigNormalized {
    if (this.isFlatConfig(config)) {
      const { server, requestTimeout, ...connectionRemainder } = config.db;
      const connection: Record<string, unknown> = {
        ...connectionRemainder,
        host: server,
      };

      if (requestTimeout !== undefined) {
        connection.requestTimeout = Number(requestTimeout);
      }

      return {
        port: config.port,
        auth: config.auth,
        db: {
          client: config.type,
          connection,
        },
        routes: config.routes.map((route) => ({
          ...route,
          query: this.normalizeRouteQuery(route.query),
        })),
      };
    }

    return {
      port: config.port,
      auth: config.auth,
      db: config.db,
      routes: config.routes.map((route) => ({
        ...route,
        query: this.normalizeRouteQuery(route.query),
      })),
    };
  }

  protected isFlatConfig(config: ResquelConfig): config is FlatResquelConfig {
    return (
      (config as FlatResquelConfig).type !== undefined &&
      !(config as { db?: { client?: string } }).db?.client
    );
  }

  protected normalizeRouteQuery(routeQuery: ConfigRouteQuery): ConfigRouteQuery {
    if (typeof routeQuery === 'string') {
      return this.convertTemplatedQuery(routeQuery);
    }

    if (typeof routeQuery[0] === 'string') {
      const preparedQuery = routeQuery as PreparedQuery;
      if (preparedQuery.length === 1) {
        return this.convertTemplatedQuery(preparedQuery[0]);
      }
      return preparedQuery;
    }

    return (routeQuery as PreparedQuery[]).map((preparedQuery) => {
      if (preparedQuery.length === 1) {
        return this.convertTemplatedQuery(preparedQuery[0]) as PreparedQuery;
      }
      return preparedQuery;
    });
  }

  protected convertTemplatedQuery(queryString: string): ConfigRouteQuery {
    const params: string[] = [];
    const preparedQueryString = queryString.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, path) => {
      params.push((path as string).trim());
      return '?';
    });

    if (params.length === 0) {
      return queryString;
    }

    return [preparedQueryString, ...params] as PreparedQuery;
  }
}
export default Resquel;
