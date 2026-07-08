// Generates ../price-audit-workflow.json from fetch-validate.js + build-pdf.js.
// Run:  node workflow-audit/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fetchCode = readFileSync(join(here, 'fetch-validate.js'), 'utf8');
const pdfCode = readFileSync(join(here, 'build-pdf.js'), 'utf8');

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
					'2. **Fetch & Validate** – pure code: loops the Salla storefront API (all visible products, `store-identifier` header, cursor pagination) and flags products where price ≠ regular×(1−shown %). Uses `this.helpers.httpRequest`.\n' +
					'3. **Build PDF** – fetches a thumbnail for each mismatch and builds the report (image, prices, what the price *should* be).\n' +
					'4. **Send Email** – emails the PDF.\n\n' +
					'⚠️ Needs `pdf-lib` in the image. Change `TOLERANCE_SAR`/`STORE_ID` in **Fetch & Validate**. Audits customer-visible products; hidden/draft need the Salla admin API.',
				height: 340,
				width: 480,
				color: 6,
			},
			id: 'a0',
			name: 'Read me first',
			type: 'n8n-nodes-base.stickyNote',
			typeVersion: 1,
			position: [-40, -240],
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
			parameters: { jsCode: fetchCode },
			id: 'a2',
			name: 'Fetch & Validate',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [200, 120],
		},
		{
			parameters: { jsCode: pdfCode },
			id: 'a3',
			name: 'Build PDF',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [440, 120],
		},
		{
			parameters: {
				fromEmail: 'notifications.vmeals@gmail.com',
				toEmail: '={{ $json.recipient }}',
				subject: '=Legend Sleep discount audit — {{ $json.mismatches }} mismatches',
				emailFormat: 'html',
				html:
					'=<p>Attached is the discount audit for legendsleepsa.com.</p>' +
					'<p><b>Products with a price / discount-% mismatch: {{ $json.mismatches }}</b>' +
					' (of {{ $json.onSale }} on-sale / {{ $json.totalProducts }} products)</p>' +
					'<p>Each listed product’s price does not equal regular × (1 − shown %). The PDF shows what each price should be.</p>',
				options: { fileAttachments: 'data' },
			},
			id: 'a4',
			name: 'Send Email',
			type: 'n8n-nodes-base.emailSend',
			typeVersion: 2.1,
			position: [680, 120],
		},
	],
	connections: {
		'On form submission': { main: [[{ node: 'Fetch & Validate', type: 'main', index: 0 }]] },
		'Fetch & Validate': { main: [[{ node: 'Build PDF', type: 'main', index: 0 }]] },
		'Build PDF': { main: [[{ node: 'Send Email', type: 'main', index: 0 }]] },
	},
};

writeFileSync(join(here, '..', 'price-audit-workflow.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log('Wrote price-audit-workflow.json');
