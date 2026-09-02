const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "radar_editorial",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: "utf8mb4",
});

app.get("/api/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({
      ok: rows[0]?.ok === 1,
      service: "radar-editorial",
      framework: "express",
      node: process.version,
      database: "mysql",
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: "radar-editorial",
      framework: "express",
      node: process.version,
      database: "mysql",
      error: "database_unavailable",
    });
  }
});

app.get("/api/investigations", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, status, created_at, updated_at
      FROM investigations
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "failed_to_list_investigations" });
  }
});

app.post("/api/investigations", async (req, res) => {
  const title = String(req.body?.title || "").trim();

  if (!title) {
    return res.status(400).json({ error: "title_required" });
  }

  if (title.length > 500) {
    return res.status(400).json({ error: "title_too_long" });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO investigations (title, status) VALUES (?, 'created')`,
      [title]
    );

    const [rows] = await pool.execute(
      `SELECT id, title, status, created_at, updated_at
       FROM investigations WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "failed_to_create_investigation" });
  }
});

app.get("/api/investigations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "invalid_id" });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, title, status, created_at, updated_at
       FROM investigations WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "investigation_not_found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "failed_to_get_investigation" });
  }
});

const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Radar Editorial running on port ${port}`);
});
