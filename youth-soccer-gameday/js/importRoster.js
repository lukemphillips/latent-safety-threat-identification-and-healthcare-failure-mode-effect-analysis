// Bulk roster import from a CSV or Excel (.xlsx/.xls) file.
// Column headers are matched loosely (case/space/punctuation-insensitive)
// against a set of common aliases, so exports from Google Sheets, Excel,
// or a club's own template all have a decent chance of lining up.

const HEADER_ALIASES = {
  name: ['name', 'player', 'playername', 'fullname'],
  jerseyNumber: ['jersey', 'jerseynumber', 'jerseyno', 'number', 'no', 'squadnumber'],
  positions: ['position', 'positions', 'pos', 'preferredposition', 'preferredpositions'],
  skillStream: ['stream', 'streamingclassification', 'classification', 'skillstream', 'group', 'tier'],
  guardianName: ['guardian', 'guardianname', 'parent', 'parentname'],
  guardianPhone: ['guardianphone', 'phone', 'parentphone', 'contact', 'contactnumber', 'mobile'],
};

const VALID_POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const VALID_STREAMS = ['A', 'B', 'C', 'D'];

function normalizeHeaderKey(header) {
  return String(header ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapHeaderRow(headerRow) {
  return headerRow.map((h) => {
    const key = normalizeHeaderKey(h);
    const match = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(key));
    return match ? match[0] : null;
  });
}

function rowsToObjects(arrayRows) {
  const rows = arrayRows.filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''));
  if (rows.length < 2) return [];
  const headerMap = mapHeaderRow(rows[0]);
  if (!headerMap.includes('name')) return [];
  return rows.slice(1).map((r) => {
    const obj = {};
    headerMap.forEach((canonical, idx) => {
      if (canonical) obj[canonical] = r[idx];
    });
    return obj;
  });
}

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // ignore, paired \n handles the line break
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function splitPositions(raw) {
  if (!raw) return [];
  const tokens = String(raw).split(/[\/,+&\s]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
  return [...new Set(tokens.filter((t) => VALID_POSITIONS.includes(t)))];
}

function normalizeStream(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  return VALID_STREAMS.includes(s) ? s : null;
}

function normalizePlayerRow(raw) {
  const name = String(raw.name ?? '').trim();
  const jerseyRaw = String(raw.jerseyNumber ?? '').trim();
  const jerseyNumber = jerseyRaw && !Number.isNaN(Number(jerseyRaw)) ? Number(jerseyRaw) : null;
  return {
    name,
    jerseyNumber,
    positions: splitPositions(raw.positions),
    skillStream: normalizeStream(raw.skillStream),
    guardianName: String(raw.guardianName ?? '').trim(),
    guardianPhone: String(raw.guardianPhone ?? '').trim(),
    positionsRaw: raw.positions ? String(raw.positions).trim() : '',
    streamRaw: raw.skillStream ? String(raw.skillStream).trim() : '',
  };
}

let xlsxLoadPromise = null;

export function ensureXlsxLoaded() {
  if (window.XLSX) return Promise.resolve(true);
  if (xlsxLoadPromise) return xlsxLoadPromise;
  xlsxLoadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve(Boolean(window.XLSX));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return xlsxLoadPromise;
}

export async function parseRosterFile(file) {
  const filename = file.name.toLowerCase();
  let arrayRows;

  if (filename.endsWith('.csv') || file.type === 'text/csv') {
    arrayRows = parseCsvText(await file.text());
  } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    const loaded = await ensureXlsxLoaded();
    if (!loaded) {
      return { rows: [], error: 'Could not load the Excel file reader (needs an internet connection). Try again, or save the file as CSV instead.' };
    }
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    arrayRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      .map((r) => r.map((cell) => String(cell ?? '')));
  } else {
    return { rows: [], error: 'Unsupported file type. Please choose a .csv or .xlsx file.' };
  }

  const objects = rowsToObjects(arrayRows);
  if (!objects.length) {
    return { rows: [], error: 'Couldn’t find a "Name" column in the first row. Make sure row 1 has headers and one of them is Name.' };
  }
  return { rows: objects.map(normalizePlayerRow) };
}
