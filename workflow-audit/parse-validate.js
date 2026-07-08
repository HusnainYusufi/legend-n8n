// ============================================================================
//  "Parse & Validate" Code node — read products from the Salla storefront API
//  and flag those whose price doesn't match the shown discount %.
//  Input  = items from "Fetch products" (each json = one API page: {data:[...]}).
//  Output = one item per MISMATCH, with the numbers + a small thumbnail URL.
// ============================================================================

// Flag a product if its price is off from the shown-% price by at least this.
const TOLERANCE_SAR = 1;

function num(v) {
	if (v == null) return null;
	const n = parseFloat(String(v).replace(/,/g, ''));
	return isNaN(n) ? null : n;
}
function round2(n) {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

const out = [];
for (const it of $input.all()) {
	const products = Array.isArray(it.json.data) ? it.json.data : [];
	for (const p of products) {
		if (!p.is_on_sale) continue;

		const regular = num(p.regular_price);
		const current = num(p.price != null ? p.price : p.sale_price);

		// shown discount % from "promotion_title" e.g. "خصم 25%"
		const m = String(p.promotion_title ?? '').match(/([0-9]+)\s*%/);
		const shownPct = m ? parseInt(m[1], 10) : null;

		if (!(regular && current && shownPct)) continue;

		const expected = round2(regular * (1 - shownPct / 100));
		const actualPct = Math.round((1 - current / regular) * 1000) / 10;
		const diff = round2(current - expected);

		if (Math.abs(diff) >= TOLERANCE_SAR) {
			const image = typeof p.image === 'string' ? p.image : p.image && p.image.url;
			const url = String(p.url ?? '');
			const codeM = url.match(/\/(?:ar|en)\/([A-Za-z0-9]+)\/?$/);
			out.push({
				json: {
					id: p.id,
					code: codeM ? codeM[1] : '',
					url,
					name: p.name,
					original: regular,
					current,
					shownPct,
					expected, // what the price SHOULD be for the shown %
					actualPct, // the real discount % the price gives
					diff, // current - expected
					image: image || null,
					thumbUrl: image
						? `https://cdn.salla.sa/cdn-cgi/image/width=120,quality=70/${image}`
						: null,
				},
			});
		}
	}
}

return out;
