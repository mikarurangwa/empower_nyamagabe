// Each export format extends this and writes rows to the HTTP response its own way
class Exporter {
  constructor(extension, contentType) {
    if (new.target === Exporter) throw new TypeError('Exporter cannot be used directly');
    this.extension = extension;
    this.contentType = contentType;
  }

  async send(res, filename, columns, rows) {
    res.setHeader('Content-Type', this.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.${this.extension}"`);
    await this.write(res, columns, rows);
  }

  async write() {
    throw new Error(`${this.constructor.name} must implement write()`);
  }
}

module.exports = Exporter;
