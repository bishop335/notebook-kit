import type {ColumnSchema, QueryParam} from "../runtime/index.js";

export type DatabaseConfig = SnowflakeConfig | PostgresConfig;

export type SnowflakeConfig = {
  type: "snowflake";
  account: string;
  database?: string;
  role?: string;
  schema?: string;
  username?: string;
  warehouse?: string;
  password?: string;
};

export type PostgresConfig = {
  type: "postgres";
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
};

export type QueryTemplateFunction = (
  strings: string[],
  ...params: QueryParam[]
) => Promise<SerializableQueryResult>;

export type SerializableQueryResult = {
  rows: Record<string, unknown>[];
  schema: ColumnSchema[];
  duration: number;
  date: Date;
};

export async function getDatabase(config: DatabaseConfig): Promise<QueryTemplateFunction> {
  switch (config.type) {
    case "snowflake":
      return (await import("./snowflake.js")).default(config);
    case "postgres":
      return (await import("./postgres.js")).default(config);
    default:
      throw new Error(`unsupported database type: ${config["type"]}`);
  }
}
