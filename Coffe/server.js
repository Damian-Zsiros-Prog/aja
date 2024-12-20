require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const connect = require("./db");
const cors = require("cors");
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

app.get("/", (req, res) => {
  res.json({ message: "Coffe working properly!" });
});

// if (connection) connection.release();

// SIMPLE USER READ
app.get("/users", async (req, res) => {
  let pool;
  let connection;
  try {
    pool = await connect();
    connection = await pool.getConnection();
    console.log("Conexión establecida con el pool");

    const query = "SELECT * FROM users";
    console.log("Ejecutando consulta:", query);

    const [rows] = await connection.query(query);
    console.log("Filas obtenidas:", rows);

    res.json({
      data: rows,
      status: 200,
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      message: "Error al obtener usuarios",
      error: err.message,
    });
  } finally {
    if (connection) connection.release(); // se supone que esto hace que se libere la conexion y asi poder spamear consultas a lo tonto
  }
});

// SIMPLE USER CREATE
app.post("/users", async (req, res) => {
  let pool;
  let connection;
  try {
    const { first_name, last_name, email, password } = req.body;

    pool = await connect();
    connection = await pool.getConnection();

    const [result] = await connection.query("CALL SP_CREATE_USER(?, ?, ?, ?)", [
      first_name,
      last_name,
      email,
      password,
    ]);

    res.status(201).json({
      message: "Usuario creado exitosamente",
      data: result[0],
    });
  } catch (err) {
    console.error("Error al crear usuario:", err);
    res.status(500).json({
      message: "Error al crear usuario",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
    // conexion.release();
  }
});

app.get("/accounts/:user_id", async (req, res) => {
  let pool;
  let connection;
  try {
    const { user_id } = req.params;

    pool = await connect();
    connection = await pool.getConnection();

    const [rowsTransaction] = await connection.query(
      "SELECT a.balance, (SELECT SUM(amount) FROM transactions WHERE sender_id = a.user_id AND amount > 0) AS total_incomes,(SELECT SUM(amount) FROM transactions WHERE sender_id = a.user_id AND amount < 0) AS total_spent  FROM accounts a WHERE a.user_id = ?;",
      [user_id]
    );
    res.json({
      data: rowsTransaction[0],
      message: "Cuenta obtenida exitosamente",
    });
  } catch (err) {
    console.error("Error al obtener cuenta:", err);
    res.status(500).json({
      message: "Error al obtener cuenta",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  let pool;
  let connection;
  try {
    const { email, password } = req.body;

    pool = await connect();
    connection = await pool.getConnection();

    const [result] = await connection.query("CALL SP_LOGIN(?, ?)", [
      email,
      password,
    ]);

    res.json({
      message: "Login exitoso",
      sessionInfo: {
        userInfo: result[0][0],
        accountInfo: result[1][0],
      },
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(401).json({
      message: "Credeniales inválidas",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

app.get("/transactions", async (req, res) => {
  let pool;
  let connection;
  try {
    pool = await connect();
    connection = await pool.getConnection();

    const searchParams = new URLSearchParams(req.query);
    const { fecha, tipo, user_id } = {
      fecha: searchParams.get("date"),
      tipo: searchParams.get("type"),
      user_id: searchParams.get("user_id"),
    };
    const queryInitial = "SELECT * FROM transactions";
    const queryFilters = [];
    if (fecha)
      queryFilters.push(
        `created_at BETWEEN '${fecha} 00:00:00' AND '${fecha} 23:59:59'`
      );
    if (tipo == "income") queryFilters.push(`amount  > 0`);
    if (tipo == "spent") queryFilters.push(`amount < 0`);
    if (user_id)
      queryFilters.push(
        `(sender_id = ${user_id} OR recipient_id = ${user_id})`
      );
    const queryFinal =
      (queryFilters.length
        ? queryInitial + " WHERE " + queryFilters.join(" AND ")
        : queryInitial) + " ORDER BY created_at DESC";
    console.log("Ejecutando consulta:", queryFinal);
    const [rows] = await connection.query(queryFinal);

    res.json({
      data: rows,
      message: "Transacciones obtenidas exitosamente",
    });
  } catch (err) {
    console.error("Error al obtener transacciones:", err);
    res.status(500).json({
      message: "Error al obtener transacciones",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

// SIMPLE TRANSFER
app.post("/transfers", async (req, res) => {
  let pool;
  let connection;
  try {
    const { sender_id, recipient_email, amount, message } = req.body;

    pool = await connect();
    connection = await pool.getConnection();

    const [result] = await connection.query(
      "CALL SP_MAKE_TRANSFER(?, ?, ?, ?)",
      [sender_id, recipient_email, amount, message || null]
    );

    res.status(201).json({
      message: "Transferencia realizada exitosamente",
      transfer: result[0][0],
    });
  } catch (err) {
    console.error("Error en transferencia:", err);
    res.status(500).json({
      message: "Error al realizar transferencia",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

// SIMPLE MAKE PAYMENT
app.post("/payments", async (req, res) => {
  let pool;
  let connection;
  try {
    const { user_id, amount, institution, payment_concept, paymentMethod } =
      req.body;

    pool = await connect();
    connection = await pool.getConnection();

    const [result] = await connection.query(
      "CALL SP_MAKE_PAYMENT(?, ?, ?, ?, ?)",
      [user_id, amount, institution, payment_concept, paymentMethod]
    );

    res.status(201).json({
      message: "Pago realizado exitosamente",
      payment: result[0][0],
    });
  } catch (err) {
    console.error("Error al realizar pago:", err);
    res.status(500).json({
      message: "Error al realizar pago",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

// SIMPLE ADD FUUNDAS
app.post("/addFunds", async (req, res) => {
  let pool;
  let connection;
  try {
    const { user_id, card_id, amount } = req.body;

    pool = await connect();
    connection = await pool.getConnection();
    const [result] = await connection.query(
      "CALL SP_ADD_FUNDS_FROM_CARD(?, ?, ?)",
      [user_id, card_id, amount]
    );

    res.status(201).json({
      message: "Fondos agregados exitosamente",
      transaction: result[0][0],
    });
  } catch (err) {
    console.error("Error al agregar fondos:", err);
    res.status(500).json({
      message: "Error al agregar fondos",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

// SIMPLE ADD CARD

app.post("/addCards", async (req, res) => {
  let pool;
  let connection;
  const { user_id, card_number, card_holder, expiration_date, card_type, cvv } =
    req.body; // esto es mejor en dentro o fuera del try catch??

  try {
    pool = await connect();
    connection = await pool.getConnection();
    console.log("Conexión establecida con el pool");

    const query = "CALL SP_ADD_CARD(?, ?, ?, ?, ?, ?)";
    const values = [
      user_id,
      card_number,
      card_holder,
      expiration_date,
      card_type,
      cvv,
    ];
    console.log(
      "Ejecutando procedimiento almacenado:",
      query,
      "con valores:",
      values
    );
    const [rows] = await connection.query(query, values);

    res.json({
      data: rows,
      message: "Tarjeta agregada exitosamente",
      status: 200,
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      message: "Error al agregar la tarjeta",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});
// servicio para obtener las tarjetas de un usuario
app.get("/cards/:user_id", async (req, res) => {
  let pool;
  let connection;
  try {
    const { user_id } = req.params;

    pool = await connect();
    connection = await pool.getConnection();

    const [rows] = await connection.query(
      "SELECT * FROM cards WHERE user_id = ?",
      [user_id]
    );

    res.json({
      data: rows,
      message: "Tarjetas obtenidas exitosamente",
    });
  } catch (err) {
    console.error("Error al obtener tarjetas:", err);
    res.status(500).json({
      message: "Error al obtener tarjetas",
      error: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

// <3 to the team
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server connected.... Port: ${PORT}`);
  console.log("<3 to the team");
});
