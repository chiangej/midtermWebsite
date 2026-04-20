import { useState } from "react";

const year = new Date().getFullYear();
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? "";

async function chatCompletion(messages, { temperature = 0.85, max_tokens = 800 } = {}) {
  let res;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature, max_tokens }),
    });
  } catch (networkErr) {
    throw new Error("網路連線失敗，請確認網路後重試。(" + networkErr.message + ")");
  }
  if (!res.ok) {
    let msg = `OpenAI error ${res.status}`;
    try { const e = await res.json(); msg = e?.error?.message ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

function SectionHead({ title, kicker }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <span className="section-head__kicker" aria-hidden="true">{kicker}</span>
      <span className="section-head__line" aria-hidden="true" />
    </div>
  );
}

function Spinner() {
  return <span className="ai-spinner" aria-label="Loading" />;
}

const STYLES = [
  { value: "casual",  label: "💬 輕鬆口語" },
  { value: "formal",  label: "�� 正式公文" },
  { value: "poetic",  label: "🌸 詩意文學" },
  { value: "bullet",  label: "📋 條列重點" },
  { value: "english", label: "🌐 翻譯英文" },
  { value: "emojify", label: "🎉 加入 Emoji" },
];

const SYSTEM_PROMPTS = {
  casual:  "請將使用者輸入的文字改寫成輕鬆、友善的口語聊天風格（繁體中文）。",
  formal:  "請將使用者輸入的文字改寫成嚴謹、正式的公文或商業書信風格（繁體中文）。",
  poetic:  "請將使用者輸入的文字改寫成富有詩意、文學感的散文風格（繁體中文）。",
  bullet:  "請將使用者輸入的文字整理成清晰的條列式重點（繁體中文），每點簡短有力。",
  english: "Please translate the user's input into natural, fluent English.",
  emojify: "請將使用者輸入的文字改寫，並在適當位置插入大量生動的 Emoji，使文字更活潑（繁體中文）。",
};

export default function AiPage({ onNavigate, session, onLogout }) {
  const [input, setInput]     = useState("");
  const [style, setStyle]     = useState("casual");
  const [result, setResult]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [copied, setCopied]   = useState(false);

  const styleLabel = STYLES.find(s => s.value === style)?.label ?? style;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    setError("");
    setResult("");
    setCopied(false);
    try {
      const out = await chatCompletion(
        [
          { role: "system", content: SYSTEM_PROMPTS[style] },
          { role: "user",   content: text },
        ],
        { max_tokens: 800 },
      );
      setResult(out);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="page">
      <span className="page__motif page__motif--1" aria-hidden="true" />
      <span className="page__motif page__motif--2" aria-hidden="true" />
      <span className="page__grain" aria-hidden="true" />

      <header className="site-header">
        <div className="wrap header-inner">
          <div className="brand">
            <button className="logo logo--btn" onClick={() => onNavigate("home")} aria-label="Back to home">
              <span className="logo__inner">AC</span>
            </button>
            <p className="brand__tag">
              <span className="brand__welcome">Welcome</span>
              <span className="brand__dot" aria-hidden="true" />
              <span className="brand__sub">personal studio</span>
            </p>
          </div>
          <nav className="nav" aria-label="Primary">
            <button className="nav-text-btn" onClick={() => onNavigate("home")}>Home</button>
            <button className="nav-text-btn" onClick={() => onNavigate("users")}>Users</button>
            <button className="nav-text-btn" onClick={() => onNavigate("board")}>Board</button>
            <span className="nav-current" aria-current="page">AI Tools</span>
            {session && (
              <span className="nav-session">
                <span className="nav-session-name">{session.username}</span>
                <button className="nav-logout-btn" onClick={onLogout}>Sign out</button>
              </span>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-mini wrap">
          <div className="hero-mini__copy">
            <p className="eyebrow">
              <span className="eyebrow__en">Powered by OpenAI</span>
              <span className="eyebrow__slash" aria-hidden="true">/</span>
              <span className="eyebrow__sub">GPT-4o mini</span>
            </p>
            <h1>AI <span className="h1-accent">文字改寫</span></h1>
            <p className="lede">貼上任何文字，選擇想要的風格，讓 AI 即時為你改寫。</p>
          </div>
          <div className="hero-mini__badge" aria-hidden="true">
            <span className="hero-mini__count">{STYLES.length}</span>
            <span className="hero-mini__label">styles</span>
          </div>
        </section>

        <div className="wrap">
          <section className="ai-tool-section section">
            <SectionHead title="文字改寫工具" kicker="Text Rewriter" />
            <div className="ai-rewrite-layout">

              {/* ── 輸入區 ── */}
              <div className="card ai-card">
                <p className="card-subtext">貼上或輸入文字，選擇改寫風格後送出。</p>
                <form className="ai-form" onSubmit={handleSubmit}>
                  <textarea
                    className="ai-textarea"
                    rows={9}
                    maxLength={2000}
                    placeholder="在這裡輸入或貼上想改寫的文字…"
                    value={input}
                    onChange={e => { setInput(e.target.value); setError(""); }}
                    disabled={loading}
                  />

                  <div className="ai-style-picker">
                    {STYLES.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        className={"ai-style-btn" + (style === s.value ? " ai-style-btn--active" : "")}
                        onClick={() => setStyle(s.value)}
                        disabled={loading}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="ai-form-footer">
                    <span className="ai-char">{input.length} / 2000</span>
                    <button
                      className="btn btn-primary ai-submit-btn"
                      type="submit"
                      disabled={loading || !input.trim()}
                    >
                      {loading
                        ? <><Spinner />改寫中…</>
                        : <><span>開始改寫</span><span className="btn__glyph">→</span></>
                      }
                    </button>
                  </div>
                </form>

                {error && (
                  <div className="ai-error" role="alert">⚠ {error}</div>
                )}
              </div>

              {/* ── 輸出區 ── */}
              <div className={"card ai-card ai-result-card" + (result ? " ai-result-card--visible" : "")}>
                <div className="ai-result-header">
                  <span className="ai-result-badge">{styleLabel}</span>
                  {result && (
                    <button className="ai-copy-btn" type="button" onClick={copyResult}>
                      {copied ? "✓ 已複製" : "複製"}
                    </button>
                  )}
                </div>
                {result
                  ? <p className="ai-result-text">{result}</p>
                  : <p className="ai-result-placeholder">改寫結果將顯示在這裡</p>
                }
              </div>

            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-inner">
          <p className="footer__main">© {year} Yi Jie Chiang · React &amp; Vite · GitHub Pages</p>
          <p className="footer__whisper" aria-hidden="true">One quiet step at a time.</p>
        </div>
      </footer>
    </div>
  );
}
