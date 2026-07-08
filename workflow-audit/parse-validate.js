// ============================================================================
//  "Parse & Validate" Code node — extract price/discount from each product page
//  and flag products whose price doesn't match the shown discount %.
//  Input  = items from "Fetch products" (each json.data = product page HTML,
//           json.url = the product URL).
//  Output = one item per MISMATCH, with the numbers + a small thumbnail URL.
// ============================================================================

// Flag a product if its price is off from the shown-% price by at least this.
const TOLERANCE_SAR = 1;

function num(s) {
	return s == null ? null : parseFloat(String(s).replace(/,/g, ''));
}

// The "Fetch products" HTTP node replaces json with the response body, so the
// product URL is taken from the "Extract product URLs" node, aligned by index.
let urlList = [];
try {
	urlList = $('Extract product URLs').all().map((x) => x.json.url);
} catch (e) {
	urlList = [];
}

const items = $input.all();
const out = [];
for (let i = 0; i < items.length; i++) {
	const it = items[i];
	const html = String(it.json.data ?? it.json.body ?? it.json.html ?? '');
	const url = String(it.json.url ?? urlList[i] ?? '');

	// original (crossed-out) price
	let m = html.match(/before-price[^>]*line-through"[^>]*>\s*([0-9,]+\.?[0-9]*)/i);
	const original = m ? num(m[1]) : null;

	// current (sale) price
	m = html.match(/sale_price:amount"\s+content="([0-9.]+)"/i);
	const current = m ? num(m[1]) : null;

	// shown discount %  (Arabic "خصم NN%")
	m = html.match(/خصم[\s ]*([0-9]+)\s*%/);
	const shownPct = m ? parseInt(m[1], 10) : null;

	// product name (JSON-LD)
	m = html.match(/"@type":"Product","name":"([^"]+)"/);
	const name = m ? m[1] : '';

	// product image (first Salla CDN image in the product JSON-LD)
	m = html.match(/"image":"(https:\\?\/\\?\/cdn\.salla\.sa[^"]+?\.(?:png|jpe?g|webp))/i);
	const image = m ? m[1].replace(/\\\//g, '/') : null;

	// short code from the URL (…/ar/CODE)
	m = url.match(/\/ar\/([A-Za-z0-9]+)\/?$/);
	const code = m ? m[1] : '';

	// only products that are actually on sale can be audited
	if (!(original && current && shownPct)) continue;

	const expected = Math.round(original * (1 - shownPct / 100) * 100) / 100;
	const actualPct = Math.round((1 - current / original) * 1000) / 10;
	const diff = Math.round((current - expected) * 100) / 100;

	if (Math.abs(diff) >= TOLERANCE_SAR) {
		out.push({
			json: {
				code,
				url,
				name,
				original,
				current,
				shownPct,
				expected, // what the price SHOULD be for the shown %
				actualPct, // the real discount % the price gives
				diff, // current - expected  (＋ = charged too much vs shown %)
				image,
				thumbUrl: image
					? `https://cdn.salla.sa/cdn-cgi/image/width=120,quality=70/${image}`
					: null,
			},
		});
	}
}

return out;
