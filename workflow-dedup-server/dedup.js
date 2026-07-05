// ============================================================================
//  "Dedup & Build" Code node (server-storage version).
//  Input (via Merge, append):
//    - today's item  : binary `Orders_PDF` + json.text[] (per-page text)
//    - previous items: json.text[] + json.fileName + json.nextSeries
//  PDF text is produced by the built-in "Extract from File" (PDF, Join Pages
//  off) OUTSIDE the sandbox. Page removal uses pdf-lib removePage(index).
//  Requires `pdf-lib` (NODE_FUNCTION_ALLOW_EXTERNAL=...,pdf-lib).
// ============================================================================
const { PDFDocument } = require('pdf-lib');

const helpers = this.helpers;

const FORM_NODE = 'On form submission';
const EMAIL_FIELD = 'Send To Email';
const TODAY_BINARY = 'Orders_PDF';

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
			cur.pages.push(idx);
		} else {
			cur = { order: 'UNKNOWN_' + idx, pages: [idx] };
			groups.push(cur);
		}
	});
	return groups;
}

const items = $input.all();

// today's item = the only one carrying a PDF binary
let todayIdx = -1;
for (let i = 0; i < items.length; i++) {
	if (items[i].binary && items[i].binary[TODAY_BINARY]) {
		todayIdx = i;
		break;
	}
}
if (todayIdx === -1) throw new Error(`Could not find today's PDF (binary "${TODAY_BINARY}") in the input.`);
const todayItem = items[todayIdx];

// collect orders already seen in the previous files
const seen = new Map(); // order -> fileName
let nextSeries = null;
for (let i = 0; i < items.length; i++) {
	if (i === todayIdx) continue;
	const j = items[i].json || {};
	if (nextSeries === null && j.nextSeries) nextSeries = j.nextSeries;
	const pages = j.text;
	const fileName = j.fileName || `file_${i}`;
	if (!Array.isArray(pages)) continue;
	for (const g of ordersFromPages(pages)) {
		if (!String(g.order).startsWith('UNKNOWN_') && !seen.has(g.order)) seen.set(g.order, fileName);
	}
}
if (!nextSeries) nextSeries = 1124; // fallback if no previous files

// today's orders → duplicates vs keep
const todayGroups = ordersFromPages(todayItem.json.text || []);
const duplicates = [];
const removePages = [];
for (const g of todayGroups) {
	if (seen.has(g.order)) {
		duplicates.push({ order: g.order, foundIn: seen.get(g.order) });
		removePages.push(...g.pages);
	}
}

// rebuild without duplicate pages
const buf = await helpers.getBinaryDataBuffer(todayIdx, TODAY_BINARY);
const doc = await PDFDocument.load(buf);
removePages
	.slice()
	.sort((a, b) => b - a)
	.forEach((idx) => doc.removePage(idx));
const bytes = await doc.save();

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
			duplicates,
		},
		binary: { data: binary },
	},
];
