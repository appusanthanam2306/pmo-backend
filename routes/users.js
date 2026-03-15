const express = require("express");
const bcrypt = require("bcrypt");
const { body, validationResult } = require("express-validator");
const pool = require("../models/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/users - List users (ADMIN only)
router.get(
  "/",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, username, role, created_at FROM users ORDER BY created_at DESC",
      );
      res.json({ users: result.rows });
    } catch (error) {
      console.error("List users error:", error);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /api/users - Create user (ADMIN only)
router.post(
  "/",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  [
    body("username")
      .isLength({ min: 3 })
      .withMessage("Username must be at least 3 characters"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("role").isIn(["ADMIN", "DM", "PM", "IRM"]).withMessage("Invalid role"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, role } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await pool.query(
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role",
        [username, hashedPassword, role],
      );
      res.status(201).json({ user: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        // unique violation
        return res.status(409).json({ error: "Username already exists" });
      }
      console.error("Create user error:", error);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// PUT /api/users/:id - Update user (ADMIN only)
router.put(
  "/:id",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  [
    body("username")
      .optional()
      .isLength({ min: 3 })
      .withMessage("Username must be at least 3 characters"),
    body("password")
      .optional()
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("role")
      .optional()
      .isIn(["ADMIN", "DM", "PM", "IRM"])
      .withMessage("Invalid role"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { username, password, role } = req.body;

    try {
      let query = "UPDATE users SET ";
      const values = [];
      const updates = [];

      if (username) {
        updates.push("username = $" + (values.length + 1));
        values.push(username);
      }
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push("password_hash = $" + (values.length + 1));
        values.push(hashedPassword);
      }
      if (role) {
        updates.push("role = $" + (values.length + 1));
        values.push(role);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      query +=
        updates.join(", ") +
        " WHERE id = $" +
        (values.length + 1) +
        " RETURNING id, username, role";
      values.push(id);

      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ user: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Username already exists" });
      }
      console.error("Update user error:", error);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// DELETE /api/users/:id - Delete user (ADMIN only)
router.delete(
  "/:id",
  authenticateToken,
  authorizeRole(["ADMIN"]),
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        "DELETE FROM users WHERE id = $1 RETURNING id",
        [id],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: "Server error" });
    }
  },
);

module.exports = router;
