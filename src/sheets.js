import { google } from 'googleapis';

/**
 * Имя листа в A1-нотации (кавычки, если нужно по правилам Google).
 */
function sheetRangeA1(sheetName, a1Rest) {
  const n = String(sheetName);
  const quoted = /^[a-zA-Z0-9_]+$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`;
  return `${quoted}!${a1Rest}`;
}

function rowHasAnyValue(row) {
  if (!row || !row.length) return false;
  return row.some((cell) => cell != null && String(cell).trim() !== '');
}

/**
 * Последняя строка (1-based) в A:G, где есть хотя бы одно непустое значение.
 * Не используем values.append: при «дырке» в строке (пустой F при заполненной G)
 * API сдвигает следующую запись вправо (часто начиная с G).
 */
async function nextDataRow(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRangeA1(sheetName, 'A:G'),
  });
  const values = res.data.values || [];
  let last = 0;
  for (let i = 0; i < values.length; i++) {
    if (rowHasAnyValue(values[i])) last = i + 1;
  }
  return last + 1;
}

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

  const row = [
    name,
    contact,
    levelLabel || '',
    goal || '',
    preferredTime || '',
    comment || '',
    dateStr,
  ];

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const nextRow = await nextDataRow(sheets, spreadsheetId, sheetName);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetRangeA1(sheetName, `A${nextRow}:G${nextRow}`),
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    return { ok: true };
  } catch (e) {
    console.error('[sheets]', e.message);
    return { ok: false, reason: e.message };
  }
}
