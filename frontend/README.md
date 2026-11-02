# Empower Nyamagabe – Frontend

Plain HTML, CSS and JavaScript, with no build step. The backend serves these files, so starting the backend is all you need:

```bash
cd backend
npm start
```

Then open http://localhost:3000.

You can also open the pages with VS Code Live Server. The scripts notice they aren't on port 3000 and send API calls to `http://localhost:3000/api`, so keep the backend running.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Home page, plus the donor, local leader and admin dashboards (one script per dashboard) |
| `login.html` | Log in as a donor, local leader or admin |
| `signup.html` | Create a donor account |
| `reset-password.html` | Set a new password from the emailed link |
| `impact.html` | Public totals |
| `receipt.html` | Donation receipt with print and PDF download |
| `privacy.html`, `terms.html` | Privacy policy and terms |

## Scripts

| File | What it does |
| --- | --- |
| `js/common.js` | Shared helpers: API calls, saved login, icons, money and date formatting |
| `js/dashboard.js` | Shared state, header, switching between the website and dashboards |
| `js/families.js` | Family cards on the home page and in the donor dashboard |
| `js/donor.js` | Donor dashboard: choosing a family, donating, history |
| `js/leader.js` | Local leader dashboard, plus reviewing and submitting families |
| `js/admin.js` | Admin dashboard: families, donations, leaders, reports, audit log |
| `js/app.js` | Page start-up and click handling shared by every dashboard |
| `js/auth.js` | Log in, sign up and password reset |
| `js/impact.js` | Impact page |
| `js/receipt.js` | Receipt page |

## Design

The look comes from Nyamagabe itself. The hero shows the district's tea-covered hills under a rising sun, and the colours are taken from the Rwandan flag: deep green, sun yellow and a soft sky blue. Everything uses one typeface, Archivo, with its wider widths for headings.

All colours, radii and the font are CSS variables at the top of `css/styles.css`. The layout works down to small phones and respects reduced-motion settings.

Icons come from `icons.svg`, which holds only the 28 Font Awesome icons the site uses (Font Awesome Free, CC BY 4.0). Loading the full icon library made up about three quarters of the home page's download size, so it was replaced.
