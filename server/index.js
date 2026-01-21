import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import OpenAI from "openai";

import User from "./models/User.js";
import Chat from "./models/Chat.js";
import auth from "./middleware/auth.js";

/* -------------------- ENV -------------------- */
dotenv.config();

/* -------------------- DB -------------------- */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ Mongo Error:", err));

/* -------------------- APP -------------------- */
const app = express();
app.use(cors());
app.use(express.json());

/* -------------------- OPENAI -------------------- */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* -------------------- HEALTH -------------------- */
app.get("/", (req, res) => {
  res.send("✅ AI Server Running");
});

/* -------------------- REGISTER -------------------- */
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashedPassword,
    });

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------- LOGIN -------------------- */
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------- LANGUAGE DETECTOR -------------------- */
function detectLanguage(text) {
  if (/System\.out\.println|public class|static void main/.test(text)) return "Java";
  if (/def |print\(|import sys/.test(text)) return "Python";
  if (/console\.log|let |const |=>/.test(text)) return "JavaScript";
  if (/#include <|std::cout/.test(text)) return "C++";
  return "general programming";
}

/* -------------------- SYSTEM PROMPTS -------------------- */
const systemPrompts = {
  explain: `
You are an expert programming tutor.

IMPORTANT:
- Use proper Markdown
- Add blank lines between paragraphs
- Put headings on separate lines
- Use bullet points
`,
  debug: `
You are a senior software engineer.

IMPORTANT:
- Use Markdown
- Explain the bug clearly
- Show corrected code
`,
  generate: `
You are a professional developer.

IMPORTANT:
- Return clean Markdown
- Use fenced code blocks with language tags
`,
};

/* -------------------- ASK (STREAM + GUEST SUPPORT) -------------------- */
app.post("/ask-stream", async (req, res) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const { question, mode = "explain" } = req.body;

    if (!question?.trim()) {
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const language = detectLanguage(question);
    let userId = null;

    /* ----- OPTIONAL AUTH (GUEST OK) ----- */
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
      } catch {
        userId = null; // guest
      }
    }

    const systemPrompt = `
${systemPrompts[mode] || systemPrompts.explain}
Always respond using ${language}.
`;

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    });

    let fullAnswer = "";

    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content;
      if (!token) continue;

      fullAnswer += token;
      res.write(`data: ${token}\n\n`);
    }

    /* ----- SAVE ONLY IF LOGGED IN ----- */
    if (userId) {
      await Chat.create({
        userId,
        question,
        answer: fullAnswer,
        mode,
        language,
      });
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("STREAM ERROR:", err);
    res.end();
  }
});

/* -------------------- CHAT HISTORY (AUTH ONLY) -------------------- */
app.get("/history", auth, async (req, res) => {
  const chats = await Chat.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.json(chats);
});

/* -------------------- START SERVER -------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
