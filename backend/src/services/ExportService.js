const CsvExporter = require('./export/CsvExporter');
const XlsxExporter = require('./export/XlsxExporter');
const { NotFoundError } = require('../utils/AppError');

const COLUMNS = {
  donations: ['transaction_id', 'provider_transaction_id', 'status', 'amount', 'purpose', 'family_code',
    'payment_method', 'note', 'is_anonymous', 'created_at', 'donor_name', 'donor_email', 'donor_phone'],
  families: ['id', 'family_code', 'name', 'phone', 'sector', 'cell', 'village', 'ubudehe_category',
    'household_size', 'need_type', 'need_description', 'need_amount', 'funded', 'verification_status',
    'verification_notes', 'verified_at', 'supporting_notes', 'created_at'],
};

class ExportService {
  constructor({ donations, families }) {
    this.sources = { donations, families };
    this.exporters = new Map([new CsvExporter(), new XlsxExporter()].map((e) => [e.extension, e]));
  }

  async send(res, dataset, format) {
    const exporter = this.exporters.get(format);
    if (!COLUMNS[dataset] || !exporter) throw new NotFoundError('Unknown export');

    const rows = await this.sources[dataset].listForExport();
    await exporter.send(res, dataset, COLUMNS[dataset], rows);
  }
}

module.exports = ExportService;
