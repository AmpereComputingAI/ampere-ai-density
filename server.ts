import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  console.log("Server starting...");
  console.log("NODE_ENV:", process.env.NODE_ENV);

  const getLlamaUrl = (id: string) => {
    const envVar = `LLAMA_API_URL_${id}`;
    return process.env[envVar] || `http://localhost:808${parseInt(id) - 1}`;
  };

  app.get("/api/status/:id", async (req, res) => {
    console.log(`Status check for instance ${req.params.id}`);
    try {
      const url = getLlamaUrl(req.params.id);
      console.log(`Fetching health from: ${url}/health`);
      
      const [healthRes, metricsRes] = await Promise.all([
        fetch(`${url}/health`),
        fetch(`${url}/metrics`).catch(() => null)
      ]);

      if (!healthRes.ok) {
        throw new Error(`llama.cpp health API error: ${healthRes.statusText}`);
      }
      
      const healthData = await healthRes.json();
      let cpuUsage = 0;
      
      if (metricsRes && metricsRes.ok) {
        const metricsText = await metricsRes.text();
        // Simple parsing for llama.cpp metrics (assuming it returns some CPU metric)
        // This is a placeholder as the actual metrics format depends on the llama.cpp version
        const match = metricsText.match(/llama_cpu_usage_percent (\d+\.?\d*)/);
        if (match) {
          cpuUsage = parseFloat(match[1]);
        }
      }

      res.json({ 
        status: healthData.status === "ok" ? "online" : "offline", 
        details: healthData,
        cpuUsage
      });
    } catch (error: any) {
      console.log(`Status check failed for ${req.params.id}: ${error.message}`);
      res.json({ status: "offline", error: error.message });
    }
  });

  app.post("/api/chat/:id", async (req, res) => {
    console.log(`Chat request for instance ${req.params.id}`);
    try {
      const url = getLlamaUrl(req.params.id);
      const { prompt } = req.body;
      const response = await fetch(`${url}/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`,
          n_predict: 256,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`llama.cpp API error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.log(`Chat request failed for ${req.params.id}: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static files from dist...");
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();