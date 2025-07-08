// server.js
import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

app.use(
  session({
    secret: "a-super-secret-key-for-pwa-demo",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // In production, this MUST be true
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(express.static(path.join(__dirname, "public")));

async function getUsers() {
  const usersData = await fs.readFile(path.join(__dirname, "users.json"));
  return JSON.parse(usersData);
}

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
    req.session.userId = user.username;
    res.status(200).json({ message: "Login successful." });
  } else {
    res.status(401).json({ error: "Invalid credentials." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(
    "Place all client-side files (index.html, *.js) in the 'public' sub-directory."
  );
});
