import type {Column, Connection, ConnectionOptions, RowStatement} from "snowflake-sdk";
import Snowflake from "snowflake-sdk";
import type {ColumnSchema, QueryParam} from "../runtime/index.js";
import {QueryTemplateFunction, SerializableQueryResult, SnowflakeConfig} from "./index.js";
import {optionalString} from "./options.js";

Snowflake.configure({logLevel: "OFF"});

export default function snowflake(options: SnowflakeConfig): QueryTemplateFunction {
  return async (strings, ...params) => {
    const connection = await connect({
      account: String(options.account),
      username: optionalString(options.username),
      password: optionalString(options.password),
      database: optionalString(options.database),
      schema: optionalString(options.schema),
      warehouse: optionalString(options.warehouse),
      role: optionalString(options.role)
    });
    let result: SerializableQueryResult;
    try {
      result = await execute(connection, strings.join("?"), params);
    } finally {
      await destroy(connection);
    }
    return result;
  };
}

async function connect(options: ConnectionOptions): Promise<Connection> {
  const connection = Snowflake.createConnection(options);
  await new Promise<void>((resolve, reject) => {
    connection.connect((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
  return connection;
}

async function destroy(connection: Connection): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    connection.destroy((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

async function execute(
  connection: Connection,
  sql: string,
  params?: QueryParam[]
): Promise<SerializableQueryResult> {
  return new Promise<SerializableQueryResult>((resolve, reject) => {
    const date = new Date();
    connection.execute({
      sqlText: sql,
      binds: params,
      complete(error, statement, rows) {
        if (error) return reject(error);
        resolve({
          rows: rows!,
          schema: getStatementSchema(statement),
          duration: Date.now() - +date,
          date
        });
      }
    });
  });
}

function getStatementSchema(statement: RowStatement): ColumnSchema[] {
  return statement.getColumns().map(getColumnSchema);
}

function getColumnSchema(column: Column): ColumnSchema {
  return {name: column.getName(), type: getColumnType(column), nullable: column.isNullable()};
}

function getColumnType(column: Column): ColumnSchema["type"] {
  const type = column.getType();
  switch (type.toLowerCase()) {
    case "date":
    case "datetime":
    case "timestamp":
    case "timestamp_ltz":
    case "timestamp_ntz":
    case "timestamp_tz":
      return "date";
    case "time":
    case "text":
      return "string";
    case "fixed":
      return column.getScale() === 0 ? "integer" : "number";
    case "float":
    case "number":
    case "real":
      return "number";
    case "binary":
      return "buffer";
    case "array":
      return "array";
    case "boolean":
      return "boolean";
    case "object":
    case "variant":
      return "object";
    default:
      console.warn(`unknown type: ${type}`);
      return "other";
  }
}
