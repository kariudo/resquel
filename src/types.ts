import type { Request, Response } from 'express';
import type { Knex } from 'knex';

export type ConnectionType = 'mssql' | 'mysql' | 'postgresql' | string;

export type ConfigRouteMethods = 'get' | 'post' | 'put' | 'delete' | 'index' | string;

export type PreparedQuery = [string, ...(string | QueryParamLookup)[]];

export type ConfigRouteQuery = string | PreparedQuery | PreparedQuery[];

export type QueryParam = {
  knex: Knex;
  // biome-ignore lint/suspicious/noExplicitAny: Resquel instance, avoiding circular type reference
  resquel: any;
  req: Request;
  res: Response;
};

export type QueryParamLookup = (param: QueryParam) => Promise<string>;

export type ConfigRoute = {
  method: ConfigRouteMethods;
  endpoint: string;
  query: ConfigRouteQuery;
  tokens?: string[];
  before?: (req: Request, res: Response, next: () => Promise<void>) => unknown;
  after?: (req: Request, res: Response, next: () => Promise<void>) => unknown;
};

export enum ErrorCodes {
  paramLookupFailed = 1001,
}

export interface ErrorResponse {
  errorCode: ErrorCodes;
  requestId: string;
  message?: string;
  status: number;
}

export type ResquelAuth = {
  username: string;
  password: string;
};

export type FlatDbConfig = {
  user: string;
  password: string;
  server: string;
  database?: string;
  requestTimeout?: string | number;
  [key: string]: unknown;
};

export type LegacyResquelConfig = {
  port?: number;
  db: Knex.Config<unknown>;
  routes: ConfigRoute[];
  auth?: ResquelAuth;
};

export type FlatResquelConfig = {
  port?: number;
  type: ConnectionType;
  db: FlatDbConfig;
  routes: ConfigRoute[];
  auth?: ResquelAuth;
};

export type ResquelConfig = LegacyResquelConfig | FlatResquelConfig;

export type ResquelConfigNormalized = {
  port?: number;
  db: Knex.Config<unknown>;
  routes: ConfigRoute[];
  auth?: ResquelAuth;
};
