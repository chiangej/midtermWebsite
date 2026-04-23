import { useState, useEffect } from "react";
import {
  MSG_MAX_LEN,
  apiGetMessages, apiPostMessage, apiDeleteMessage,
  sanitizeText,
} from "./utils.js";
import { UserAvatar } from "./UserPage.jsx";

const year = new Date().getFullYear();

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function MessageBoard({ onNavigate, session, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [text, setText]         = useState("");
  const [error, setError]       = useState("");
  const [pending, setPending]   = useState(false);

  useEffect(() => {
    apiGetMessages().then(setMessages).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!session) { setError("You must be signed in to post."); return; }
    const clean = sanitizeText(text.trim());
    if (!clean) { setError("Message cannot be empty."); return; }
    if (clean.length > MSG_MAX_LEN) { setError(`Max ${MSG_MAX_LEN} characters.`); return; }

    setPending(true);
    try {
      const msg = await apiPostMessage({ content: clean });
      setMessages(prev => [...prev, msg]);
      setText("");
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async (msgId) => {
    if (!session) return;
    try {
      await apiDeleteMessage(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
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
            <button className="logo logo--btn" onClick={() => onNavigate("home")} aria-label="Home">
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
            <span className="nav-current" aria-current="page">Board</span>
            {session && (
              <span className="nav-session">
                <UserAvatar user={session} size={24} />
                <span>{session.username}</span>
                <button className="nav-logout-btn" onClick={onLogout}>Sign out</button>
              </span>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-mini wrap" aria-labelledby="mb-title">
          <div className="hero-mini__copy">
            <p className="eyebrow">
              <span className="eyebrow__en">Community</span>
              <span className="eyebrow__slash" aria-hidden="true">/</span>
              <span className="eyebrow__sub">Message board</span>
            </p>
            <h1 id="mb-title">Message <span className="h1-accent">Board</span></h1>
            <p className="lede">Share your thoughts. Registered members can post and delete their own messages.</p>
          </div>
          <div className="hero-mini__badge" aria-hidden="true">
            <span className="hero-mini__count">{messages.length}</span>
            <span className="hero-mini__label">posts</span>
          </div>
        </section>

        <div className="wrap mb-layout">
          {/* Compose box */}
          <section className="mb-compose-section" aria-label="Post a message">
            {session ? (
              <div className="card mb-compose-card">
                <div className="mb-compose-who">
                  <UserAvatar user={session} size={36} />
                  <span className="mb-compose-name">Posting as <strong>{session.username}</strong></span>
                </div>
                <form onSubmit={handleSubmit} className="mb-form" noValidate>
                  <textarea
                    className={`mb-textarea${error ? " mb-textarea--err" : ""}`}
                    value={text}
                    onChange={e => { setText(e.target.value); setError(""); }}
                    placeholder="Write something…"
                    maxLength={MSG_MAX_LEN}
                    rows={4}
                    aria-label="Message text"
                  />
                  <div className="mb-form-footer">
                    <span className="mb-char-count" aria-live="polite">
                      {text.length} / {MSG_MAX_LEN}
                    </span>
                    {error && <span className="up-field-err" role="alert">{error}</span>}
                    <button type="submit" className="btn btn-primary mb-post-btn" disabled={pending || !text.trim()}>
                      <span>Post</span>
                      <span className="btn__glyph" aria-hidden="true">✦</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="card mb-login-prompt">
                <p>
                  <button className="link-btn" onClick={() => onNavigate("users")}>Sign in or register</button>
                  {" "}to post a message.
                </p>
              </div>
            )}
          </section>

          {/* Message list */}
          <section className="mb-messages-section" aria-label="Messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="card up-empty">
                <div className="up-empty__icon" aria-hidden="true">💬</div>
                <p className="up-empty__text">No messages yet.</p>
                <p className="up-empty__hint">Be the first to post!</p>
              </div>
            ) : (
              <ul className="mb-msg-list">
                {[...messages].reverse().map(msg => (
                  <li key={msg.id} className="mb-msg card">
                    <div className="mb-msg-avatar">
                      <UserAvatar user={msg} size={44} />
                    </div>
                    <div className="mb-msg-body">
                      <div className="mb-msg-meta">
                        <span className="mb-msg-username">{msg.username}</span>
                        <time className="mb-msg-time" dateTime={msg.createdAt}
                          title={new Date(msg.createdAt).toLocaleString()}>
                          {relativeTime(msg.createdAt)}
                        </time>
                        {session?.userId === msg.userId && (
                          <button
                            className="mb-delete-btn"
                            onClick={() => handleDelete(msg.id)}
                            aria-label={`Delete message by ${msg.username}`}
                          >✕ Delete</button>
                        )}
                      </div>
                      <p className="mb-msg-text">{msg.content}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-inner">
          <p className="footer__main">© {year} Yi Jie Chiang · React &amp; Vite</p>
          <p className="footer__whisper" aria-hidden="true">One quiet step at a time.</p>
        </div>
      </footer>
    </div>
  );
}
