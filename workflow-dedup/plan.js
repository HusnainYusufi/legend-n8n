// ============================================================================
//  "Plan" Code node — decide the next series number and which files to compare.
//  Input  = the file list from the Google Drive "Search" node (folder contents).
//  Output = up to 20 items, each { fileId, fileName, series, nextSeries } for
//           the most recent files, to be downloaded and compared against.
// ============================================================================

// How many previous files to compare against.
const COMPARE_COUNT = 20;
// Fallback next-series if the Drive folder is empty (shouldn't happen normally).
const FALLBACK_NEXT = 1124;

const files = $input.all().map((i) => i.json);

// Parse the series number out of names like "1123.pdf".
const parsed = [];
for (const f of files) {
	const name = String(f.name ?? '');
	const m = name.match(/(\d+)\s*\.pdf$/i);
	if (m) parsed.push({ id: f.id, name, series: parseInt(m[1], 10) });
}

parsed.sort((a, b) => b.series - a.series); // newest first

const maxSeries = parsed.length ? parsed[0].series : FALLBACK_NEXT - 1;
const nextSeries = maxSeries + 1;

const recent = parsed.slice(0, COMPARE_COUNT);

if (recent.length === 0) {
	// No previous files: nothing to compare, but still emit one planning item.
	return [{ json: { fileId: null, fileName: null, series: null, nextSeries } }];
}

return recent.map((f) => ({
	json: { fileId: f.id, fileName: f.name, series: f.series, nextSeries },
}));
