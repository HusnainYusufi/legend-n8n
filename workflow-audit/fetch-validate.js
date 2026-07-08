// ============================================================================
//  "Fetch & Validate" Code node — pull EVERY visible product from the Salla
//  storefront API (looping the cursor ourselves) and flag products whose price
//  doesn't match the shown discount %.
//  Output = one item per MISMATCH (json), each with a thumbnail URL.
//  Uses this.helpers.httpRequest (works in the Code node) — no HTTP-node
//  pagination, which errors on an empty next URL.
// ============================================================================
const helpers = this.helpers;

const STORE_ID = '2053013347'; // legendsleepsa.com
const TOLERANCE_SAR = 1; // flag if price is off from shown-% price by >= this

function num(v) {
	if (v == null) return null;
	const n = parseFloat(String(v).replace(/,/g, ''));
	return isNaN(n) ? null : n;
}
function round2(n) {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

let url = `https://api.salla.dev/store/v1/products?per_page=50`;
let totalProducts = 0;
let onSale = 0;
const out = [];
let guard = 0;

while (url && guard < 300) {
	guard++;
	const res = await helpers.httpRequest({
		method: 'GET',
		url,
		headers: { 'store-identifier': STORE_ID },
		json: true,
	});
	const products = Array.isArray(res.data) ? res.data : [];
	for (const p of products) {
		totalProducts++;
		if (!p.is_on_sale) continue;
		onSale++;

		const regular = num(p.regular_price);
		const current = num(p.price != null ? p.price : p.sale_price);
		const m = String(p.promotion_title ?? '').match(/([0-9]+)\s*%/);
		const shownPct = m ? parseInt(m[1], 10) : null;
		if (!(regular && current && shownPct)) continue;

		const expected = round2(regular * (1 - shownPct / 100));
		const actualPct = Math.round((1 - current / regular) * 1000) / 10;
		const diff = round2(current - expected);

		if (Math.abs(diff) >= TOLERANCE_SAR) {
			const image = typeof p.image === 'string' ? p.image : p.image && p.image.url;
			const purl = String(p.url ?? '');
			const codeM = purl.match(/\/(?:ar|en)\/([A-Za-z0-9]+)\/?$/);
			out.push({
				json: {
					code: codeM ? codeM[1] : '',
					url: purl,
					name: p.name,
					original: regular,
					current,
					shownPct,
					expected,
					actualPct,
					diff,
					thumbUrl: image
						? `https://cdn.salla.sa/cdn-cgi/image/width=120,quality=70/${image}`
						: null,
				},
			});
		}
	}
	url = res.cursor && res.cursor.next ? res.cursor.next : null;
}

// always emit at least one item so the report + email still run when clean
if (out.length === 0) {
	return [{ json: { _summary: true, mismatches: 0, totalProducts, onSale } }];
}
// stamp the summary onto the first item for the report/email
out[0].json._totalProducts = totalProducts;
out[0].json._onSale = onSale;
return out;
