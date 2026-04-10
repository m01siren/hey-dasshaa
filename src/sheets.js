import { google } from 'googleapis';

/**
 * Добавляет строку в структуре A:G:
 * A имя, B контакт, C уровень, D цель, E удобное время, F комментарий, G дата заявки
 */
export async function appendApplicationRow({
  name,
  contact,
  levelLabel,
  goal,
  preferredTime,
  comment,
  dateStr,
}) {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME || 'Лист1';

  if (!keyPath || !spreadsheetId) {
    console.warn('[sheets] Пропуск записи: нет GOOGLE_SERVICE_ACCOUNT_PATH или SPREADSHEET_ID');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[name, contact, levelLabel || '', goal || '', preferredTime || '', comment || '', dateStr]],
      },
    });
    return { ok: true };
  } catch (e) {
    console.error('[sheets]', e.message);
    return { ok: false, reason: e.message };
  }
}
