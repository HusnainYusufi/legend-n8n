// ============================================================================
//  Salla orders  ->  Odoo import .xlsx  (two tabs, styled)
//  This is the body of the n8n "Build Odoo File" Code node.
//  Runs once for all items. Input = rows from "Extract from File".
//  Output = one item with the generated .xlsx in binary field `data`.
//
//  Requires the `exceljs` module (bundled into the Docker image, allowed via
//  NODE_FUNCTION_ALLOW_EXTERNAL=exceljs).
// ============================================================================
const ExcelJS = require('exceljs');

// ── CONFIG ──────────────────────────────────────────────────────────────────
// Map each logical field to the candidate header names in your Salla export.
// The first candidate that exists in the row is used (case/space-insensitive).
// After your first test run, set these to the EXACT header text from your file.
const COLS = {
	orderRef: ['Order Reference', 'order_reference', 'reference', 'order_id', 'id', 'رقم الطلب', 'رقم الطلب #'],
	name: ['Complete Name', 'customer_name', 'name', 'full_name', 'الاسم', 'اسم العميل', 'العميل'],
	mobile: ['Mobile', 'mobile', 'phone', 'الجوال', 'رقم الجوال'],
	city: ['City', 'city', 'المدينة'],
	street: ['Street', 'address', 'street', 'العنوان'],
	payment: ['Payment Method', 'payment_method', 'payment', 'طريقة الدفع', 'طريقة الدفع'],
	shipping: ['تكلفة الشحن', 'shipping_cost', 'shipping'],
	skus: ['skus_json'],
};

// final_price in skus_json is treated as a LINE TOTAL, so unit price = total / qty.
// If your final_price is already per-unit, set this to false.
const DIVIDE_PRICE_BY_QTY = true;

// Fixed values
const SALESPERSON = 'Legend Sleep Online';
const COUNTRY = 'Saudi Arabia';
const IS_A_COMPANY = 'False';
const ANALYTIC = '{"3": 100}';

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

function mapPayment(p) {
	const s = String(p ?? '').trim().toLowerCase();
	if (s.includes('مدى') || s.includes('mada')) return 'Mada/Span- Legend Sleep E-commerce';
	if (s.includes('تابي') || s.includes('tabby')) return 'Tabby- Legend Sleep E-commerce';
	if (s.includes('ئتمان') || s.includes('credit')) return 'Credit Card- Legend Sleep E-commerce';
	if (s.includes('تمارا') || s.includes('tamara')) return 'Tamara- Legend Sleep E-commerce';
	if (s.includes('إمكان') || s.includes('امكان') || s.includes('emkan')) return 'Emkan- Legend Sleep E-commerce';
	if (s.includes('apple') || s.includes('applepay')) return 'Mada/Span- Legend Sleep E-commerce';
	return p ? String(p) : '';
}

function mapWarehouse(city) {
	const s = String(city ?? '').trim().toLowerCase();
	if (s.includes('riyadh') || s.includes('الرياض')) return 'Riyadh Branch - Warehouse';
	if (s.includes('dammam') || s.includes('الدمام')) return 'Dammam Warehouse';
	return 'Bedding Factory-Warehouse';
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

// ── READ INPUT ───────────────────────────────────────────────────────────────
const rows = $input.all().map((i) => i.json);

if (rows.length > 0 && !hasCol(rows[0], COLS.skus)) {
	throw new Error(
		'Could not find the "skus_json" column in the uploaded file. ' +
			'Available columns: ' + Object.keys(rows[0]).join(' | '),
	);
}

// ── TRANSFORM ────────────────────────────────────────────────────────────────
const customers = [];
const orderRows = [];

for (const row of rows) {
	const orderRef = pick(row, COLS.orderRef) ?? '';
	const rawName = String(pick(row, COLS.name) ?? '').trim();
	const custName = `${rawName}${seriesNumber}`;
	const mobile = pick(row, COLS.mobile) ?? '';
	const city = pick(row, COLS.city) ?? '';
	const street = pick(row, COLS.street) ?? '';
	const paymentTerm = mapPayment(pick(row, COLS.payment));
	const warehouse = mapWarehouse(city);
	const shipping = num(pick(row, COLS.shipping));
	let items = parseSkus(pick(row, COLS.skus));

	// Customer Data: one row per order
	customers.push({
		'Complete Name': custName,
		Mobile: mobile,
		City: city,
		Street: street,
		Country: COUNTRY,
		'Is a Company': IS_A_COMPANY,
	});

	// No parseable SKUs -> still emit one flagged row so the order is visible
	if (items.length === 0) items = [['', 1, '', 0, 0]];

	const firstIdx = orderRows.length;
	let orderHasInvalidSku = false;
	let first = true;

	for (const item of items) {
		const productName = String(item[0] ?? '').trim();
		const qty = num(item[1]) || 1;
		const sku = item[2];
		const finalPrice = num(item[4]);
		const unitPrice = DIVIDE_PRICE_BY_QTY && qty ? finalPrice / qty : finalPrice;
		const invalid = isInvalidSku(sku);
		if (invalid) orderHasInvalidSku = true;

		orderRows.push({
			orderRef: first ? orderRef : '',
			product: invalid ? 'NO SKU' : productName,
			unitPrice,
			qty,
			customer: first ? custName : '',
			salesperson: first ? SALESPERSON : '',
			paymentTerms: first ? paymentTerm : '',
			warehouse: first ? warehouse : '',
			analytic: ANALYTIC,
			productRed: invalid,
			orderRefRed: false,
		});
		first = false;
	}

	// Order Reference cell turns red if any SKU in the order is invalid
	if (orderHasInvalidSku) orderRows[firstIdx].orderRefRed = true;

	// Shipping line (additional row -> ref/customer/etc. blank)
	if (shipping > 0) {
		orderRows.push({
			orderRef: '',
			product: 'Delivery_007',
			unitPrice: shipping,
			qty: 1,
			customer: '',
			salesperson: '',
			paymentTerms: '',
			warehouse: '',
			analytic: ANALYTIC,
			productRed: false,
			orderRefRed: false,
		});
	}
}

// ── BUILD STYLED WORKBOOK ────────────────────────────────────────────────────
const BLUE = 'FF1F4E78';
const RED = 'FFFF0000';
const WHITE = 'FFFFFFFF';

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

// Column widths
ws1.columns.forEach((col) => (col.width = 22));
ws2.columns.forEach((col) => (col.width = 22));

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
