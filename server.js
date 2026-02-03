const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const { Pool } = require("pg");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/abc",
});

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "abcqr-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use("/clis", express.static(path.join(__dirname, "clis")));
app.use("/admin/public", express.static(path.join(__dirname, "admin", "public")));
app.use("/admin/private", requireAuth, express.static(path.join(__dirname, "admin", "private")));

const upload = multer({ storage: multer.memoryStorage() });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      business_id INTEGER REFERENCES businesses(id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prods (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      prec NUMERIC NOT NULL,
      active BOOLEAN DEFAULT true,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      img1 TEXT,
      img2 TEXT,
      img3 TEXT,
      img4 TEXT
    );
  `);

  await pool.query(
    `INSERT INTO users (id, username, password, business_id)
     VALUES (1, 'abc', 'abc123', NULL)
     ON CONFLICT (username) DO NOTHING;`
  );
}

function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }
  return res.redirect("/admin/public");
}

function isRoot(user) {
  return user?.id === 1 && user?.username === "abc";
}

app.get("/", (req, res) => {
  if (req.session?.user) {
    return res.redirect("/admin/private");
  }
  return res.redirect("/admin/public");
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  const user = result.rows[0];
  if (!user || user.password !== password) {
    return res.status(401).json({ ok: false, message: "Credenciales inválidas" });
  }
  req.session.user = {
    id: user.id,
    username: user.username,
    business_id: user.business_id,
  };
  return res.json({ ok: true });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post("/api/upload", requireAuth, upload.array("images", 4), async (req, res) => {
  const user = req.session.user;
  const businessId = Number(req.body.business_id || user.business_id);
  if (!isRoot(user) && businessId !== user.business_id) {
    return res.status(403).json({ ok: false, message: "Sin permisos" });
  }

  const dir = path.join(__dirname, "clis", String(businessId), "imgs");
  fs.mkdirSync(dir, { recursive: true });

  const paths = [];
  for (const file of req.files) {
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`;
    const target = path.join(dir, filename);
    fs.writeFileSync(target, file.buffer);
    paths.push(`/clis/${businessId}/imgs/${filename}`);
  }

  return res.json({ ok: true, paths });
});

io.engine.use(sessionMiddleware);

io.use((socket, next) => {
  const session = socket.request.session;
  if (session?.user) {
    return next();
  }
  return next(new Error("unauthorized"));
});

io.on("connection", (socket) => {
  const sessionUser = socket.request.session.user;

  socket.on("init", async () => {
    const payload = await buildPayload(sessionUser);
    socket.emit("init_data", payload);
  });

  socket.on("product:create", async (data) => {
    const user = socket.request.session.user;
    const businessId = Number(data.business_id || user.business_id);
    if (!isRoot(user) && businessId !== user.business_id) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query(
      `INSERT INTO prods (title, description, prec, active, business_id, img1, img2, img3, img4)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.title,
        data.description,
        data.prec,
        data.active,
        businessId,
        data.img1 || null,
        data.img2 || null,
        data.img3 || null,
        data.img4 || null,
      ]
    );
    socket.emit("action_result", { ok: true, message: "Producto creado", data: result.rows[0] });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("product:update", async (data) => {
    const user = socket.request.session.user;
    const existing = await pool.query("SELECT * FROM prods WHERE id = $1", [data.id]);
    const prod = existing.rows[0];
    if (!prod) {
      return socket.emit("action_result", { ok: false, message: "Producto no encontrado" });
    }
    if (!isRoot(user) && prod.business_id !== user.business_id) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query(
      `UPDATE prods
       SET title = $1, description = $2, prec = $3, active = $4, img1 = $5, img2 = $6, img3 = $7, img4 = $8
       WHERE id = $9
       RETURNING *`,
      [
        data.title,
        data.description,
        data.prec,
        data.active,
        data.img1 || null,
        data.img2 || null,
        data.img3 || null,
        data.img4 || null,
        data.id,
      ]
    );
    if (result.rowCount === 0) {
      return socket.emit("action_result", { ok: false, message: "No se actualizó" });
    }
    socket.emit("action_result", { ok: true, message: "Producto editado", data: result.rows[0] });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("product:copy", async ({ id }) => {
    const user = socket.request.session.user;
    const existing = await pool.query("SELECT * FROM prods WHERE id = $1", [id]);
    const prod = existing.rows[0];
    if (!prod) {
      return socket.emit("action_result", { ok: false, message: "Producto no encontrado" });
    }
    if (!isRoot(user) && prod.business_id !== user.business_id) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query(
      `INSERT INTO prods (title, description, prec, active, business_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [prod.title, prod.description, prod.prec, prod.active, prod.business_id]
    );
    socket.emit("action_result", { ok: true, message: "Producto copiado", data: result.rows[0] });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("product:delete", async ({ id }) => {
    const user = socket.request.session.user;
    const prod = await pool.query("SELECT * FROM prods WHERE id = $1", [id]);
    if (!prod.rows[0]) {
      return socket.emit("action_result", { ok: false, message: "Producto no encontrado" });
    }
    if (!isRoot(user) && prod.rows[0].business_id !== user.business_id) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query("DELETE FROM prods WHERE id = $1 RETURNING *", [id]);
    if (result.rowCount === 0) {
      return socket.emit("action_result", { ok: false, message: "No se eliminó" });
    }
    socket.emit("action_result", { ok: true, message: "Producto eliminado" });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("product:delete_many", async ({ ids }) => {
    const user = socket.request.session.user;
    if (!Array.isArray(ids) || ids.length === 0) {
      return socket.emit("action_result", { ok: false, message: "Sin selección" });
    }
    let allowedIds = ids;
    if (!isRoot(user)) {
      const allowed = await pool.query(
        "SELECT id FROM prods WHERE id = ANY($1) AND business_id = $2",
        [ids, user.business_id]
      );
      allowedIds = allowed.rows.map((row) => row.id);
    }
    const result = await pool.query("DELETE FROM prods WHERE id = ANY($1) RETURNING *", [allowedIds]);
    if (result.rowCount === 0) {
      return socket.emit("action_result", { ok: false, message: "No se eliminaron" });
    }
    socket.emit("action_result", { ok: true, message: `${result.rowCount} productos eliminados` });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("business:create", async ({ name }) => {
    const user = socket.request.session.user;
    if (!isRoot(user)) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query("INSERT INTO businesses (name) VALUES ($1) RETURNING *", [name]);
    socket.emit("action_result", { ok: true, message: "Negocio creado", data: result.rows[0] });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("business:update", async ({ id, name }) => {
    const user = socket.request.session.user;
    if (!isRoot(user)) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query("UPDATE businesses SET name = $1 WHERE id = $2 RETURNING *", [name, id]);
    if (result.rowCount === 0) {
      return socket.emit("action_result", { ok: false, message: "No se actualizó" });
    }
    socket.emit("action_result", { ok: true, message: "Negocio editado" });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("business:delete", async ({ id }) => {
    const user = socket.request.session.user;
    if (!isRoot(user)) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query("DELETE FROM businesses WHERE id = $1 RETURNING *", [id]);
    if (result.rowCount === 0) {
      return socket.emit("action_result", { ok: false, message: "No se eliminó" });
    }
    socket.emit("action_result", { ok: true, message: "Negocio eliminado" });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("user:create", async ({ username, password, business_id }) => {
    const user = socket.request.session.user;
    if (!isRoot(user)) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query(
      "INSERT INTO users (username, password, business_id) VALUES ($1, $2, $3) RETURNING *",
      [username, password, business_id || null]
    );
    socket.emit("action_result", { ok: true, message: "Usuario creado", data: result.rows[0] });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("user:update", async ({ id, username, password, business_id }) => {
    const user = socket.request.session.user;
    if (!isRoot(user)) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query(
      "UPDATE users SET username = $1, password = $2, business_id = $3 WHERE id = $4 RETURNING *",
      [username, password, business_id || null, id]
    );
    if (result.rowCount === 0) {
      return socket.emit("action_result", { ok: false, message: "No se actualizó" });
    }
    socket.emit("action_result", { ok: true, message: "Usuario editado" });
    socket.emit("refresh", await buildPayload(user));
  });

  socket.on("user:delete", async ({ id }) => {
    const user = socket.request.session.user;
    if (!isRoot(user)) {
      return socket.emit("action_result", { ok: false, message: "Sin permisos" });
    }
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING *", [id]);
    if (result.rowCount === 0) {
      return socket.emit("action_result", { ok: false, message: "No se eliminó" });
    }
    socket.emit("action_result", { ok: true, message: "Usuario eliminado" });
    socket.emit("refresh", await buildPayload(user));
  });
});

async function buildPayload(user) {
  const isRootUser = isRoot(user);
  const businesses = isRootUser
    ? (await pool.query("SELECT * FROM businesses ORDER BY id")).rows
    : [];
  const users = isRootUser ? (await pool.query("SELECT * FROM users ORDER BY id")).rows : [];
  const products = isRootUser
    ? (await pool.query("SELECT * FROM prods ORDER BY id")).rows
    : (await pool.query("SELECT * FROM prods WHERE business_id = $1 ORDER BY id", [user.business_id]))
        .rows;
  return {
    user: { id: user.id, username: user.username, business_id: user.business_id },
    businesses,
    users,
    products,
  };
}

initDb().then(() => {
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Servidor iniciado en ${port}`);
  });
});
