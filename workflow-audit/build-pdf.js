// ============================================================================
//  "Build PDF" Code node — render the mismatch report as a PDF with thumbnails.
//  Fields come from "Parse & Validate"; the thumbnails come from this node's
//  input (the "Fetch thumbnails" HTTP node, binary `data`), aligned by index.
//  Requires `pdf-lib`. Uses only Latin/number text (pdf-lib can't shape Arabic),
//  so products are identified by their code + image + link.
// ============================================================================
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const helpers = this.helpers;

const rows = $('Parse & Validate').all().map((i) => i.json);
const thumbCount = $input.all().length;

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

const W = 595, H = 842, M = 40, ROW = 78;
let page, y;
function newPage() {
	page = doc.addPage();
	page.setSize(W, H);
	y = H - M;
}
function text(s, x, yy, size, f, color) {
	page.drawText(String(s), { x, y: yy, size, font: f || font, color: color || rgb(0, 0, 0) });
}
newPage();

// header
text('Legend Sleep - Discount Audit', M, y, 18, bold, rgb(0.12, 0.12, 0.42));
y -= 22;
text(`Products with a price / discount-% mismatch: ${rows.length}`, M, y, 11, font);
y -= 10;
page.drawRectangle({ x: M, y, width: W - 2 * M, height: 1, color: rgb(0.6, 0.6, 0.6) });
y -= 18;

for (let i = 0; i < rows.length; i++) {
	const r = rows[i];
	if (y < M + ROW) newPage();

	// thumbnail (aligned by index; skip if fetch failed or format unknown)
	if (i < thumbCount) {
		try {
			const buf = await helpers.getBinaryDataBuffer(i, 'data');
			if (buf && buf.length > 100) {
				const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
				const img = isJpg ? await doc.embedJpg(buf) : await doc.embedPng(buf);
				page.drawImage(img, { x: M, y: y - 58, width: 58, height: 58 });
			}
		} catch (e) {
			/* no image for this row */
		}
	}

	const tx = M + 72;
	const sign = r.diff > 0 ? '+' : '';
	text(r.code, tx, y - 8, 12, bold);
	text(`Original ${r.original}   Current ${r.current}   Shown ${r.shownPct}%`, tx, y - 24, 10, font);
	text(
		`Should be ${r.expected}   Real ${r.actualPct}%   Off by ${sign}${r.diff} SAR`,
		tx,
		y - 39,
		10,
		bold,
		rgb(0.8, 0, 0),
	);
	text(r.url, tx, y - 54, 8, font, rgb(0.3, 0.3, 0.7));

	y -= ROW;
	page.drawRectangle({ x: M, y: y + 8, width: W - 2 * M, height: 0.5, color: rgb(0.85, 0.85, 0.85) });
}

const fileName = 'discount-audit.pdf';
const bytes = await doc.save();
const bin = await helpers.prepareBinaryData(Buffer.from(bytes), fileName, 'application/pdf');

let recipient = '';
try {
	recipient = $('On form submission').first().json['Send To Email'];
} catch (e) {
	/* scheduled run without a form */
}

return [{ json: { mismatches: rows.length, fileName, recipient }, binary: { data: bin } }];
