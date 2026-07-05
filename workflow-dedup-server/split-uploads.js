// ============================================================================
//  "Split uploads" Code node (Seed workflow) — turn the form's multiple
//  uploaded PDFs into one item per file so the Write node can save each.
//  Each output item: binary `data` = the uploaded file, json.fileName = its name.
// ============================================================================
const item = $input.first();
const binary = item.binary || {};

const out = [];
for (const key of Object.keys(binary)) {
	const b = binary[key];
	const name = b.fileName || `${key}.pdf`;
	out.push({ json: { fileName: name }, binary: { data: b } });
}

if (out.length === 0) throw new Error('No files were uploaded to seed.');
return out;
