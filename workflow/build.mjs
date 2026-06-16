// Generates ../orders-to-odoo-workflow.json from transform.js.
// Run:  node workflow/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const jsCode = readFileSync(join(here, 'transform.js'), 'utf8');

const workflow = {
	name: 'Salla → Odoo Import Sheet',
	active: false,
	settings: { executionOrder: 'v1' },
	nodes: [
		{
			parameters: {
				content:
					'## Salla → Odoo import sheet\n\n' +
					'1. **On form submission** – upload the raw Salla export, enter the **Series Number** and **Report Date**, and the email to send the result to.\n' +
					'2. **Extract from File** – n8n reads the rows out of the uploaded `.xlsx` (binary field `Orders_File`).\n' +
					'3. **Build Odoo File** – pure code: parses `skus_json`, maps payment terms & warehouse, appends the series number, adds shipping rows, flags missing SKUs in red, and builds the two-tab styled `.xlsx`.\n' +
					'4. **Send Email** – emails the generated file.\n\n' +
					'⚠️ Needs the `exceljs` module (bundled in the Docker image). Edit the `COLS` map at the top of **Build Odoo File** to match your real Salla column headers.',
				height: 360,
				width: 440,
				color: 4,
			},
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Read me first',
			type: 'n8n-nodes-base.stickyNote',
			typeVersion: 1,
			position: [-400, -40],
		},
		{
			parameters: {
				formTitle: 'Salla → Odoo Import',
				formDescription:
					'Upload the raw Salla orders export and enter today’s series number and date.',
				formFields: {
					values: [
						{
							fieldLabel: 'Orders File',
							fieldType: 'file',
							multipleFiles: false,
							acceptFileTypes: '.xlsx,.xls,.csv',
							requiredField: true,
						},
						{ fieldLabel: 'Series Number', fieldType: 'number', requiredField: true },
						{
							fieldLabel: 'Report Date',
							fieldType: 'text',
							placeholder: 'e.g. 15June2026 (used in the file name)',
							requiredField: true,
						},
						{ fieldLabel: 'Send To Email', fieldType: 'email', requiredField: true },
					],
				},
				options: {},
			},
			id: '22222222-2222-2222-2222-222222222222',
			name: 'On form submission',
			type: 'n8n-nodes-base.formTrigger',
			typeVersion: 2.6,
			position: [120, 160],
		},
		{
			parameters: {
				operation: 'xlsx',
				binaryPropertyName: 'Orders_File',
				options: {},
			},
			id: '33333333-3333-3333-3333-333333333333',
			name: 'Extract from File',
			type: 'n8n-nodes-base.extractFromFile',
			typeVersion: 1.1,
			position: [360, 160],
		},
		{
			parameters: { jsCode },
			id: '44444444-4444-4444-4444-444444444444',
			name: 'Build Odoo File',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [600, 160],
		},
		{
			parameters: {
				fromEmail: 'notifications.vmeals@gmail.com',
				toEmail: "={{ $('On form submission').item.json['Send To Email'] }}",
				subject:
					"=Salla → Odoo import — {{ $('On form submission').item.json['Report Date'] }}",
				emailFormat: 'html',
				html:
					'=<p>Attached is the generated Odoo import sheet.</p>' +
					'<p>Orders: {{ $json.orders }} &middot; Order lines: {{ $json.orderLines }}</p>',
				options: { fileAttachments: 'data' },
			},
			id: '66666666-6666-6666-6666-666666666666',
			name: 'Send Email',
			type: 'n8n-nodes-base.emailSend',
			typeVersion: 2.1,
			position: [840, 160],
		},
	],
	connections: {
		'On form submission': { main: [[{ node: 'Extract from File', type: 'main', index: 0 }]] },
		'Extract from File': { main: [[{ node: 'Build Odoo File', type: 'main', index: 0 }]] },
		'Build Odoo File': { main: [[{ node: 'Send Email', type: 'main', index: 0 }]] },
	},
};

const out = join(here, '..', 'orders-to-odoo-workflow.json');
writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log('Wrote', out);
