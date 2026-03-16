const csv = require("csv-parser");
const xlsx = require("xlsx");
const fs = require("fs");

// Parse CSV file
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const columns = new Set();

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("headers", (headers) => {
        headers.forEach((header) => columns.add(header));
      })
      .on("data", (data) => results.push(data))
      .on("end", () => {
        resolve({
          columns: Array.from(columns),
          data: results,
        });
      })
      .on("error", reject);
  });
};

// Parse Excel file
const parseExcel = (filePath) => {
  console.log("Parsing Excel file:", filePath);
  try {
    const workbook = xlsx.readFile(filePath);
    console.log("Workbook sheets:", workbook.SheetNames);
    const sheetName = workbook.SheetNames[0]; // Assume first sheet
    const worksheet = workbook.Sheets[sheetName];
    // Parse with raw:false so formatted (display) values are returned (e.g., dates)
    // dateNF ensures Excel date serials are formatted as dd-MMM-yy (e.g., 11-Mar-26)
    const jsonData = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      dateNF: "dd-mmm-yy",
    });
    console.log("JSON data length:", jsonData.length);

    if (jsonData.length === 0) {
      return { columns: [], data: [] };
    }

    const columns = jsonData[0].map(
      (col) => col || `Column_${jsonData[0].indexOf(col) + 1}`,
    );
    console.log("Columns:", columns);

    const data = jsonData.slice(1).map((row) => {
      const obj = {};
      columns.forEach((col, index) => {
        obj[col] = row[index] || "";
      });
      return obj;
    });

    return {
      columns,
      data,
    };
  } catch (error) {
    console.error("Excel parse error:", error);
    throw error;
  }
};

// Main parser function
const parseFile = async (filePath, mimetype, originalname) => {
  console.log(
    "Parsing file:",
    filePath,
    "mimetype:",
    mimetype,
    "originalname:",
    originalname,
  );
  if (
    mimetype === "text/csv" ||
    mimetype === "application/csv" ||
    mimetype === "text/plain" ||
    filePath.endsWith(".csv") ||
    originalname.endsWith(".csv")
  ) {
    return await parseCSV(filePath);
  } else if (
    mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    filePath.endsWith(".xlsx") ||
    originalname.endsWith(".xlsx")
  ) {
    return parseExcel(filePath);
  } else {
    throw new Error("Unsupported file type: " + mimetype);
  }
};

module.exports = {
  parseFile,
};
