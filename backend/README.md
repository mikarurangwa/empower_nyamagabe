# Empower Nyamagabe – Backend

The REST API behind Empower Nyamagabe. It handles accounts, family verification, Flutterwave payments, receipts and admin reports. It also serves the frontend, so one `npm start` runs the whole site.

Built with Node.js, Express and SQLite.

## Getting started

You need Node.js 20 or newer.

```bash
cd backend
npm install
npm start
```

Open http://localhost:3000. The database file is created on the first run, and so is the admin account from `.env`.

Use `npm run dev` to restart automatically while you work.

## Environment variables

Settings live in `backend/.env`.

| Variable | Needed | What it does |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Signs login tokens. Any long random string. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Yes | The first admin account. |
| `APP_BASE_URL` | Yes | `http://localhost:3000` locally. Used in payment and email links. |
| `FLW_SECRET_KEY` | For payments | Flutterwave secret key. |
| `FLW_WEBHOOK_SECRET_HASH` | No | Only if you set up a Flutterwave webhook. |
| `PORT`, `DB_PATH` | No | Default to `3000` and `./empower_nyamagabe.db`. |
| `AUTH_RATE_LIMIT` | No | Login, sign-up and reset attempts allowed per 15 minutes. Default `20`. |
| `SMTP_*`, `ADMIN_NOTIFY_EMAIL` | No | Email for receipts and password resets. Without it, reset links are printed in the terminal. |

## Folder structure

```
backend/
├── migrations/              Database tables, indexes and the first admin account
├── src/
│   ├── config/              Environment settings, database class, constants
│   ├── controllers/         Read the request, call a service, send the response
│   ├── middlewares/         Login check, roles, security headers, validation, errors
│   ├── models/              BaseModel and one subclass per table (User, Family, Donation, ...)
│   ├── routes/              URL to controller mapping
│   ├── services/            AuthService, FamilyService, DonationService, ReportService, ...
│   │   ├── payment/         PaymentGateway and FlutterwaveGateway
│   │   └── export/          Exporter, CsvExporter and XlsxExporter
│   └── utils/               Donation and family rules, ranking, validators, error classes
├── tests/
│   ├── unit/                Rules, ranking, validators and classes on their own
│   ├── integration/         The whole API over HTTP with an in-memory database
│   ├── performance/         Load test
│   └── helpers/             Test server and a fake payment gateway
├── app.js                   Express app
└── server.js                Connects the database, runs migrations, starts the server
```

### How the code is organised

- **Models** each extend `BaseModel`, which holds the database connection and shared queries like `findById`. All SQL lives in models.
- **Services** hold the business logic and receive the models they need through their constructor. They are created once in `src/services/index.js`.
- **`PaymentGateway`** is the interface `DonationService` uses for payments. `FlutterwaveGateway` implements it for real payments, and the tests use a `FakeGateway`, so the donation logic never depends on Flutterwave directly.
- **Exporters** share one `send()` method from `Exporter`; `CsvExporter` and `XlsxExporter` each write their own format.
- **Errors** are classes (`ValidationError`, `ForbiddenError`, ...) carrying their HTTP status, so one error handler turns them into responses.
- **Rules** that protect money and privacy (`donationRules.js`, `familyRules.js`) are plain functions with no database access, which makes them easy to test.

### Ranking families

`src/utils/ranking.js` decides the order families appear to donors. It compares families on four keys in turn: still needs money, lower Ubudehe category, smaller share already funded, and longest wait since verification. Sorting takes O(n log n); 10,000 families sort in a few milliseconds.

## Tests

```bash
npm test                  # all 70 tests
npm run test:unit         # 33 unit tests
npm run test:integration  # 37 integration tests
npm run test:load         # load test (CONNECTIONS=20 SECONDS=10, NO_INDEXES=1 to compare)
```

Tests use Node's built-in test runner. Integration tests start the real app on a free port with an in-memory database and swap Flutterwave for `FakeGateway`, so tampered amounts, wrong currencies, cancelled checkouts and provider outages can all be tested.

## Roles

- **Donor**: signs up with a phone number or email, picks a verified family, donates and downloads receipts.
- **Local leader**: created by the admin. Submits families in their own sector and reviews families submitted by other leaders.
- **Admin**: creates leader accounts, reviews any family, sees all donations, reports, exports and the audit log.

A leader can never approve a family they submitted. Someone else always has to review it.

## API

All routes start with `/api`. Protected routes need `Authorization: Bearer <token>`, using the token returned by login or sign-up.

| Method | Route | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/signup` | Public | Create a donor account |
| POST | `/auth/login` | Public | Log in with phone or email |
| GET | `/auth/me` | Logged in | Current user |
| POST | `/auth/password-reset/request` | Public | Email a reset link |
| POST | `/auth/password-reset/confirm` | Public | Set a new password |
| GET | `/families/verified` | Public | Verified families (no private details) |
| POST | `/families/submit` | Leader, admin | Submit a family |
| GET | `/families/queue` | Leader, admin | Families in your sector (admin sees all) |
| POST | `/families/:id/verify` | Leader, admin | Approve or reject |
| POST | `/donations/create` | Logged in | Start a donation and get a Flutterwave link |
| GET | `/donations/user/:userId` | Owner, admin | Donation history |
| GET | `/donations/totals/:userId` | Owner, admin | Totals for one donor |
| GET | `/donations/status/:txRef` | Owner, admin | Payment status |
| GET | `/donations/receipt/:txRef` | Owner, admin | Receipt details |
| GET | `/donations/receipt/:txRef/pdf` | Owner, admin | Receipt as PDF |
| GET | `/donations/all` | Admin | Latest 100 donations |
| GET | `/payments/flutterwave/callback` | Flutterwave | Return page after paying |
| POST | `/payments/flutterwave/webhook` | Flutterwave | Payment updates |
| GET | `/admin/leaders` | Admin | List leaders |
| POST | `/admin/leaders` | Admin | Create a leader |
| GET | `/admin/reports/summary` | Admin | Donation and family report |
| GET | `/admin/audit-logs` | Admin | Latest 200 actions |
| GET | `/admin/export/:dataset.:format` | Admin | `donations` or `families`, as `csv` or `xlsx` |
| GET | `/public/impact` | Public | Combined totals for the impact page |
| GET | `/public/health` | Public | Health check |

The Postman collection in this folder has every request ready to try. Run **Login (admin)** first and the token is saved for the other requests.

## How a donation works

1. The donor picks a family and an amount. The API checks the family is approved and the amount isn't more than it still needs.
2. A `pending` donation is saved with a unique reference, and Flutterwave returns a checkout link.
3. The donor pays on Flutterwave's page. Card and Mobile Money details never reach this server.
4. Flutterwave sends the donor back. The API asks Flutterwave to confirm the payment and checks the reference, amount and currency match.
5. The donation becomes `completed` or `failed`, and the donor gets a receipt.

## Privacy

Donors and the public only ever see a family code (for example `NYA-0007`), the sector, the Ubudehe category and the need. Names, phone numbers, cells, villages and leaders' notes are only visible to leaders in that sector and to the admin.

## Deployment

The app runs as one Node service. On a host like Render:

1. Build command `npm install`, start command `npm start`, root directory `backend`.
2. Attach a persistent disk and point `DB_PATH` at it, for example `/var/data/empower_nyamagabe.db`. Without one, SQLite data is lost on every deploy.
3. Set the environment variables above, with `NODE_ENV=production` and `APP_BASE_URL` set to the live URL.
4. Use `/api/public/health` as the health check.
5. In Flutterwave, set the webhook to `<your-url>/api/payments/flutterwave/webhook` if you use one.
