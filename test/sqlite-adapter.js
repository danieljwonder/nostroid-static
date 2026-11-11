import { DatabaseSync } from 'node:sqlite';
/** node:sqlite -> the exec(sql, ...params) => rows[] shape used by RelayStore and SiteCache. */
export function memorySql() {
  const db = new DatabaseSync(':memory:');
  return (sql, ...params) => {
    const trimmed = sql.trim();
    if (trimmed.includes(';') && !/^SELECT/i.test(trimmed)) { db.exec(sql); return []; }
    const stmt = db.prepare(sql);
    if (/^\s*(SELECT|WITH)/i.test(sql)) return stmt.all(...params).map(r => ({ ...r }));
    stmt.run(...params);
    return [];
  };
}
