const ExcelJS = require('exceljs');
const Exporter = require('./Exporter');

class XlsxExporter extends Exporter {
  constructor() {
    super('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  async write(res, columns, rows) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Export');
    sheet.columns = columns.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 4)) }));
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    await workbook.xlsx.write(res);
    res.end();
  }
}

module.exports = XlsxExporter;
