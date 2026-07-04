// ============================================================================
//  "Dedup & Build" Code node — remove already-seen orders from today's PDF.
//  Input (via Merge, append):
//    - today's item  : has binary `Orders_PDF` + json.text[] (per-page text)
//    - previous items: json.text[] per page (from the downloaded Drive PDFs)
//  Page text is produced OUTSIDE the sandbox by n8n's "Extract from File" (PDF,
//  Join Pages = off) — pdf-parse/pdfjs can't run inside the Code-node sandbox.
//  Page removal uses pdf-lib's removePage(index) (a number — copyPages([...])
//  fails because the sandbox array isn't seen as an Array by pdf-lib).
//  Requires `pdf-lib` (bundled in the image, NODE_FUNCTION_ALLOW_EXTERNAL=...,pdf-lib).
// ============================================================================
const { PDFDocument } = require('pdf-lib');

const helpers = this.helpers;

const FORM_NODE = 'On form submission';
const PLAN_NODE = 'Plan';
const EMAIL_FIELD = 'Send To Email';
const TODAY_BINARY = 'Orders_PDF';

// Order number = 9-digit value starting 26/27 (Salla order ids). The Arabic
// "رقم الطلب" label doesn't survive n8n's glyph extraction, but this numeric
// pattern matches the order numbers exactly (verified against a full file).
function ordersFromPages(pages) {
	const groups = [];
	let cur = null;
	pages.forEach((p, idx) => {
		const m = String(p).match(/\b(2[6789]\d{7})\b/);
		const o = m ? m[1] : null;
		if (o) {
			cur = { order: o, pages: [idx] };
			groups.push(cur);
		} else if (cur) {
			cur.pages.push(idx); // continuation page of the current order
		} else {
			cur = { order: 'UNKNOWN_' + idx, pages: [idx] };
			groups.push(cur);
		}
	});
	return groups;
}

const items = $input.all();

// today's item is the only one carrying a PDF binary
let todayIdx = -1;
for (let i = 0; i < items.length; i++) {
	if (items[i].binary && items[i].binary[TODAY_BINARY]) {
		todayIdx = i;
		break;
	}
}
if (todayIdx === -1) throw new Error(`Could not find today's PDF (binary "${TODAY_BINARY}") in the input.`);
const todayItem = items[todayIdx];

// collect order numbers seen in the previous files (aligned to the Plan list)
const planFiles = $(PLAN_NODE).all().map((p) => p.json.fileName);
const seen = new Map(); // order -> fileName it first appeared in
let k = 0;
for (let i = 0; i < items.length; i++) {
	if (i === todayIdx) continue;
	const pages = items[i].json.text;
	const fileName = planFiles[k] || items[i].json.fileName || `file_${k}`;
	k++;
	if (!Array.isArray(pages)) continue;
	for (const g of ordersFromPages(pages)) {
		if (!String(g.order).startsWith('UNKNOWN_') && !seen.has(g.order)) seen.set(g.order, fileName);
	}
}

// today's orders → decide duplicates vs keep
const todayGroups = ordersFromPages(todayItem.json.text || []);
const duplicates = [];
const removePages = [];
for (const g of todayGroups) {
	if (seen.has(g.order)) {
		duplicates.push({ order: g.order, foundIn: seen.get(g.order) });
		removePages.push(...g.pages);
	}
}

// rebuild the PDF without the duplicate pages (remove descending)
const buf = await helpers.getBinaryDataBuffer(todayIdx, TODAY_BINARY);
const doc = await PDFDocument.load(buf);
removePages
	.slice()
	.sort((a, b) => b - a)
	.forEach((idx) => doc.removePage(idx));
const bytes = await doc.save();

const nextSeries = $(PLAN_NODE).first().json.nextSeries;
const recipient = $(FORM_NODE).first().json[EMAIL_FIELD];
const fileName = `${nextSeries}.pdf`;
const binary = await helpers.prepareBinaryData(Buffer.from(bytes), fileName, 'application/pdf');

return [
	{
		json: {
			fileName,
			nextSeries,
			recipient,
			totalOrdersToday: todayGroups.length,
			uniqueKept: todayGroups.length - duplicates.length,
			duplicatesRemoved: duplicates.length,
			comparedAgainstFiles: items.length - 1,
			duplicates, // [{ order, foundIn }]
		},
		binary: { data: binary },
	},
];
