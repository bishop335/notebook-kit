/* eslint-disable @typescript-eslint/no-explicit-any */

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
  /**
   * If specified, query results are at least as fresh as the specified date.
   * If null, results are as fresh as possible (never pulled from the cache).
   */
  since?: Date | string | number | null;
  /**
   * If specified, query results must be younger than the specified number of seconds.
   * If null, results are as fresh as possible (never pulled from the cache).
   */
  maxAge?: number | null;
}

export interface QueryOptions extends QueryOptionsSpec {
  since?: Date | null;
  maxAge?: number | null;
}

export interface DatabaseClient {
  readonly name: string;
  readonly options: QueryOptions;
  sql(strings: string[], ...params: QueryParam[]): Promise<QueryResult>;
}

export const DatabaseClient = (name: string, options?: QueryOptionsSpec): DatabaseClient => {
  if (!/^[\w-]+$/.test(name)) throw new Error(`invalid database: ${name}`);
  return new DatabaseClientImpl(name, normalizeQueryOptions(options));
};

function normalizeQueryOptions({since, maxAge}: QueryOptionsSpec = {}): QueryOptions {
  const options: QueryOptions = {};
  if (since !== undefined) options.since = since == null ? since : new Date(since);
  if (maxAge !== undefined) options.maxAge = maxAge == null ? maxAge : Number(maxAge);
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
    const path = `.observable/cache/${this.name}/${await hash(strings, ...params)}.json`;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`failed to fetch: ${path}`);
    const {rows, schema, date} = await response.json();
    rows.schema = schema;
    rows.date = new Date(date);
    revive(rows);
    return rows;
  }
}

async function hash(strings: string[], ...params: unknown[]): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify([strings, ...params]));
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  const int = new Uint8Array(buffer).reduce((i, byte) => (i << 8n) | BigInt(byte), 0n);
  return int.toString(36).padStart(24, "0").slice(0, 24);
}

function revive(rows: QueryResult): void {
  for (const column of rows.schema) {
    switch (column.type) {
      case "bigint": {
        const {name} = column;
        for (const row of rows) {
          const value = row[name];
          if (value == null) continue;
          row[name] = BigInt(value);
        }
        break;
      }
      case "date": {
        const {name} = column;
        for (const row of rows) {
          const value = row[name];
          if (value == null) continue;
          row[name] = new Date(value);
        }
        break;
      }
    }
  }
}

DatabaseClient.hash = hash;
DatabaseClient.revive = revive;
DatabaseClient.prototype = DatabaseClientImpl.prototype; // instanceof
Object.defineProperty(DatabaseClientImpl, "name", {value: "DatabaseClient"}); // prevent mangling
