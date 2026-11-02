// Any payment provider must offer these two methods. DonationService only talks to this
// interface, so Flutterwave can be replaced (or faked in tests) without touching donation logic.
class PaymentGateway {
  constructor() {
    if (new.target === PaymentGateway) throw new TypeError('PaymentGateway cannot be used directly');
  }

  async createPaymentLink() {
    throw new Error(`${this.constructor.name} must implement createPaymentLink()`);
  }

  async verifyTransaction() {
    throw new Error(`${this.constructor.name} must implement verifyTransaction()`);
  }
}

module.exports = PaymentGateway;
