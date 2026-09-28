// Runs the ACTUAL generated Apps Script (buildAppsScript in cloudSync.js)
// in a real Node vm context, backed by minimal SpreadsheetApp/ContentService
// stubs — rather than a hand-written reimplementation of what the server is
// expected to do. A reimplementation only ever proves the mock agrees with
// itself; it can't catch the server's real logic drifting from the client's
// assumptions, which is exactly how the missing server-side games merge
// went untested for as long as it did.
const vm = require('vm');

function colLetter(col) {
  let s = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

function createAppsScriptSandbox(scriptSource) {
  const cells = {};
  // Real Apps Script's Range.getRange supports both the 'A1' string form
  // and a (row, column) numeric form — the real script uses both (fixed
  // cells like 'B1', and numbered rows for chunked storage), so this stub
  // needs to resolve either to the same underlying cell key.
  const sheet = {
    getRange: (a, b) => {
      const key = typeof a === 'string' ? a : `${colLetter(b)}${a}`;
      return {
        getValue: () => cells[key] || '',
        // Mirrors a real, hard Google Sheets limit — a cell refuses more
        // than 50,000 characters — so a test against this stub can prove
        // the storage code actually respects it, not just that the stub
        // happens to allow anything.
        setValue: (v) => {
          if (typeof v === 'string' && v.length > 50000) {
            throw new Error('This action would edit a cell with more than 50000 characters, which is not currently supported.');
          }
          cells[key] = v;
        },
      };
    },
  };
  const spreadsheet = {
    getSheetByName: () => sheet,
    insertSheet: () => sheet,
  };
  const sandbox = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => {
        const out = { getContent: () => text };
        out.setMimeType = () => out;
        return out;
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox);

  return {
    doGet(params) {
      return JSON.parse(sandbox.doGet({ parameter: params }).getContent());
    },
    doPost(params, body) {
      return JSON.parse(sandbox.doPost({ parameter: params, postData: { contents: JSON.stringify(body) } }).getContent());
    },
    _cells: cells,
  };
}

module.exports = { createAppsScriptSandbox };
