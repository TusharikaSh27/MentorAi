import { useState, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const API = "http://localhost:5000";

export default function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState("explain");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  /* ---------------- LOGIN ---------------- */
  const loginUser = async () => {
    try {
      const res = await axios.post(`${API}/login`, { email, password });
      localStorage.setItem("token", res.data.token);
      setIsLoggedIn(true);
      loadHistory();
      alert("Login successful");
    } catch {
      alert("Login failed");
    }
  };

  /* ---------------- ASK AI (STREAM) ---------------- */
  const askAI = async () => {
    const token = localStorage.getItem("token");

    setAnswer("");
    setLoading(true);

    const response = await fetch(`${API}/ask-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ question, mode }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const parts = chunk.split("\n\n");

      for (let part of parts) {
        if (part.startsWith("data: ")) {
          const data = part.replace("data: ", "");
          if (data === "[DONE]") {
            setLoading(false);
            return;
          }
          fullText += data;
          setAnswer(fullText);
        }
      }
    }

    setLoading(false);
  };

  /* ---------------- LOAD HISTORY ---------------- */
  const loadHistory = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await axios.get(`${API}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHistory(res.data);
    } catch {
      console.log("No history");
    }
  };

  /* ---------------- AUTO LOGIN ---------------- */
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setIsLoggedIn(true);
      loadHistory();
    }
  }, []);

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: "auto" }}>
      <h1>🤖 MentorAi</h1>

      {/* ---------- LOGIN ---------- */}
      {!isLoggedIn && (
        <div style={{ marginBottom: 20 }}>
          <h3>🔐 Login</h3>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <br />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <br />
          <button onClick={loginUser}>Login</button>
        </div>
      )}

      {/* ---------- AI ---------- */}
      <select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="explain">Explain</option>
        <option value="debug">Debug</option>
        <option value="generate">Generate</option>
      </select>

      <textarea
        rows="5"
        placeholder="Ask your coding doubt..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        style={{ width: "100%", marginTop: 10 }}
      />

      <button onClick={askAI} style={{ marginTop: 10 }}>
        Ask AI
      </button>

      {!isLoggedIn && (
        <p style={{ fontSize: 14, opacity: 0.7, marginTop: 6 }}>
          👤 Using as Guest — login to save history
        </p>
      )}

      {loading && <p>Thinking...</p>}

      {/* ---------- ANSWER ---------- */}
      {answer && (
        <div className="answer">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h2>{children}</h2>,
              h2: ({ children }) => <h3>{children}</h3>,
              h3: ({ children }) => <h4>{children}</h4>,
              code({ inline, className, children }) {
                const match = /language-(\w+)/.exec(className || "");
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code>{children}</code>
                );
              },
            }}
          >
            {answer}
          </ReactMarkdown>
        </div>
      )}

      {/* ---------- HISTORY (ONLY IF LOGGED IN) ---------- */}
      {isLoggedIn && (
        <>
          <h2>🕘 Chat History</h2>
          {history.map((h, i) => (
            <div key={i}>
              <p>
                <b>You:</b> {h.question}
              </p>
              <SyntaxHighlighter style={oneDark}>
                {h.answer}
              </SyntaxHighlighter>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
