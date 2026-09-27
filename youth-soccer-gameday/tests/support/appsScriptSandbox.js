// Runs the ACTUAL generated Apps Script (buildAppsScript in cloudSync.js)
// in a real Node vm context, backed by minimal SpreadsheetApp/ContentService
// stubs — rather than a hand-written reimplementation of what the server is
// expected to do. A reimplementation only ever proves the mock agrees with
// itself; it can't catch the server's real logic drifting from the client's
// assumptions, which is exactly how the missing server-side games merge
// went untested for as long as it did.
const vm = require('vm');

function createAppsScriptSandbox(scriptSource) {
  const cells = { A1: '', B1: '' };
  const sheet = {
    getRange: (cell) => ({
      getValue: () => cells[cell],
      setValue: (v) => { cells[cell] = v; },
    }),
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
