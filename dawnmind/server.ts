import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import multer from "multer";

dotenv.config();

const upload = multer();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Proxy Routes
  
  // Groq Chat Proxy
  app.post("/api/chat", async (req, res) => {
    const { messages } = req.body;
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      console.error("GROQ_API_KEY is missing in environment");
      return res.status(500).json({ error: "GROQ_API_KEY not configured" });
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          response_format: { type: "json_object" },
          max_tokens: 300,
          temperature: 0.8
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Groq API error:", errText);
        return res.status(response.status).send(errText);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Server error during Groq call:", error);
      res.status(500).json({ error: "Failed to connect to Groq" });
    }
  });

  // ElevenLabs STT Proxy
  app.post("/api/stt", upload.single('file'), async (req, res) => {
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const formData = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
      formData.append("file", blob, req.file.originalname);
      formData.append("model_id", "scribe_v1");

      const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenLabsKey },
        body: formData,
      });

      if (!response.ok) return res.status(response.status).send(await response.text());
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("STT Proxy error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // ElevenLabs TTS Proxy
  app.post("/api/tts", async (req, res) => {
    const { text, voiceId } = req.body;
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenLabsKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            speed: 0.82,
            style: 0.35
          },
        }),
      });

      if (!response.ok) return res.status(response.status).send(await response.text());

      const audioBuffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(audioBuffer));
    } catch (error) {
      console.error("TTS Proxy error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Vite Logic
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
