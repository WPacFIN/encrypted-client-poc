import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const app = express();
const port = 3000;

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middleware ---
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Session middleware setup
app.use(
  session({
    secret: "a-super-secret-key-for-pwa-demo", // In production, use a long, random string from an env variable
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // In production, this MUST be true (requires HTTPS)
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// --- Static File Serving ---
app.use(express.static(path.join(__dirname, "public")));
// --- Authentication Logic ---
async function getUsers() {
  const usersData = await fs.readFile(path.join(__dirname, "users.json"));
  return JSON.parse(usersData);
}

// Middleware to protect routes
function requireAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: "Authentication required." });
  }
}

// --- API Endpoints ---
const WRAPPED_DEK_COOKIE_NAME = "wrapped-dek";

// API endpoint for user login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  const users = await getUsers();
  const user = users.find((u) => u.username === username);

  if (user && user.password === password) {
    req.session.userId = user.username; // Store user identifier in session
    res
      .status(200)
      .json({ message: "Login successful.", username: user.username });
  } else {
    res.status(401).json({ error: "Invalid credentials." });
  }
});

// API endpoint to set the wrapped DEK in an HttpOnly cookie
// This endpoint is now protected and requires an active session.
app.post("/api/set-dek", requireAuth, (req, res) => {
  const { wrappedDek } = req.body;
  if (!wrappedDek) {
    return res.status(400).json({ error: "wrappedDek is required" });
  }

  res.cookie(WRAPPED_DEK_COOKIE_NAME, wrappedDek, {
    httpOnly: true,
    secure: false, // In production, set to true
    sameSite: "strict",
    path: "/", // Ensure the cookie is accessible across the app
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.status(200).json({ message: "DEK stored successfully." });
});

// --- Root Route ---
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Server Startup ---
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(
    "Place all client-side files (index.html, *.js) in the 'public' sub-directory."
  );
});
