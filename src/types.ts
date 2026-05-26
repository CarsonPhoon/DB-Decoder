import { Database } from 'sql.js';

export interface TableData {
  columns: string[];
  values: any[][];
}

export interface QueryResult {
  data: TableData[];
  error?: string;
  timeMs: number;
}
