// ============================================================================
//  "Select recent" Code node — pick the most recent history PDFs to compare.
//  Input  = every PDF read from the server folder (binary `data`, each file's
//           name in binary.data.fileName), from "Read folder".
//  Output = the newest COMPARE_COUNT items, each carrying its binary plus
//           json { fileName, series, nextSeries } for the next steps.
// ============================================================================
const COMPARE_COUNT = 20;
const FALLBACK_NEXT = 1124;

const items = $input.all();

const parsed = [];
for (const it of items) {
	const name = (it.binary && it.binary.data && it.binary.data.fileName) || it.json.fileName || '';
	const m = String(name).match(/(\d+)\s*\.pdf$/i);
	if (m) parsed.push({ it, name, series: parseInt(m[1], 10) });
}

parsed.sort((a, b) => b.series - a.series); // newest first

const maxSeries = parsed.length ? parsed[0].series : FALLBACK_NEXT - 1;
const nextSeries = maxSeries + 1;

return parsed.slice(0, COMPARE_COUNT).map((x) => ({
	json: { fileName: x.name, series: x.series, nextSeries },
	binary: x.it.binary,
}));
