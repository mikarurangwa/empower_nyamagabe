const axios = require('axios');
const PaymentGateway = require('./PaymentGateway');

// Card and Mobile Money details are entered on Flutterwave's page, never on ours
class FlutterwaveGateway extends PaymentGateway {
  #secretKey;

  constructor({ secretKey, baseUrl }) {
    super();
    this.#secretKey = secretKey;
    this.baseUrl = baseUrl;
  }

  #headers() {
    if (!this.#secretKey) throw new Error('FLW_SECRET_KEY is missing');
    return { Authorization: `Bearer ${this.#secretKey}` };
  }

  async createPaymentLink({ amount, currency, txRef, customer, redirectUrl, title, description, paymentOptions, meta }) {
    const { data } = await axios.post(
      `${this.baseUrl}/payments`,
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
      { headers: this.#headers(), timeout: 15000 }
    );

    const link = data && data.data && data.data.link;
    if (!link) throw new Error('Flutterwave did not return a payment link');
    return link;
  }

  async verifyTransaction(transactionId) {
    const { data } = await axios.get(`${this.baseUrl}/transactions/${transactionId}/verify`, {
      headers: this.#headers(),
      timeout: 15000,
    });
    return data && data.data;
  }
}

module.exports = FlutterwaveGateway;
