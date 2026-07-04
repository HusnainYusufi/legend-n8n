// Generates ../salla-dedup-workflow.json from plan.js + dedup.js.
// Run:  node workflow-dedup/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const planCode = readFileSync(join(here, 'plan.js'), 'utf8');
const dedupCode = readFileSync(join(here, 'dedup.js'), 'utf8');

const FOLDER_ID = '10O-FiNRQTg-tcqEcRhZJeQ5ILh3Ro72t';

const workflow = {
	name: 'Salla Orders — Dedup PDF',
	active: false,
	settings: { executionOrder: 'v1' },
	nodes: [
		{
			parameters: {
				content:
					'## Salla orders — dedup PDF\n\n' +
					'**Today branch:** On form submission → Extract today (PDF→per-page text, keeps the file).\n' +
					'**History branch:** Drive list → Plan (next series + last 20) → Drive download → Extract prev (per-page text).\n' +
					'**Merge** both → **Dedup & Build** removes orders already seen in the previous files (order # = 9-digit `26/27…`), rebuilds a clean PDF named `<next>.pdf` with pdf-lib.\n' +
					'→ **Drive upload** (advances the series) + **Send Email** (clean PDF + report).\n\n' +
					'⚠️ Needs `pdf-lib` in the image and a **Google Drive OAuth** credential on the 3 Drive nodes.',
				height: 340,
				width: 520,
				color: 5,
			},
			id: 'n0',
			name: 'Read me first',
			type: 'n8n-nodes-base.stickyNote',
			typeVersion: 1,
			position: [-40, -260],
		},
		{
			parameters: {
				formTitle: 'Salla Orders — Dedup',
				formDescription: 'Upload today’s Salla order PDF. Orders already in the last 20 files are removed.',
				formFields: {
					values: [
						{ fieldLabel: 'Orders PDF', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.pdf', requiredField: true },
						{ fieldLabel: 'Send To Email', fieldType: 'email', requiredField: true },
					],
				},
				options: {},
			},
			id: 'n1',
			name: 'On form submission',
			type: 'n8n-nodes-base.formTrigger',
			typeVersion: 2.6,
			position: [-40, 120],
		},
		{
			parameters: {
				operation: 'pdf',
				binaryPropertyName: 'Orders_PDF',
				options: { joinPages: false, keepSource: 'both' },
			},
			id: 'n2',
			name: 'Extract today',
			type: 'n8n-nodes-base.extractFromFile',
			typeVersion: 1.1,
			position: [220, -20],
		},
		{
			parameters: {
				resource: 'fileFolder',
				operation: 'search',
				searchMethod: 'query',
				queryString: `'${FOLDER_ID}' in parents and trashed = false and mimeType = 'application/pdf'`,
				returnAll: true,
				options: {},
			},
			id: 'n3',
			name: 'Drive: list folder',
			type: 'n8n-nodes-base.googleDrive',
			typeVersion: 3,
			position: [220, 260],
		},
		{
			parameters: { jsCode: planCode },
			id: 'n4',
			name: 'Plan',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [440, 260],
		},
		{
			parameters: {
				resource: 'file',
				operation: 'download',
				fileId: { __rl: true, mode: 'id', value: '={{ $json.fileId }}' },
				options: {},
			},
			id: 'n5',
			name: 'Drive: download',
			type: 'n8n-nodes-base.googleDrive',
			typeVersion: 3,
			position: [660, 260],
		},
		{
			parameters: {
				operation: 'pdf',
				binaryPropertyName: 'data',
				options: { joinPages: false, keepSource: 'json' },
			},
			id: 'n6',
			name: 'Extract prev',
			type: 'n8n-nodes-base.extractFromFile',
			typeVersion: 1.1,
			position: [880, 260],
		},
		{
			parameters: { mode: 'append' },
			id: 'n7',
			name: 'Merge',
			type: 'n8n-nodes-base.merge',
			typeVersion: 3,
			position: [1100, 120],
		},
		{
			parameters: { jsCode: dedupCode },
			id: 'n8',
			name: 'Dedup & Build',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [1320, 120],
		},
		{
			parameters: {
				resource: 'file',
				operation: 'upload',
				inputDataFieldName: 'data',
				name: '={{ $json.fileName }}',
				driveId: { __rl: true, mode: 'list', value: 'My Drive' },
				folderId: { __rl: true, mode: 'id', value: FOLDER_ID },
				options: {},
			},
			id: 'n9',
			name: 'Drive: upload',
			type: 'n8n-nodes-base.googleDrive',
			typeVersion: 3,
			position: [1560, 20],
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
			id: 'n10',
			name: 'Send Email',
			type: 'n8n-nodes-base.emailSend',
			typeVersion: 2.1,
			position: [1560, 220],
		},
	],
	connections: {
		'On form submission': {
			main: [[
				{ node: 'Extract today', type: 'main', index: 0 },
				{ node: 'Drive: list folder', type: 'main', index: 0 },
			]],
		},
		'Extract today': { main: [[{ node: 'Merge', type: 'main', index: 0 }]] },
		'Drive: list folder': { main: [[{ node: 'Plan', type: 'main', index: 0 }]] },
		Plan: { main: [[{ node: 'Drive: download', type: 'main', index: 0 }]] },
		'Drive: download': { main: [[{ node: 'Extract prev', type: 'main', index: 0 }]] },
		'Extract prev': { main: [[{ node: 'Merge', type: 'main', index: 1 }]] },
		Merge: { main: [[{ node: 'Dedup & Build', type: 'main', index: 0 }]] },
		'Dedup & Build': {
			main: [[
				{ node: 'Drive: upload', type: 'main', index: 0 },
				{ node: 'Send Email', type: 'main', index: 0 },
			]],
		},
	},
};

const out = join(here, '..', 'salla-dedup-workflow.json');
writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log('Wrote', out);
