// Generates ../price-audit-workflow.json from parse-validate.js + build-pdf.js.
// Run:  node workflow-audit/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const parseCode = readFileSync(join(here, 'parse-validate.js'), 'utf8');
const pdfCode = readFileSync(join(here, 'build-pdf.js'), 'utf8');

// Salla store id for legendsleepsa.com (from the storefront twilight::init data).
const STORE_ID = '2053013347';

const workflow = {
	name: 'Legend Sleep — Discount Price Audit',
	active: false,
	settings: { executionOrder: 'v1' },
	nodes: [
		{
			parameters: {
				content:
					'## Discount price audit\n\n' +
					'1. **On form submission** – enter the recipient email.\n' +
					'2. **Fetch products** – pulls every visible product from the Salla storefront API (cursor-paginated, `store-identifier` header — no auth token).\n' +
					'3. **Parse & Validate** – reads regular price, price, and shown discount % (`promotion_title`); flags products where price ≠ regular×(1−shown%).\n' +
					'4. **Fetch thumbnails** – small product images for the report.\n' +
					'5. **Build PDF** – report of mismatches (image, prices, what the price *should* be).\n' +
					'6. **Send Email** – emails the PDF.\n\n' +
					'⚠️ Needs `pdf-lib` in the image. Adjust `TOLERANCE_SAR` in **Parse & Validate**. This audits customer-visible products; hidden/draft products need the Salla admin API (token).',
				height: 400,
				width: 480,
				color: 6,
			},
			id: 'a0',
			name: 'Read me first',
			type: 'n8n-nodes-base.stickyNote',
			typeVersion: 1,
			position: [-40, -300],
		},
		{
			parameters: {
				formTitle: 'Legend Sleep — Discount Audit',
				formDescription: 'Run a full price/discount audit of the store and email the report.',
				formFields: {
					values: [{ fieldLabel: 'Send To Email', fieldType: 'email', requiredField: true }],
				},
				options: {},
			},
			id: 'a1',
			name: 'On form submission',
			type: 'n8n-nodes-base.formTrigger',
			typeVersion: 2.6,
			position: [-40, 120],
		},
		{
			parameters: {
				url: 'https://api.salla.dev/store/v1/products?per_page=50',
				sendHeaders: true,
				headerParameters: { parameters: [{ name: 'store-identifier', value: STORE_ID }] },
				options: {
					response: { response: { responseFormat: 'json' } },
					pagination: {
						pagination: {
							paginationMode: 'responseContainsNextURL',
							nextURL: '={{ $response.body.cursor.next }}',
							limitPagesFetched: false,
						},
					},
				},
			},
			id: 'a2',
			name: 'Fetch products',
			type: 'n8n-nodes-base.httpRequest',
			typeVersion: 4.4,
			position: [200, 120],
			onError: 'continueRegularOutput',
		},
		{
			parameters: { jsCode: parseCode },
			id: 'a3',
			name: 'Parse & Validate',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [420, 120],
		},
		{
			parameters: {
				url: '={{ $json.thumbUrl }}',
				options: {
					response: { response: { responseFormat: 'file', outputPropertyName: 'data' } },
					batching: { batch: { batchSize: 10, batchInterval: 100 } },
				},
			},
			id: 'a4',
			name: 'Fetch thumbnails',
			type: 'n8n-nodes-base.httpRequest',
			typeVersion: 4.4,
			position: [640, 120],
			onError: 'continueRegularOutput',
		},
		{
			parameters: { jsCode: pdfCode },
			id: 'a5',
			name: 'Build PDF',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [860, 120],
		},
		{
			parameters: {
				fromEmail: 'notifications.vmeals@gmail.com',
				toEmail: '={{ $json.recipient }}',
				subject: '=Legend Sleep discount audit — {{ $json.mismatches }} mismatches',
				emailFormat: 'html',
				html:
					'=<p>Attached is the discount audit for legendsleepsa.com.</p>' +
					'<p><b>Products with a price / discount-% mismatch: {{ $json.mismatches }}</b></p>' +
					'<p>Each listed product’s price does not equal regular × (1 − shown %). The PDF shows what each price should be.</p>',
				options: { fileAttachments: 'data' },
			},
			id: 'a6',
			name: 'Send Email',
			type: 'n8n-nodes-base.emailSend',
			typeVersion: 2.1,
			position: [1080, 120],
		},
	],
	connections: {
		'On form submission': { main: [[{ node: 'Fetch products', type: 'main', index: 0 }]] },
		'Fetch products': { main: [[{ node: 'Parse & Validate', type: 'main', index: 0 }]] },
		'Parse & Validate': { main: [[{ node: 'Fetch thumbnails', type: 'main', index: 0 }]] },
		'Fetch thumbnails': { main: [[{ node: 'Build PDF', type: 'main', index: 0 }]] },
		'Build PDF': { main: [[{ node: 'Send Email', type: 'main', index: 0 }]] },
	},
};

writeFileSync(join(here, '..', 'price-audit-workflow.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log('Wrote price-audit-workflow.json');
