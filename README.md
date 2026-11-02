# Empower Nyamagabe

A donation platform that connects donors with vulnerable families in Nyamagabe District, Rwanda, who need help with school fees or Mutuelle de Santé (community health insurance).

Local leaders put families forward, a second person checks each one, and every donation is recorded against one family and one need. Donors pay with Mobile Money or card through Flutterwave.

Mission Capstone (BSE), by Rurangwa Mika.

| | |
| --- | --- |
| Walkthrough video | _add link_ |
| Technical report (PDF) | [Technical_Report.pdf](Technical_Report.pdf) |
| Repository | https://github.com/mikarurangwa/empower_nyamagabe |

## Technical requirements

| What | Version |
| --- | --- |
| Node.js | 20 or newer (tested on 22 LTS) |
| npm | 10 or newer |
| Database | SQLite 3, created automatically, nothing to install |
| Browser | Any current Chrome, Edge, Firefox or Safari, desktop or mobile |
| Payments | Flutterwave account and secret key (test key for development) |
| Hardware | Any laptop that runs Node. The site works on low-cost Android phones |

Main libraries: Express 4, sqlite3, bcryptjs, jsonwebtoken, helmet, express-rate-limit, express-validator, axios, pdfkit, exceljs, nodemailer. The frontend is plain HTML, CSS and JavaScript with no framework or build step.

## Install and run

```bash
git clone https://github.com/mikarurangwa/empower_nyamagabe.git
cd empower_nyamagabe/backend
npm install
npm start
```

Open http://localhost:3000 and log in as admin with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `backend/.env`. If `.env` is missing, create it from the table in [backend/README.md](backend/README.md#environment-variables). Only `JWT_SECRET` is required to start.

## Run the tests

```bash
cd backend
npm test                  # all 70 unit and integration tests
npm run test:unit         # business rules, ranking, classes (33 tests)
npm run test:integration  # the full API over HTTP with a fake payment gateway (37 tests)
npm run test:load         # load test with 100 families and 5,000 donations
```

The tests use Node's built-in test runner, so there is nothing extra to install. Integration tests run against an in-memory database and never touch Flutterwave.

## Try the full flow

1. Log in as **Admin** and add two local leaders in the same sector.
2. Log in as the first leader and submit a family.
3. Log in as the second leader and approve it. The family now shows on the home page.
4. Sign up as a donor, pick the family and donate with [Flutterwave's test details](https://developer.flutterwave.com/docs/integration-guides/testing-helpers).
5. Open **My donations** to see the payment and download the receipt.

## Repository structure

```
empower_nyamagabe/
├── backend/
│   ├── migrations/       Tables, indexes and the first admin account
│   ├── src/
│   │   ├── config/       Settings, database connection, constants
│   │   ├── controllers/  Read the request, call a service, send the response
│   │   ├── middlewares/  Login check, roles, security headers, validation, errors
│   │   ├── models/       One class per table, all extending BaseModel
│   │   ├── routes/       URL to controller mapping
│   │   ├── services/     Business logic, payment gateway and exporters
│   │   └── utils/        Rules, ranking algorithm, validators, error classes
│   ├── tests/            Unit, integration and load tests
│   ├── app.js
│   └── server.js
└── frontend/
    ├── css/              One stylesheet
    ├── js/               One script per page plus shared helpers
    ├── icons.svg         The 28 icons the site uses
    └── *.html            Home, dashboards, login, sign-up, impact, receipt, legal pages
```

More detail: [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).
