// Generates ../salla-seed-workflow.json and ../salla-dedup-server-workflow.json
// Run:  node workflow-dedup-server/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const selectCode = readFileSync(join(here, 'select-recent.js'), 'utf8');
const dedupCode = readFileSync(join(here, 'dedup.js'), 'utf8');
const splitCode = readFileSync(join(here, 'split-uploads.js'), 'utf8');

// Server storage folder (persisted via a volume mounted at /home/node/.n8n-files).
const FOLDER = '/home/node/.n8n-files/salla';

// ── Seed workflow (run once): upload all previous PDFs → save to the folder ──
const seed = {
	name: 'Salla Dedup — Seed history (run once)',
	active: false,
	settings: { executionOrder: 'v1' },
	nodes: [
		{
			parameters: {
				content:
					'## Seed history — run ONCE\n\nUpload all your existing series PDFs (1104.pdf … 1123.pdf). They are saved to\n`' +
					FOLDER +
					'` on the server so the daily workflow can compare against them.\nAfter this, use the **daily** workflow and never seed again.',
				height: 220,
				width: 460,
				color: 4,
			},
			id: 's0',
			name: 'Read me first',
			type: 'n8n-nodes-base.stickyNote',
			typeVersion: 1,
			position: [-40, -220],
		},
		{
			parameters: {
				formTitle: 'Seed Salla history',
				formDescription: 'Upload ALL your previous order PDFs once. Filenames must be like 1123.pdf.',
				formFields: {
					values: [
						{ fieldLabel: 'Previous PDFs', fieldType: 'file', multipleFiles: true, acceptFileTypes: '.pdf', requiredField: true },
					],
				},
				options: {},
			},
			id: 's1',
			name: 'On form submission',
			type: 'n8n-nodes-base.formTrigger',
			typeVersion: 2.6,
			position: [180, 40],
		},
		{
			parameters: { jsCode: splitCode },
			id: 's2',
			name: 'Split uploads',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [400, 40],
		},
		{
			parameters: {
				operation: 'write',
				fileName: `=${FOLDER}/{{ $json.fileName }}`,
				dataPropertyName: 'data',
				options: {},
			},
			id: 's3',
			name: 'Save to folder',
			type: 'n8n-nodes-base.readWriteFile',
			typeVersion: 1.1,
			position: [620, 40],
		},
	],
	connections: {
		'On form submission': { main: [[{ node: 'Split uploads', type: 'main', index: 0 }]] },
		'Split uploads': { main: [[{ node: 'Save to folder', type: 'main', index: 0 }]] },
	},
};

// ── Daily workflow: upload today's PDF → dedup vs folder → save + email ──────
const daily = {
	name: 'Salla Dedup — Daily',
	active: false,
	settings: { executionOrder: 'v1' },
	nodes: [
		{
			parameters: {
				content:
					'## Salla dedup — daily\n\nUpload today’s PDF + recipient email.\nReads the history in `' +
					FOLDER +
					'`, removes orders already seen (order # = 9-digit `26/27…`), saves the clean PDF as `<next>.pdf` there, and emails it with a report.\n\n⚠️ Run the **Seed** workflow once first. Needs `pdf-lib` in the image.',
				height: 260,
				width: 520,
				color: 5,
			},
			id: 'd0',
			name: 'Read me first',
			type: 'n8n-nodes-base.stickyNote',
			typeVersion: 1,
			position: [-60, -240],
		},
		{
			parameters: {
				formTitle: 'Salla Orders — Dedup',
				formDescription: 'Upload today’s Salla order PDF. Orders already in previous files are removed.',
				formFields: {
					values: [
						{ fieldLabel: 'Orders PDF', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.pdf', requiredField: true },
						{ fieldLabel: 'Send To Email', fieldType: 'email', requiredField: true },
					],
				},
				options: {},
			},
			id: 'd1',
			name: 'On form submission',
			type: 'n8n-nodes-base.formTrigger',
			typeVersion: 2.6,
			position: [-60, 120],
		},
		{
			parameters: {
				operation: 'pdf',
				binaryPropertyName: 'Orders_PDF',
				options: { joinPages: false, keepSource: 'both' },
			},
			id: 'd2',
			name: 'Extract today',
			type: 'n8n-nodes-base.extractFromFile',
			typeVersion: 1.1,
			position: [180, -20],
		},
		{
			parameters: {
				operation: 'read',
				fileSelector: `${FOLDER}/*.pdf`,
				options: {},
			},
			id: 'd3',
			name: 'Read folder',
			type: 'n8n-nodes-base.readWriteFile',
			typeVersion: 1.1,
			position: [180, 260],
		},
		{
			parameters: { jsCode: selectCode },
			id: 'd4',
			name: 'Select recent',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [400, 260],
		},
		{
			parameters: {
				operation: 'pdf',
				binaryPropertyName: 'data',
				options: { joinPages: false, keepSource: 'json' },
			},
			id: 'd5',
			name: 'Extract prev',
			type: 'n8n-nodes-base.extractFromFile',
			typeVersion: 1.1,
			position: [620, 260],
		},
		{
			parameters: { mode: 'append' },
			id: 'd6',
			name: 'Merge',
			type: 'n8n-nodes-base.merge',
			typeVersion: 3,
			position: [840, 120],
		},
		{
			parameters: { jsCode: dedupCode },
			id: 'd7',
			name: 'Dedup & Build',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [1060, 120],
		},
		{
			parameters: {
				operation: 'write',
				fileName: `=${FOLDER}/{{ $json.fileName }}`,
				dataPropertyName: 'data',
				options: {},
			},
			id: 'd8',
			name: 'Save deduped',
			type: 'n8n-nodes-base.readWriteFile',
			typeVersion: 1.1,
			position: [1300, 20],
		},
		{
			parameters: {
				fromEmail: 'notifications.vmeals@gmail.com',
				toEmail: '={{ $json.recipient }}',
				subject: '=Salla dedup — {{ $json.fileName }} ({{ $json.duplicatesRemoved }} duplicates removed)',
				emailFormat: 'html',
				html:
					"=<p>Deduplicated Salla orders — <b>{{ $json.fileName }}</b></p>" +
					'<p>Total orders today: {{ $json.totalOrdersToday }}<br>' +
					'Unique kept: {{ $json.uniqueKept }}<br>' +
					'Duplicates removed: {{ $json.duplicatesRemoved }} (compared against {{ $json.comparedAgainstFiles }} previous files)</p>' +
					"<p><b>Removed duplicates:</b></p><ul>{{ $json.duplicates.map(d => '<li>Order ' + d.order + ' — already in ' + d.foundIn + '</li>').join('') }}</ul>",
				options: { fileAttachments: 'data' },
			},
			id: 'd9',
			name: 'Send Email',
			type: 'n8n-nodes-base.emailSend',
			typeVersion: 2.1,
			position: [1300, 220],
		},
	],
	connections: {
		'On form submission': {
			main: [[
				{ node: 'Extract today', type: 'main', index: 0 },
				{ node: 'Read folder', type: 'main', index: 0 },
			]],
		},
		'Extract today': { main: [[{ node: 'Merge', type: 'main', index: 0 }]] },
		'Read folder': { main: [[{ node: 'Select recent', type: 'main', index: 0 }]] },
		'Select recent': { main: [[{ node: 'Extract prev', type: 'main', index: 0 }]] },
		'Extract prev': { main: [[{ node: 'Merge', type: 'main', index: 1 }]] },
		Merge: { main: [[{ node: 'Dedup & Build', type: 'main', index: 0 }]] },
		'Dedup & Build': {
			main: [[
				{ node: 'Save deduped', type: 'main', index: 0 },
				{ node: 'Send Email', type: 'main', index: 0 },
			]],
		},
	},
};

writeFileSync(join(here, '..', 'salla-seed-workflow.json'), JSON.stringify(seed, null, 2) + '\n');
writeFileSync(join(here, '..', 'salla-dedup-server-workflow.json'), JSON.stringify(daily, null, 2) + '\n');
console.log('Wrote salla-seed-workflow.json and salla-dedup-server-workflow.json');
