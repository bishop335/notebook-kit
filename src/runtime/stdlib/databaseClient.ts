/* eslint-disable @typescript-eslint/no-explicit-any */
import type {SerializableQueryResult} from "../../databases/index.js";

/** A serializable value that can be interpolated into a query. */
export type QueryParam = any;

/** @see https://observablehq.com/@observablehq/database-client-specification#%C2%A71 */
export type QueryResult = Record<string, any>[] & {schema: ColumnSchema[]; date: Date};

/** @see https://observablehq.com/@observablehq/database-client-specification#%C2%A72.2 */
export interface ColumnSchema {
  /** The name of the column. */
  name: string;
  /** The type of the column. */
  type:
    | "string"
    | "number"
    | "integer"
    | "bigint"
    | "date"
    | "boolean"
    | "object"
    | "array"
    | "buffer"
    | "other";
  /** If present, the nullability of the column is known. */
  nullable?: boolean;
}

export interface QueryOptionsSpec {
  /** if present, the id of the cell that owns this database client */
  id?: number;
  /** if present, query results are at least as fresh as the specified date */
  since?: Date | string | number;
}

export interface QueryOptions extends QueryOptionsSpec {
  since?: Date;
}

export interface DatabaseClient {
  readonly name: string;
  readonly options: QueryOptions;
  sql(strings: string[], ...params: QueryParam[]): Promise<QueryResult>;
}

export const DatabaseClient = (name: string, options?: QueryOptionsSpec): DatabaseClient => {
  if (!/^[\w-]+$/.test(name)) throw new Error(`invalid database: ${name}`);
  return new DatabaseClientImpl(name, normalizeOptions(options));
};

function normalizeOptions({id, since}: QueryOptionsSpec = {}): QueryOptions {
  const options: QueryOptions = {};
  if (id !== undefined) options.id = id;
  if (since !== undefined) options.since = new Date(since);
  return options;
}

class DatabaseClientImpl implements DatabaseClient {
  readonly name!: string;
  readonly options!: QueryOptions;
  constructor(name: string, options: QueryOptions) {
    Object.defineProperties(this, {
      name: {value: name, enumerable: true},
      options: {value: options, enumerable: true}
    });
  }
  async sql(strings: string[], ...params: QueryParam[]): Promise<QueryResult> {
    const path = `.observable/cache/${this.name}-${await hash(strings, ...params)}.json`;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`failed to fetch: ${path}`);
    return await response.json().then(revive);
  }
}

async function hash(strings: string[], ...params: unknown[]): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify([strings, ...params]));
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  const int = new Uint8Array(buffer).reduce((i, byte) => (i << 8n) | BigInt(byte), 0n);
  const length = 16;
  return int.toString(36).padStart(length, "0").slice(0, length);
}

function revive({rows, schema, date, ...meta}: SerializableQueryResult): QueryResult {
  for (const column of schema) {
    switch (column.type) {
      case "bigint": {
        const {name} = column;
        for (const row of rows) {
          const value = row[name] as string | null;
          if (value == null) continue;
          row[name] = BigInt(value);
        }
        break;
      }
      case "date": {
        const {name} = column;
        for (const row of rows) {
          const value = row[name] as string | null;
          if (value == null) continue;
          row[name] = new Date(value);
        }
        break;
      }
    }
  }
  if (date != null) date = new Date(date);
  return Object.assign(rows, {schema, date}, meta);
}

DatabaseClient.hash = hash;
DatabaseClient.revive = revive;
DatabaseClient.prototype = DatabaseClientImpl.prototype; // instanceof
Object.defineProperty(DatabaseClientImpl, "name", {value: "DatabaseClient"}); // prevent mangling
