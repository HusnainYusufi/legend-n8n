// ============================================================================
//  "Extract product URLs" Code node — parse the product sitemap and output one
//  item per product URL. Products are the /ar/<shortcode> pages.
//  Input = the sitemap XML (from "Get sitemap", json.data).
// ============================================================================
const items = $input.all();
const xml = String(items[0].json.data ?? items[0].json.body ?? '');

const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
	.map((m) => m[1].trim())
	// product short-code pages look like https://legendsleepsa.com/ar/jZxrezB
	.filter((u) => /\/ar\/[A-Za-z0-9]{5,}\/?$/.test(u));

return urls.map((u) => ({ json: { url: u } }));
