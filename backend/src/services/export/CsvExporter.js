const Exporter = require('./Exporter');

class CsvExporter extends Exporter {
  constructor() {
    super('csv', 'text/csv; charset=utf-8');
  }

  // Quotes a value when it contains a comma, quote or line break
  static cell(value) {
    const s = String(value == null ? '' : value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  static toCsv(columns, rows) {
    const lines = rows.map((row) => columns.map((c) => CsvExporter.cell(row[c])).join(','));
    return [columns.join(','), ...lines].join('\n');
  }

  async write(res, columns, rows) {
    res.end(CsvExporter.toCsv(columns, rows));
  }
}

module.exports = CsvExporter;
