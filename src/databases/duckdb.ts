import type {DuckDBResult, DuckDBType, Json} from "@duckdb/node-api";
import {DuckDBConnection} from "@duckdb/node-api";
import {BIGINT, BIT, BLOB, BOOLEAN, DATE, DOUBLE, FLOAT, HUGEINT, INTEGER, INTERVAL, SMALLINT, TIME, TIMESTAMP, TIMESTAMP_MS, TIMESTAMP_NS, TIMESTAMP_S, TIMESTAMPTZ, TINYINT, UBIGINT, UHUGEINT, UINTEGER, USMALLINT, UTINYINT, UUID, VARCHAR, VARINT} from "@duckdb/node-api"; // prettier-ignore
import type {DatabaseContext, DuckDBConfig, QueryTemplateFunction} from "./index.js";
import type {ColumnSchema} from "../runtime/index.js";

export default function duckdb(
  _options: DuckDBConfig,
  context: DatabaseContext
): QueryTemplateFunction {
  return async (strings, ...params) => {
    const connection = await DuckDBConnection.create();
    await connection.run(`SET file_search_path=$0`, [context.cwd]);
    const date = new Date();
    let result: DuckDBResult;
    let rows: Record<string, Json>[];
    try {
      result = await connection.run(
        strings.reduce((p, c, i) => `${p}$${i - 1}${c}`),
        params
      );
      rows = await result.getRowObjectsJson();
    } finally {
      connection.disconnectSync();
    }
    return {
      rows,
      schema: getResultSchema(result),
      duration: Date.now() - +date,
      date
    };
  };
}

function getResultSchema(result: DuckDBResult): ColumnSchema[] {
  return result.columnNames().map((name, i) => ({name, type: getColumnType(result.columnType(i))}));
}

function getColumnType(type: DuckDBType): ColumnSchema["type"] {
  switch (type) {
    case BOOLEAN:
      return "boolean";
    case BIT:
    case TINYINT:
    case SMALLINT:
    case INTEGER:
    case UTINYINT:
    case USMALLINT:
    case UINTEGER:
    case VARINT:
      return "integer";
    case BIGINT:
    case UBIGINT:
    case HUGEINT:
    case UHUGEINT:
      return "bigint";
    case FLOAT:
    case DOUBLE:
      return "number";
    case TIMESTAMP:
    case TIMESTAMP_S:
    case TIMESTAMP_MS:
    case TIMESTAMP_NS:
    case TIMESTAMPTZ:
    case DATE:
      return "date";
    case TIME:
    case VARCHAR:
    case UUID:
      return "string";
    case BLOB:
      return "buffer";
    case INTERVAL:
      return "array";
    default:
      return "other";
  }
}
