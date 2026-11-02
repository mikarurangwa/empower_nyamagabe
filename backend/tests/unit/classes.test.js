const test = require('node:test');
const assert = require('node:assert/strict');
const BaseModel = require('../../src/models/BaseModel');
const User = require('../../src/models/User');
const PaymentGateway = require('../../src/services/payment/PaymentGateway');
const FlutterwaveGateway = require('../../src/services/payment/FlutterwaveGateway');
const Exporter = require('../../src/services/export/Exporter');
const CsvExporter = require('../../src/services/export/CsvExporter');
const XlsxExporter = require('../../src/services/export/XlsxExporter');
const { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } = require('../../src/utils/AppError');
const FakeGateway = require('../helpers/FakeGateway');

test('base classes cannot be used on their own', () => {
  assert.throws(() => new BaseModel({}, 'users'), TypeError);
  assert.throws(() => new PaymentGateway(), TypeError);
  assert.throws(() => new Exporter('x', 'text/plain'), TypeError);
});

test('models inherit shared queries from BaseModel', async () => {
  const calls = [];
  const db = { get: async (sql, params) => { calls.push([sql, params]); return { id: 3 }; } };
  const users = new User(db);
  assert.ok(users instanceof BaseModel);
  assert.deepEqual(await users.findById(3), { id: 3 });
  assert.equal(calls[0][0], 'SELECT * FROM users WHERE id = ?');
});

test('any payment gateway can stand in for another', async () => {
  for (const gateway of [new FlutterwaveGateway({ secretKey: 'x', baseUrl: 'https://example.test' }), new FakeGateway()]) {
    assert.ok(gateway instanceof PaymentGateway);
    assert.equal(typeof gateway.createPaymentLink, 'function');
  }
  const link = await new FakeGateway().createPaymentLink({ txRef: 'EN-1', amount: 1000, currency: 'RWF' });
  assert.equal(link, 'https://checkout.test/pay/EN-1');
});

test('the Flutterwave key stays private', () => {
  const gateway = new FlutterwaveGateway({ secretKey: 'FLWSECK_TEST-secret', baseUrl: 'x' });
  assert.equal(JSON.stringify(gateway).includes('secret'), false);
  assert.equal(gateway.secretKey, undefined);
});

test('each exporter knows its own file type', () => {
  const csv = new CsvExporter();
  const xlsx = new XlsxExporter();
  assert.equal(csv.extension, 'csv');
  assert.equal(xlsx.extension, 'xlsx');
  assert.ok(csv instanceof Exporter && xlsx instanceof Exporter);
});

test('CSV cells with commas, quotes or line breaks are quoted', () => {
  assert.equal(CsvExporter.cell('plain'), 'plain');
  assert.equal(CsvExporter.cell('a,b'), '"a,b"');
  assert.equal(CsvExporter.cell('say "hi"'), '"say ""hi"""');
  assert.equal(CsvExporter.cell('line\nbreak'), '"line\nbreak"');
  assert.equal(CsvExporter.cell(null), '');
  assert.equal(CsvExporter.toCsv(['a', 'b'], [{ a: 1, b: 'x,y' }]), 'a,b\n1,"x,y"');
});

test('each error type carries its HTTP status', () => {
  assert.equal(new ValidationError('x').statusCode, 400);
  assert.equal(new UnauthorizedError().statusCode, 401);
  assert.equal(new ForbiddenError().statusCode, 403);
  assert.equal(new NotFoundError().statusCode, 404);
  assert.ok(new ForbiddenError() instanceof AppError);
});
