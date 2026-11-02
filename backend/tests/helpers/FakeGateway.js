const PaymentGateway = require('../../src/services/payment/PaymentGateway');

// Stands in for Flutterwave so tests never make real payments.
// By default it confirms exactly what was asked for; tests can change that.
class FakeGateway extends PaymentGateway {
  constructor() {
    super();
    this.requests = [];
    this.override = null;
    this.down = false;
  }

  async createPaymentLink(request) {
    if (this.down) throw new Error('gateway unavailable');
    this.requests.push(request);
    return `https://checkout.test/pay/${request.txRef}`;
  }

  async verifyTransaction() {
    const last = this.requests[this.requests.length - 1];
    return {
      status: 'successful',
      tx_ref: last.txRef,
      amount: last.amount,
      currency: last.currency,
      ...this.override,
    };
  }
}

module.exports = FakeGateway;
