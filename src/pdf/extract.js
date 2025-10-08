// Stub for PDF extraction. Replace with real PDF text extraction later.
export async function parsePdf(buffer) {
  return {
    meta: {pageCount: 1}, textByPage: [buffer.toString('utf8')]
  };
}
