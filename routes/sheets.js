const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { body, validationResult } = require("express-validator");
const pool = require("../models/db");
const {
  authenticateToken,
  authorizeRole,
  checkColumnPermission,
} = require("../middleware/auth");
const { parseFile } = require("../utils/fileParser");
const { exportToCSV, exportToExcel } = require("../utils/fileExporter");

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (
      allowedTypes.includes(file.mimetype) ||
      file.originalname.endsWith(".csv") ||
      file.originalname.endsWith(".xlsx")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only CSV and XLSX are allowed."));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// POST /api/upload - Upload and parse file
router.post(
  "/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const { columns, data } = await parseFile(
        req.file.path,
        req.file.mimetype,
        req.file.originalname,
      );
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      res.json({ columns, data });
    } catch (error) {
      console.error("File parse error:", error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to parse file" });
    }
  },
);

// POST /api/sheets/configure - Configure columns and create sheet
router.post(
  "/configure",
  authenticateToken,
  [
    body("name").isLength({ min: 1 }).withMessage("Sheet name is required"),
    body("columns").isArray({ min: 1 }).withMessage("Columns are required"),
    body("columns.*.name")
      .isLength({ min: 1 })
      .withMessage("Column name is required"),
    body("columns.*.editableRoles")
      .isArray()
      .withMessage("Editable roles must be an array"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, columns } = req.body;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if sheet name already exists
      const existingSheet = await client.query(
        "SELECT id FROM sheets WHERE name = $1",
        [name],
      );
      if (existingSheet.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Sheet name already exists" });
      }

      // Create sheet
      const sheetResult = await client.query(
        "INSERT INTO sheets (name, created_by) VALUES ($1, $2) RETURNING id",
        [name, userId],
      );
      const sheetId = sheetResult.rows[0].id;

      // Insert columns
      for (const col of columns) {
        await client.query(
          "INSERT INTO columns (sheet_id, column_name, editable_roles) VALUES ($1, $2, $3)",
          [sheetId, col.name, JSON.stringify(col.editableRoles)],
        );
      }

      await client.query("COMMIT");
      res
        .status(201)
        .json({ sheetId, message: "Sheet configured successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Configure sheet error:", error);
      res.status(500).json({ error: "Failed to configure sheet" });
    } finally {
      client.release();
    }
  },
);

// POST /api/sheets/:id/data - Save data to sheet
router.post(
  "/:id/data",
  authenticateToken,
  [body("data").isArray().withMessage("Data must be an array")],
  async (req, res) => {
    const { id: sheetId } = req.params;
    const { data } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Clear existing data
      await client.query("DELETE FROM cells WHERE sheet_id = $1", [sheetId]);

      // Insert new data
      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        for (const [columnName, value] of Object.entries(row)) {
          await client.query(
            "INSERT INTO cells (sheet_id, row_index, column_name, value) VALUES ($1, $2, $3, $4)",
            [sheetId, rowIndex, columnName, value],
          );
        }
      }

      await client.query("COMMIT");
      res.json({ message: "Data saved successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Save data error:", error);
      res.status(500).json({ error: "Failed to save data" });
    } finally {
      client.release();
    }
  },
);

// GET /api/sheets - List sheets
router.get("/", authenticateToken, async (req, res) => {
  const userRole = req.user.role;

  try {
    let query, params;
    if (userRole === "ADMIN") {
      query =
        "SELECT id, name, created_by, created_at FROM sheets ORDER BY created_at DESC";
      params = [];
    } else {
      // For non-admin, show sheets where user has edit permissions on at least one column
      query = `
                SELECT DISTINCT s.id, s.name, s.created_by, s.created_at
                FROM sheets s
                JOIN columns c ON s.id = c.sheet_id
                WHERE c.editable_roles ? $1 OR $1 = 'ADMIN'
                ORDER BY s.created_at DESC
            `;
      params = [userRole];
    }

    const result = await pool.query(query, params);
    res.json({ sheets: result.rows });
  } catch (error) {
    console.error("List sheets error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/sheets/:id/data - Get sheet data
router.get("/:id/data", authenticateToken, async (req, res) => {
  const { id: sheetId } = req.params;
  const userRole = req.user.role;

  try {
    // Get columns with permissions
    const columnsResult = await pool.query(
      "SELECT column_name, editable_roles FROM columns WHERE sheet_id = $1 ORDER BY id",
      [sheetId],
    );

    const columns = columnsResult.rows.map((col) => ({
      name: col.column_name,
      canEdit: col.editable_roles.includes(userRole) || userRole === "ADMIN",
    }));

    // Get data
    const dataResult = await pool.query(
      "SELECT row_index, column_name, value FROM cells WHERE sheet_id = $1 ORDER BY row_index, column_name",
      [sheetId],
    );

    // Group by row
    const dataMap = {};
    dataResult.rows.forEach((cell) => {
      if (!dataMap[cell.row_index]) {
        dataMap[cell.row_index] = {};
      }
      dataMap[cell.row_index][cell.column_name] = cell.value;
    });

    const data = Object.values(dataMap);

    res.json({ columns, data });
  } catch (error) {
    console.error("Get sheet data error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/sheets/:id/cells - Update cells
router.put(
  "/:id/cells",
  authenticateToken,
  checkColumnPermission,
  [
    body("cells").isArray({ min: 1 }).withMessage("Cells are required"),
    body("cells.*.row_index")
      .isInt({ min: 0 })
      .withMessage("Valid row_index required"),
    body("cells.*.column_name")
      .isLength({ min: 1 })
      .withMessage("Column name required"),
    body("cells.*.value").isString().withMessage("Value must be a string"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: sheetId } = req.params;
    const { cells } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const cell of cells) {
        await client.query(
          `INSERT INTO cells (sheet_id, row_index, column_name, value)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (sheet_id, row_index, column_name)
                 DO UPDATE SET value = EXCLUDED.value`,
          [sheetId, cell.row_index, cell.column_name, cell.value],
        );
      }

      await client.query("COMMIT");
      res.json({ message: "Cells updated successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Update cells error:", error);
      res.status(500).json({ error: "Failed to update cells" });
    } finally {
      client.release();
    }
  },
);

// GET /api/roles - List all roles configured in users table
router.get("/roles", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT DISTINCT role FROM users");
    const roles = result.rows.map((row) => row.role);
    res.json({ roles });
  } catch (error) {
    console.error("Get roles error:", error);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});

// GET /api/sheets/:id/export - Export sheet
router.get("/:id/export", authenticateToken, async (req, res) => {
  const { id: sheetId } = req.params;
  const { format = "csv" } = req.query; // csv or xlsx

  try {
    // Get sheet name
    const sheetResult = await pool.query(
      "SELECT name FROM sheets WHERE id = $1",
      [sheetId],
    );
    if (sheetResult.rows.length === 0) {
      return res.status(404).json({ error: "Sheet not found" });
    }
    const sheetName = sheetResult.rows[0].name;

    // Get data
    const dataResult = await pool.query(
      "SELECT row_index, column_name, value FROM cells WHERE sheet_id = $1 ORDER BY row_index, column_name",
      [sheetId],
    );

    // Get columns
    const columnsResult = await pool.query(
      "SELECT column_name FROM columns WHERE sheet_id = $1 ORDER BY id",
      [sheetId],
    );
    const columns = columnsResult.rows.map((col) => col.column_name);

    // Build data array
    const dataMap = {};
    dataResult.rows.forEach((cell) => {
      if (!dataMap[cell.row_index]) {
        dataMap[cell.row_index] = {};
      }
      dataMap[cell.row_index][cell.column_name] = cell.value;
    });
    const data = Object.values(dataMap);

    if (format === "xlsx") {
      const buffer = exportToExcel(data, columns, sheetName);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${sheetName}.xlsx"`,
      );
      res.send(buffer);
    } else {
      const csv = exportToCSV(data, columns);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${sheetName}.csv"`,
      );
      res.send(csv);
    }
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

module.exports = router;
