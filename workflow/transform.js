// ============================================================================
//  Salla orders  ->  Odoo import .xlsx  (two tabs, styled)
//  Body of the n8n "Build Odoo File" Code node. Runs once for all items.
//  Input  = rows from "Extract from File" (the raw Salla export).
//  Output = one item with the generated .xlsx in binary field `data`.
//  Requires the `exceljs` module (bundled in the Docker image,
//  allowed via NODE_FUNCTION_ALLOW_EXTERNAL=exceljs).
// ============================================================================
const ExcelJS = require('exceljs');

// ── CONFIG: Salla export column headers (exact, with fallbacks) ──────────────
const COLS = {
	orderRef: ['رقم الطلب', 'Order Reference', 'order_id', 'id'],
	name: ['اسم العميل', 'Complete Name', 'customer_name', 'name'],
	mobile: ['رقم الجوال', 'Mobile', 'mobile', 'phone'],
	city: ['المدينة', 'City', 'city'],
	street: ['عنوان العميل', 'Street', 'address'],
	payment: ['طريقة الدفع', 'Payment Method', 'payment'],
	shipping: ['تكلفة الشحن', 'shipping_cost', 'shipping'],
	skus: ['skus_json'],
};

// skus_json item layout: [product_name, qty, sku_code, original_price, final_price]
const I_QTY = 1;
const I_SKU = 2;
const I_FINAL = 4;
// final_price is the LINE TOTAL -> unit price = final_price / qty.
const DIVIDE_PRICE_BY_QTY = true;

// Fixed values
const SALESPERSON = 'Legend Sleep Online';
const COUNTRY = 'Saudi Arabia';
const IS_A_COMPANY = false;
const ANALYTIC = '{"3": 100}';

// Styling (matches the reference file)
const BLUE = 'FF4472C4';
const RED = 'FFFF0000';
const WHITE = 'FFFFFFFF';

// ── DAILY INPUTS (from the upload form) ──────────────────────────────────────
const form = $('On form submission').first().json;
const seriesNumber = String(form['Series Number'] ?? '').trim();
const reportDate = String(form['Report Date'] ?? '').trim();

// ── HELPERS ──────────────────────────────────────────────────────────────────
function pick(row, candidates) {
	for (const c of candidates) {
		if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') return row[c];
	}
	const keys = Object.keys(row);
	for (const c of candidates) {
		const k = keys.find((kk) => kk.trim().toLowerCase() === c.trim().toLowerCase());
		if (k && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
	}
	return undefined;
}

function hasCol(row, candidates) {
	const keys = Object.keys(row).map((k) => k.trim().toLowerCase());
	return candidates.some((c) => keys.includes(c.trim().toLowerCase()));
}

function num(v) {
	if (v === undefined || v === null) return 0;
	const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
	return isNaN(n) ? 0 : n;
}

function round2(n) {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

function paymentPrefix(p) {
	const s = String(p ?? '').trim();
	const low = s.toLowerCase();
	if (s.includes('مدى') || low.includes('mada')) return 'Mada/Span';
	if (s.includes('تابي') || low.includes('tabby')) return 'Tabby';
	if (s.includes('ئتمان') || low.includes('credit')) return 'Credit Card';
	if (s.includes('تمارا') || low.includes('tamara')) return 'Tamara';
	if (s.includes('إمكان') || s.includes('امكان') || low.includes('emkan')) return 'Emkan';
	if (low.includes('apple')) return 'Mada/Span';
	if (low.includes('mispay')) return 'MisPAY';
	return s; // unknown -> pass through with the suffix
}

function mapPayment(p) {
	const prefix = paymentPrefix(p);
	return prefix ? `${prefix}- Legend Sleep E-commerce` : '';
}

function mapWarehouse(city) {
	const s = String(city ?? '').trim().toLowerCase();
	if (s.includes('riyadh') || s.includes('الرياض')) return 'Riyadh Branch - Warehouse';
	if (s.includes('dammam') || s.includes('الدمام')) return 'Dammam Warehouse';
	return 'BEDDING FACTORY-WAREHOUSE';
}

function isInvalidSku(sku) {
	const s = String(sku ?? '').trim().toLowerCase();
	return s === '' || s === '0' || s === 'null' || s === 'undefined' || s === 'false';
}

function parseSkus(val) {
	if (val === undefined || val === null || val === '') return [];
	if (Array.isArray(val)) return val;
	try {
		const parsed = JSON.parse(val);
		return Array.isArray(parsed) ? parsed : [];
	} catch (e) {
		return [];
	}
}

// ── READ THE UPLOADED FILE DIRECTLY ──────────────────────────────────────────
// The Form Trigger attaches the uploaded spreadsheet as a binary field whose
// name varies by n8n version (e.g. "Orders_File"). Auto-detect it and parse the
// first sheet into header-keyed row objects — no separate Extract node needed.
function cellVal(v) {
	if (v === null || v === undefined) return null;
	if (typeof v === 'object') {
		if (v.text !== undefined) return v.text;
		if (v.result !== undefined) return v.result;
		if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
		if (v.hyperlink !== undefined) return v.hyperlink;
		return null;
	}
	return v;
}

const inputItems = $input.all();
const firstBinary = inputItems.find((it) => it.binary && Object.keys(it.binary).length);
if (!firstBinary) {
	throw new Error('No uploaded file found on the incoming item (expected a binary field from the form).');
}
const binaryKey = Object.keys(firstBinary.binary)[0];
const itemIndex = inputItems.indexOf(firstBinary);
const inputBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryKey);

const inWb = new ExcelJS.Workbook();
await inWb.xlsx.load(inputBuffer);
const sheet = inWb.worksheets[0];

const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
	headers[col] = cellVal(cell.value);
});

const rows = [];
sheet.eachRow((row, rowNumber) => {
	if (rowNumber === 1) return;
	const obj = {};
	let hasData = false;
	row.eachCell({ includeEmpty: true }, (cell, col) => {
		const h = headers[col];
		if (h === null || h === undefined || h === '') return;
		const v = cellVal(cell.value);
		obj[h] = v;
		if (v !== null && v !== undefined && String(v).trim() !== '') hasData = true;
	});
	if (hasData) rows.push(obj);
});

if (rows.length > 0 && !hasCol(rows[0], COLS.skus)) {
	throw new Error(
		'Could not find the "skus_json" column. Available columns: ' + Object.keys(rows[0]).join(' | '),
	);
}

// ── TRANSFORM ────────────────────────────────────────────────────────────────
const customers = [];
const orderRows = [];

for (const row of rows) {
	const orderRef = pick(row, COLS.orderRef) ?? null;
	const rawName = String(pick(row, COLS.name) ?? '').trim();
	const custName = `${rawName}${seriesNumber}`;
	const mobile = pick(row, COLS.mobile) ?? '';
	const city = pick(row, COLS.city) ?? '';
	const street = pick(row, COLS.street) ?? '';
	const paymentTerm = mapPayment(pick(row, COLS.payment));
	const warehouse = mapWarehouse(city);
	const shipping = num(pick(row, COLS.shipping));
	let items = parseSkus(pick(row, COLS.skus));

	customers.push({
		'Complete Name': custName,
		Mobile: mobile,
		City: city,
		Street: street,
		Country: COUNTRY,
		'Is a Company': IS_A_COMPANY,
	});

	if (items.length === 0) items = [['', 1, '', 0, 0]];

	const firstIdx = orderRows.length;
	let orderHasInvalidSku = false;
	let first = true;

	for (const item of items) {
		const qty = num(item[I_QTY]) || 1;
		const sku = item[I_SKU];
		const finalPrice = num(item[I_FINAL]);
		const unitPrice = round2(DIVIDE_PRICE_BY_QTY && qty ? finalPrice / qty : finalPrice);
		const invalid = isInvalidSku(sku);
		if (invalid) orderHasInvalidSku = true;

		orderRows.push({
			orderRef: first ? orderRef : null,
			product: invalid ? 'NO SKU' : String(sku),
			unitPrice,
			qty,
			customer: first ? custName : null,
			salesperson: first ? SALESPERSON : null,
			paymentTerms: first ? paymentTerm : null,
			warehouse: first ? warehouse : null,
			analytic: ANALYTIC,
			productRed: invalid,
			orderRefRed: false,
		});
		first = false;
	}

	if (orderHasInvalidSku) orderRows[firstIdx].orderRefRed = true;

	if (shipping > 0) {
		orderRows.push({
			orderRef: null,
			product: 'Delivery_007',
			unitPrice: round2(shipping),
			qty: 1,
			customer: null,
			salesperson: null,
			paymentTerms: null,
			warehouse: null,
			analytic: ANALYTIC,
			productRed: false,
			orderRefRed: false,
		});
	}
}

// ── BUILD STYLED WORKBOOK ────────────────────────────────────────────────────
function styleHeader(rowObj, count) {
	for (let i = 1; i <= count; i++) {
		const cell = rowObj.getCell(i);
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
		cell.font = { color: { argb: WHITE }, bold: true };
	}
}

function redCell(cell) {
	cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
	cell.font = { color: { argb: WHITE }, bold: true };
}

const wb = new ExcelJS.Workbook();

// Tab 1 — Customer Data
const ws1 = wb.addWorksheet('Customer Data');
const custHeaders = ['Complete Name', 'Mobile', 'City', 'Street', 'Country', 'Is a Company'];
ws1.addRow(custHeaders);
styleHeader(ws1.getRow(1), custHeaders.length);
for (const c of customers) ws1.addRow(custHeaders.map((h) => c[h]));

// Tab 2 — Order Data
const ws2 = wb.addWorksheet('Order Data');
const orderHeaders = [
	'Order Reference',
	'Order Lines/Product/Name',
	'Unit Price',
	'Qty',
	'Customer',
	'Salesperson',
	'Payment Terms',
	'Warehouse',
	'order_line/analytic_distribution',
];
ws2.addRow(orderHeaders);
styleHeader(ws2.getRow(1), orderHeaders.length);
for (const r of orderRows) {
	const added = ws2.addRow([
		r.orderRef,
		r.product,
		r.unitPrice,
		r.qty,
		r.customer,
		r.salesperson,
		r.paymentTerms,
		r.warehouse,
		r.analytic,
	]);
	if (r.orderRefRed) redCell(added.getCell(1));
	if (r.productRed) redCell(added.getCell(2));
}

ws1.columns.forEach((col) => (col.width = 24));
ws2.columns.forEach((col) => (col.width = 24));

// ── OUTPUT ───────────────────────────────────────────────────────────────────
const fileName = `${reportDate || 'salla'} salla-odoo.xlsx`;
const buffer = await wb.xlsx.writeBuffer();
const binary = await this.helpers.prepareBinaryData(
	Buffer.from(buffer),
	fileName,
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
);

return [
	{
		json: { orders: customers.length, orderLines: orderRows.length, fileName },
		binary: { data: binary },
	},
];
