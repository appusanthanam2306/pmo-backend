const xlsx = require("xlsx");

// Export data to CSV
const exportToCSV = (data, columns) => {
  const csvRows = [];
  // Header
  csvRows.push(columns.join(","));
  // Data rows
  data.forEach((row) => {
    const values = columns.map((col) => {
      const value = row[col] || "";
      // Escape commas and quotes
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values.join(","));
  });
  return csvRows.join("\n");
};

// Export data to Excel
const exportToExcel = (data, columns, sheetName = "Sheet1") => {
  const worksheetData = [columns]; // Header row
  data.forEach((row) => {
    const rowData = columns.map((col) => row[col] || "");
    worksheetData.push(rowData);
  });

  const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
};

module.exports = {
  exportToCSV,
  exportToExcel,
};
