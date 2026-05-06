import db from '../db/database';

export class AppSettingsModel {
  static get(key: string): string | undefined {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row?.value;
  }

  static set(key: string, value: string): void {
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  }
}
