import { google } from 'googleapis';

const COL_COUNT = 7;

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

/** Строка A:G: недостающие колонки — пустые строки (индексы совпадают с A..G). */
function padRowToAG(row) {
  const r = [...(row || [])];
  while (r.length < COL_COUNT) r.push('');
  return r.slice(0, COL_COUNT);
}

/**
 * Последняя строка (1-based) в A:G, где есть хотя бы одно непустое значение.
 */
async function nextDataRow(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRangeA1(sheetName, 'A:G'),
    majorDimension: 'ROWS',
  });
  const values = res.data.values || [];
  let last = 0;
  for (let i = 0; i < values.length; i++) {
    if (rowHasAnyValue(padRowToAG(values[i]))) last = i + 1;
  }
  return last + 1;
}

async function getSheetId(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  const id = sheet?.properties?.sheetId;
  if (id === undefined || id === null) {
    throw new Error(`Лист не найден: "${title}"`);
  }
  return id;
}

/**
 * Запись строки в колонки A–G по индексам сетки (обходит сбои values.append / update при «кривых» строках).
 */
async function writeRowAG(sheets, spreadsheetId, sheetId, rowIndex0, row) {
  const cells = padRowToAG(row).map((cell) => ({
    userEnteredValue: { stringValue: String(cell ?? '') },
  }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: rowIndex0,
              endRowIndex: rowIndex0 + 1,
              startColumnIndex: 0,
              endColumnIndex: COL_COUNT,
            },
            rows: [{ values: cells }],
            fields: 'userEnteredValue',
          },
        },
      ],
    },
  });
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
  const sheetName = (process.env.SHEET_NAME || 'Лист1').trim();

  if (!keyPath || !spreadsheetId) {
    console.warn('[sheets] Пропуск записи: нет GOOGLE_SERVICE_ACCOUNT_PATH или SPREADSHEET_ID');
    return { ok: false, reason: 'not_configured' };
  }

  const row = padRowToAG([
    name,
    contact,
    levelLabel || '',
    goal || '',
    preferredTime || '',
    comment || '',
    dateStr,
  ]);

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = await getSheetId(sheets, spreadsheetId, sheetName);
    const nextRow = await nextDataRow(sheets, spreadsheetId, sheetName);
    await writeRowAG(sheets, spreadsheetId, sheetId, nextRow - 1, row);
    return { ok: true };
  } catch (e) {
    console.error('[sheets]', e.message);
    return { ok: false, reason: e.message };
  }
}
