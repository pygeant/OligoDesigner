import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import { GoogleGenAI } from "@google/genai";

const AI_MODEL = "gemini-2.5-flash";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cookieParser());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: "256kb" }));

  const APP_PASSWORD = process.env.APP_PASSWORD;

  // Password Gate Middleware
  app.use((req, res, next) => {
    // Skip if no password is set
    if (!APP_PASSWORD) {
      return next();
    }

    // Skip login route itself
    if (req.path === "/login") {
      return next();
    }

    // Check for session cookie
    if (req.cookies.session === APP_PASSWORD) {
      return next();
    }

    // Redirect to login or show login page
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login - OligoDesigner</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { background-color: #09090b; color: #fafafa; font-family: sans-serif; }
        </style>
      </head>
      <body class="flex items-center justify-center min-h-screen p-4">
        <div class="w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-2xl p-8 shadow-2xl">
          <div class="flex flex-col items-center mb-8">
            <div class="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h1 class="text-2xl font-bold tracking-tight">OligoDesigner Pro</h1>
            <p class="text-zinc-500 text-sm mt-2">Please enter the password to continue.</p>
          </div>
          
          <form action="/login" method="POST" class="space-y-4">
            <div>
              <input 
                type="password" 
                name="password" 
                placeholder="Enter password" 
                required 
                autofocus
                class="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              >
            </div>
            <button 
              type="submit" 
              class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
            >
              Unlock Application
            </button>
          </form>
          
          <div class="mt-8 pt-8 border-t border-zinc-900 text-center">
            <p class="text-[10px] text-zinc-600 uppercase tracking-widest">© Pierre-Yves GEANT | OligoDesigner</p>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  // Handle Login POST
  app.post("/login", (req, res) => {
    const { password } = req.body;
    if (password === APP_PASSWORD) {
      res.cookie("session", APP_PASSWORD, { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
      res.redirect("/");
    } else {
      res.send(`
        <script>
          alert("Incorrect password. Please try again.");
          window.location.href = "/";
        </script>
      `);
    }
  });

  // --- AI proxy ------------------------------------------------------------
  // The API key stays on the server: it is never sent to the browser and never
  // baked into the standalone build.
  const aiKey = process.env.GEMINI_API_KEY;
  const genai = aiKey ? new GoogleGenAI({ apiKey: aiKey }) : null;

  app.get("/api/ai/health", (_req, res) => {
    res.json({ configured: Boolean(genai), model: AI_MODEL });
  });

  // Coarse in-memory throttle: enough to stop a runaway client loop.
  const callTimes: number[] = [];
  const RATE_WINDOW_MS = 60_000;
  const RATE_LIMIT = 30;

  app.post("/api/ai/generate", async (req, res) => {
    if (!genai) {
      return res.status(503).json({ error: "GEMINI_API_KEY non configurée côté serveur." });
    }

    const now = Date.now();
    while (callTimes.length && now - callTimes[0] > RATE_WINDOW_MS) callTimes.shift();
    if (callTimes.length >= RATE_LIMIT) {
      return res.status(429).json({ error: "Trop de requêtes, réessayez dans une minute." });
    }
    callTimes.push(now);

    const { prompt, system, schema } = req.body ?? {};
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "prompt manquant." });
    }

    try {
      const response = await genai.models.generateContent({
        model: AI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: typeof system === "string" ? system : undefined,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      res.json({ text: response.text });
    } catch (error) {
      console.error("AI proxy error", error);
      res.status(502).json({ error: "Échec de l'appel au modèle." });
    }
  });

  // API route to download the standalone HTML app
  app.get("/api/download-app", (req, res) => {
    const distPath = path.join(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(distPath)) {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', 'attachment; filename="OligoDesigner_Standalone.html"');
      res.sendFile(distPath);
    } else {
      res.status(404).send("Standalone app not found. Please wait for build to complete.");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
