// Small, in-memory test fixtures — generated on the fly rather than
// committed as binary files, so the repo doesn't carry a multi-MB "huge
// PDF" just to test a size-limit rejection path. Passed to Playwright's
// setInputFiles() via its {name, mimeType, buffer} form, which needs no
// file on disk at all.

// A minimal valid 1x1 transparent PNG — small enough to inline, and a
// real decodable image (drills.js's resizeImageFile draws it to a canvas,
// so it can't just be arbitrary bytes the way a "PDF" can).
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// drills.js only checks the File object's `type` and `size` for a PDF
// attachment — it never parses the bytes — so an arbitrary buffer of the
// requested size, tagged with the pdf MIME type, exercises the same code
// path as a real PDF would.
function pdfBuffer(sizeBytes) {
  return Buffer.alloc(sizeBytes, 'a');
}

module.exports = { PNG_1X1_BASE64, pdfBuffer };
