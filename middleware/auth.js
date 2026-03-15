const jwt = require("jsonwebtoken");
const pool = require("../models/db");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"; // use env in production

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

// Middleware to check if user has required role
const authorizeRole = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user || !requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
};

// Middleware to check column edit permissions
const checkColumnPermission = async (req, res, next) => {
  const { id: sheetId } = req.params;
  const { cells } = req.body; // assume cells is array of {row_index, column_name, value}

  if (!cells || !Array.isArray(cells)) {
    return res.status(400).json({ error: "Invalid cells data" });
  }

  try {
    // Get editable roles for each column
    const columnNames = [...new Set(cells.map((cell) => cell.column_name))];
    const query = `
            SELECT column_name, editable_roles
            FROM columns
            WHERE sheet_id = $1 AND column_name = ANY($2)
        `;
    const result = await pool.query(query, [sheetId, columnNames]);

    const columnPermissions = {};
    result.rows.forEach((row) => {
      columnPermissions[row.column_name] = row.editable_roles;
    });

    // Check if user can edit each column
    const userRole = req.user.role;
    for (const cell of cells) {
      const roles = columnPermissions[cell.column_name];
      if (!roles || (!roles.includes(userRole) && userRole !== "ADMIN")) {
        return res
          .status(403)
          .json({ error: `No permission to edit column ${cell.column_name}` });
      }
    }

    next();
  } catch (error) {
    console.error("Permission check error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  authenticateToken,
  authorizeRole,
  checkColumnPermission,
  JWT_SECRET,
};
