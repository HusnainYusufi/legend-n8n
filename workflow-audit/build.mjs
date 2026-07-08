// Generates ../price-audit-workflow.json from the three code files.
// Run:  node workflow-audit/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const extractCode = readFileSync(join(here, 'extract-urls.js'), 'utf8');
const parseCode = readFileSync(join(here, 'parse-validate.js'), 'utf8');
const pdfCode = readFileSync(join(here, 'build-pdf.js'), 'utf8');

const SITEMAP = 'https://legendsleepsa.com/ar/sitemap-2.xml';

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
					'2. **Get sitemap** → **Extract product URLs** – every product on the store (from the sitemap).\n' +
					'3. **Fetch products** – downloads each product page (batched).\n' +
					'4. **Parse & Validate** – reads original price, current price, shown discount %; flags products whose price ≠ original×(1−shown%).\n' +
					'5. **Fetch thumbnails** – small product images for the report.\n' +
					'6. **Build PDF** – report of mismatches (image, prices, what the price *should* be).\n' +
					'7. **Send Email** – emails the PDF.\n\n' +
					'⚠️ Needs `pdf-lib` in the image. Adjust `TOLERANCE_SAR` in **Parse & Validate** to change what counts as a mismatch.',
				height: 380,
				width: 480,
				color: 6,
			},
			id: 'a0',
			name: 'Read me first',
			type: 'n8n-nodes-base.stickyNote',
			typeVersion: 1,
			position: [-40, -280],
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
				url: SITEMAP,
				options: { response: { response: { responseFormat: 'text' } } },
			},
			id: 'a2',
			name: 'Get sitemap',
			type: 'n8n-nodes-base.httpRequest',
			typeVersion: 4.4,
			position: [180, 120],
		},
		{
			parameters: { jsCode: extractCode },
			id: 'a3',
			name: 'Extract product URLs',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [400, 120],
		},
		{
			parameters: {
				url: '={{ $json.url }}',
				options: {
					response: { response: { responseFormat: 'text' } },
					batching: { batch: { batchSize: 10, batchInterval: 200 } },
				},
			},
			id: 'a4',
			name: 'Fetch products',
			type: 'n8n-nodes-base.httpRequest',
			typeVersion: 4.4,
			position: [620, 120],
			onError: 'continueRegularOutput',
		},
		{
			parameters: { jsCode: parseCode },
			id: 'a5',
			name: 'Parse & Validate',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [840, 120],
		},
		{
			parameters: {
				url: '={{ $json.thumbUrl }}',
				options: {
					response: { response: { responseFormat: 'file', outputPropertyName: 'data' } },
					batching: { batch: { batchSize: 10, batchInterval: 100 } },
				},
			},
			id: 'a6',
			name: 'Fetch thumbnails',
			type: 'n8n-nodes-base.httpRequest',
			typeVersion: 4.4,
			position: [1060, 120],
			onError: 'continueRegularOutput',
		},
		{
			parameters: { jsCode: pdfCode },
			id: 'a7',
			name: 'Build PDF',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [1280, 120],
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
					'<p>Each listed product’s price does not equal original × (1 − shown %). The PDF shows what each price should be.</p>',
				options: { fileAttachments: 'data' },
			},
			id: 'a8',
			name: 'Send Email',
			type: 'n8n-nodes-base.emailSend',
			typeVersion: 2.1,
			position: [1500, 120],
		},
	],
	connections: {
		'On form submission': { main: [[{ node: 'Get sitemap', type: 'main', index: 0 }]] },
		'Get sitemap': { main: [[{ node: 'Extract product URLs', type: 'main', index: 0 }]] },
		'Extract product URLs': { main: [[{ node: 'Fetch products', type: 'main', index: 0 }]] },
		'Fetch products': { main: [[{ node: 'Parse & Validate', type: 'main', index: 0 }]] },
		'Parse & Validate': { main: [[{ node: 'Fetch thumbnails', type: 'main', index: 0 }]] },
		'Fetch thumbnails': { main: [[{ node: 'Build PDF', type: 'main', index: 0 }]] },
		'Build PDF': { main: [[{ node: 'Send Email', type: 'main', index: 0 }]] },
	},
};

writeFileSync(join(here, '..', 'price-audit-workflow.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log('Wrote price-audit-workflow.json');
