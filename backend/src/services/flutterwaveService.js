const axios = require('axios');
const env = require('../config/env');

const { secretKey, baseUrl } = env.flutterwave;

function assertConfigured() {
  if (!secretKey) throw new Error('FLW_SECRET_KEY is missing');
}

// Card and Mobile Money details are entered on Flutterwave's page, never on ours
async function createPaymentLink({ amount, currency, txRef, customer, redirectUrl, title, description, paymentOptions, meta }) {
  assertConfigured();
  const { data } = await axios.post(
    `${baseUrl}/payments`,
    {
      tx_ref: txRef,
      amount: String(amount),
      currency,
      redirect_url: redirectUrl,
      customer,
      payment_options: paymentOptions,
      meta,
      customizations: { title, description },
    },
    { headers: { Authorization: `Bearer ${secretKey}` }, timeout: 15000 }
  );

  const link = data && data.data && data.data.link;
  if (!link) throw new Error('Flutterwave did not return a payment link');
  return link;
}

async function verifyTransaction(transactionId) {
  assertConfigured();
  const { data } = await axios.get(`${baseUrl}/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    timeout: 15000,
  });
  return data && data.data;
}

module.exports = { createPaymentLink, verifyTransaction };
