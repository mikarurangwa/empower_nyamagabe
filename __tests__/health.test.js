const request = require('supertest');
const { app, initDatabase, db } = require('../server');

describe('Empower Nyamagabe API', () => {
  beforeAll((done) => {
    initDatabase();
    // sqlite table creation is async; small delay keeps the test stable.
    setTimeout(done, 200);
  });

  afterAll((done) => {
    db.close(() => done());
  });

  test('GET /api/health returns success', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  test('GET /api/families/verified is public and returns a list', async () => {
    const res = await request(app).get('/api/families/verified');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('public family list never exposes private fields', async () => {
    const res = await request(app).get('/api/families/verified');
    res.body.data.forEach((f) => {
      expect(f).not.toHaveProperty('name');
      expect(f).not.toHaveProperty('phone');
      expect(f).not.toHaveProperty('village');
      expect(f).not.toHaveProperty('notes');
    });
  });

  test('submitting a family requires authentication', async () => {
    const res = await request(app).post('/api/families/submit').send({});
    expect(res.statusCode).toBe(401);
  });

  test('donating requires authentication', async () => {
    const res = await request(app).post('/api/donations/create').send({ familyId: 1, amount: 5000, paymentMethod: 'mobile_money' });
    expect(res.statusCode).toBe(401);
  });
});
