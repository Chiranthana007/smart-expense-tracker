const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "database.json");
const PUBLIC_FILES = new Set(["/", "/index.html", "/styles.css", "/app.js"]);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

let database = loadDatabase();

function loadDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    return { users: [], expenses: [], categories: [], sessions: [] };
  }

  try {
    const savedDatabase = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    return {
      users: savedDatabase.users || [],
      expenses: savedDatabase.expenses || [],
      categories: savedDatabase.categories || [],
      sessions: savedDatabase.sessions || []
    };
  } catch (error) {
    return { users: [], expenses: [], categories: [], sessions: [] };
  }
}

function saveDatabase() {
  fs.writeFileSync(DB_PATH, JSON.stringify(database, null, 2));
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function sendFile(response, requestPath) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;

  if (!PUBLIC_FILES.has(safePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = path.join(__dirname, safePath.slice(1));
  const extension = path.extname(filePath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "text/plain; charset=utf-8"
  });
  fs.createReadStream(filePath).pipe(response);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const passwordData = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(passwordData.hash), Buffer.from(user.passwordHash));
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  database.sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString()
  });
  saveDatabase();
  return token;
}

function getAuthUser(request) {
  const authHeader = request.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const session = database.sessions.find((item) => item.token === token);

  if (!session) {
    return null;
  }

  return database.users.find((user) => user.id === session.userId) || null;
}

async function register(request, response) {
  const body = await readBody(request);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (username.length < 3) {
    sendJson(response, 400, { error: "Username must have at least 3 characters." });
    return;
  }

  if (password.length < 4) {
    sendJson(response, 400, { error: "Password must have at least 4 characters." });
    return;
  }

  if (database.users.some((user) => user.username === username)) {
    sendJson(response, 409, { error: "This username already exists." });
    return;
  }

  const passwordData = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    username,
    salt: passwordData.salt,
    passwordHash: passwordData.hash,
    createdAt: new Date().toISOString()
  };
  database.users.push(user);
  const token = createSession(user.id);
  saveDatabase();

  sendJson(response, 201, { token, user: publicUser(user) });
}

async function login(request, response) {
  const body = await readBody(request);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const user = database.users.find((item) => item.username === username);

  if (!user || !verifyPassword(password, user)) {
    sendJson(response, 401, { error: "Invalid username or password." });
    return;
  }

  const token = createSession(user.id);
  sendJson(response, 200, { token, user: publicUser(user) });
}

function me(request, response) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, { error: "Please login again." });
    return;
  }

  sendJson(response, 200, { user: publicUser(user) });
}

function listExpenses(request, response) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, { error: "Please login again." });
    return;
  }

  const expenses = database.expenses.filter((expense) => expense.userId === user.id);
  sendJson(response, 200, { expenses });
}

function listCategories(request, response) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, { error: "Please login again." });
    return;
  }

  const categories = database.categories.filter((category) => category.userId === user.id);
  sendJson(response, 200, { categories });
}

async function addCategory(request, response) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, { error: "Please login again." });
    return;
  }

  const body = await readBody(request);
  const name = String(body.name || "").trim();
  const limit = Number(body.limit);

  if (!name || !limit || limit <= 0) {
    sendJson(response, 400, { error: "Please enter a category name and a valid limit." });
    return;
  }

  const existingCategory = database.categories.find((category) => (
    category.userId === user.id && category.name.toLowerCase() === name.toLowerCase()
  ));

  if (existingCategory) {
    existingCategory.limit = limit;
    existingCategory.updatedAt = new Date().toISOString();
    saveDatabase();
    sendJson(response, 200, { category: existingCategory });
    return;
  }

  const category = {
    id: crypto.randomUUID(),
    userId: user.id,
    name,
    limit,
    createdAt: new Date().toISOString()
  };
  database.categories.push(category);
  saveDatabase();
  sendJson(response, 201, { category });
}

function deleteCategory(request, response, categoryId) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, { error: "Please login again." });
    return;
  }

  database.categories = database.categories.filter((category) => (
    category.userId !== user.id || category.id !== categoryId
  ));
  saveDatabase();
  sendJson(response, 200, { ok: true });
}

async function addExpense(request, response) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, { error: "Please login again." });
    return;
  }

  const body = await readBody(request);
  const amount = Number(body.amount);
  const category = String(body.category || "").trim();
  const description = String(body.description || "").trim();

  if (!amount || amount <= 0 || !category || !description) {
    sendJson(response, 400, { error: "Please enter a valid amount, category, and description." });
    return;
  }

  const expense = {
    id: crypto.randomUUID(),
    userId: user.id,
    amount,
    category,
    description,
    createdAt: new Date().toISOString()
  };
  database.expenses.push(expense);
  saveDatabase();
  sendJson(response, 201, { expense });
}

function clearExpenses(request, response) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, { error: "Please login again." });
    return;
  }

  database.expenses = database.expenses.filter((expense) => expense.userId !== user.id);
  saveDatabase();
  sendJson(response, 200, { ok: true });
}

function logout(request, response) {
  const authHeader = request.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  database.sessions = database.sessions.filter((session) => session.token !== token);
  saveDatabase();
  sendJson(response, 200, { ok: true });
}

async function handleApi(request, response, pathname) {
  if (request.method === "POST" && pathname === "/api/register") {
    await register(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    await login(request, response);
    return;
  }

  if (request.method === "GET" && pathname === "/api/me") {
    me(request, response);
    return;
  }

  if (request.method === "GET" && pathname === "/api/expenses") {
    listExpenses(request, response);
    return;
  }

  if (request.method === "GET" && pathname === "/api/categories") {
    listCategories(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/categories") {
    await addCategory(request, response);
    return;
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/categories/")) {
    deleteCategory(request, response, pathname.split("/").pop());
    return;
  }

  if (request.method === "POST" && pathname === "/api/expenses") {
    await addExpense(request, response);
    return;
  }

  if (request.method === "DELETE" && pathname === "/api/expenses") {
    clearExpenses(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    logout(request, response);
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

const server = http.createServer(async (request, response) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }

    sendFile(response, pathname);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Smart Expense Tracker running on http://localhost:${PORT}`);
});
