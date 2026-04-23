import { useState, useRef, useEffect } from "react";
import {
  MAX_USERS, AVATAR_MAX_BYTES, LOCKOUT_MAX,
  apiGetUsers, apiRegister, apiLogin,
  validateImageMagicBytes, fileToDataUrl,
  isRateLimited, isLoginLocked, recordLoginFail, clearLoginFail,
  saveSession,
  maskEmail, avatarInitialColor,
} from "./utils.js";

const year = new Date().getFullYear();
const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);

const EMPTY_REG   = { username: "", email: "", password: "", confirm: "", website: "" };
const EMPTY_LOGIN = { username: "", password: "" };

// ── Shared sub-components ─────────────────────────────────────────
function SectionHead({ title, kicker }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <span className="section-head__kicker" aria-hidden="true">{kicker}</span>
      <span className="section-head__line" aria-hidden="true" />
    </div>
  );
}

export function UserAvatar({ user, size = 40 }) {
  const [imgError, setImgError] = useState(false);
  const style = { width: size, height: size };

  const initial = (
    <div
      className="up-user-avatar"
      style={{ ...style, background: avatarInitialColor(user?.username ?? "?") }}
      aria-hidden="true"
    >
      {(user?.username ?? "?").charAt(0).toUpperCase()}
    </div>
  );

  if (user?.avatar && !imgError) {
    // Only render data: URIs with JPEG or PNG MIME type.
    // Blocks SVG/HTML/javascript: XSS vectors stored in the DB.
    const safeSrc = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]/.test(user.avatar)
      ? user.avatar
      : null;
    // If avatar doesn't pass the whitelist, show the initial letter fallback.
    if (!safeSrc) return initial;
    return (
      <img
        src={safeSrc}
        alt={user.username}
        className="up-avatar-img"
        style={style}
        referrerPolicy="no-referrer"
        // On load failure (corrupted / fake data URI), fall back to initial letter
        // instead of hiding the element and leaving blank space.
        onError={() => setImgError(true)}
      />
    );
  }
  return initial;
}

// ── Avatar file picker ────────────────────────────────────────────
function AvatarPicker({ preview, error, onChange }) {
  const ref = useRef(null);
  return (
    <div className="up-field">
      <label className="up-label">
        Profile Picture <span className="up-label-opt">(JPG / PNG, max 2 MB)</span>
      </label>
      <div className="up-avatar-picker">
        {preview ? (
          <img
            src={/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]/.test(preview) ? preview : ""}
            alt="Avatar preview"
            className="up-avatar-preview"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="up-avatar-placeholder" aria-hidden="true">📷</div>
        )}
        <button
          type="button"
          className="btn btn-ghost up-avatar-btn"
          onClick={() => ref.current?.click()}
        >
          {preview ? "Change photo" : "Choose photo"}
        </button>
        <input
          ref={ref}
          type="file"
          accept="image/jpeg,image/png"
          style={{ display: "none" }}
          onChange={onChange}
        />
      </div>
      {error && <span className="up-field-err" role="alert">{error}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export default function UserPage({ onNavigate, session, onLogin, onLogout }) {
  const [users, setUsers] = useState([]);
  const [tab, setTab]     = useState("register"); // "register" | "login"

  // Fetch users from MongoDB on mount
  useEffect(() => {
    apiGetUsers().then(setUsers).catch(() => {});
  }, []);

  // ── Register state ──────────────────────────────────────────
  const [regForm, setRegForm]             = useState(EMPTY_REG);
  const [regErrors, setRegErrors]         = useState({});
  const [regSuccess, setRegSuccess]       = useState(false);
  const [regPending, setRegPending]       = useState(false);
  const [avatarFile, setAvatarFile]       = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarError, setAvatarError]     = useState("");

  // ── Login state ─────────────────────────────────────────────
  const [loginForm, setLoginForm]       = useState(EMPTY_LOGIN);
  const [loginError, setLoginError]     = useState("");
  const [loginPending, setLoginPending] = useState(false);

  // ── Avatar file handling ─────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    setAvatarError("");
    if (!file) { setAvatarFile(null); setAvatarPreview(null); return; }

    if (!ALLOWED_MIME.has(file.type)) {
      setAvatarError("Only JPG and PNG files are allowed.");
      e.target.value = ""; return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError("File must be 2 MB or smaller.");
      e.target.value = ""; return;
    }
    const validBytes = await validateImageMagicBytes(file);
    if (!validBytes) {
      setAvatarError("File content does not match a valid JPEG or PNG.");
      e.target.value = ""; return;
    }
    setAvatarFile(file);
    const preview = await fileToDataUrl(file);
    setAvatarPreview(preview);
  };

  // ── Validate registration ────────────────────────────────────
  const validateReg = () => {
    const e = {};
    const username = regForm.username.trim();
    const email    = regForm.email.trim();
    if (!username)
      e.username = "Username is required.";
    else if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
      e.username = "3–20 characters; letters, numbers, underscores only.";

    if (!email)
      e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = "Invalid email format.";

    if (!regForm.password)
      e.password = "Password is required.";
    else if (regForm.password.length < 8)
      e.password = "At least 8 characters required.";
    else if (!/[A-Z0-9!@#$%^&*]/.test(regForm.password))
      e.password = "Include at least one uppercase letter, number, or symbol.";

    if (!regForm.confirm)
      e.confirm = "Please confirm your password.";
    else if (regForm.password !== regForm.confirm)
      e.confirm = "Passwords do not match.";

    return e;
  };

  // ── Submit registration ──────────────────────────────────────
  const handleRegSubmit = async (e) => {
    e.preventDefault();
    if (regForm.website) { setRegForm(EMPTY_REG); setRegSuccess(true); return; } // honeypot
    if (isRateLimited()) {
      setRegErrors({ form: "Too many attempts. Please wait a minute." }); return;
    }
    const errs = validateReg();
    if (Object.keys(errs).length > 0) { setRegErrors(errs); return; }

    setRegPending(true);
    try {
      const avatar  = avatarFile ? await fileToDataUrl(avatarFile) : null;
      const newUser = await apiRegister({
        username: regForm.username.trim(),
        email:    regForm.email.trim(),
        password: regForm.password,
        avatar,
      });

      const sess = { userId: newUser.id, username: newUser.username, avatar: newUser.avatar };
      saveSession(sess);
      onLogin(sess);

      setUsers(prev => [...prev, newUser]);
      setRegForm(EMPTY_REG);
      setAvatarFile(null); setAvatarPreview(null);
      setRegErrors({});    setRegSuccess(true);
    } catch (err) {
      if (err.field) setRegErrors({ [err.field]: err.message });
      else setRegErrors({ form: err.message });
    } finally {
      setRegPending(false);
    }
  };

  // ── Submit login ─────────────────────────────────────────────
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    const username = loginForm.username.trim();
    if (!username || !loginForm.password) { setLoginError("Please fill in all fields."); return; }
    if (isLoginLocked(username)) { setLoginError("Too many failed attempts. Please wait 5 minutes."); return; }

    setLoginPending(true);
    try {
      const user = await apiLogin({ username, password: loginForm.password });
      clearLoginFail(username);
      const sess = { userId: user.id, username: user.username, avatar: user.avatar };
      saveSession(sess);
      onLogin(sess);
      setLoginForm(EMPTY_LOGIN);
    } catch (err) {
      const fails     = recordLoginFail(username);
      const remaining = LOCKOUT_MAX - fails;
      if (err.status === 401) {
        setLoginError(
          remaining > 0
            ? `Invalid username or password. (${remaining} attempt${remaining > 1 ? "s" : ""} left before lockout)`
            : "Too many failed attempts. Locked out for 5 minutes.",
        );
      } else {
        setLoginError(err.message);
      }
    } finally {
      setLoginPending(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────
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
            <span className="nav-current" aria-current="page">Users</span>
            <button className="nav-text-btn" onClick={() => onNavigate("board")}>Board</button>
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
        <section className="hero-mini wrap" aria-labelledby="up-title">
          <div className="hero-mini__copy">
            <p className="eyebrow">
              <span className="eyebrow__en">Community</span>
              <span className="eyebrow__slash" aria-hidden="true">/</span>
              <span className="eyebrow__sub">Visitor registry</span>
            </p>
            <h1 id="up-title">User <span className="h1-accent">Registry</span></h1>
            <p className="lede">
              Register or log in to join the community and post on the message board.
            </p>
          </div>
          <div className="hero-mini__badge" aria-hidden="true">
            <span className="hero-mini__count">{users.length}</span>
            <span className="hero-mini__label">members</span>
          </div>
        </section>

        {session && (
          <div className="wrap">
            <div className="auth-banner">
              <UserAvatar user={session} size={36} />
              <p>
                Welcome back, <strong>{session.username}</strong>! Head over to the{" "}
                <button className="link-btn" onClick={() => onNavigate("board")}>Message Board</button>{" "}
                to chat with others.
              </p>
              <button className="btn btn-ghost auth-banner__logout" onClick={onLogout}>Sign out</button>
            </div>
          </div>
        )}

        <div className="wrap up-grid">
          {/* Left – Auth forms */}
          <section className="section">
            <div className="up-tabs" role="tablist" aria-label="Authentication">
              <button
                role="tab" aria-selected={tab === "register"}
                className={`up-tab${tab === "register" ? " up-tab--active" : ""}`}
                onClick={() => { setTab("register"); setRegErrors({}); setRegSuccess(false); }}
              >Register</button>
              <button
                role="tab" aria-selected={tab === "login"}
                className={`up-tab${tab === "login" ? " up-tab--active" : ""}`}
                onClick={() => { setTab("login"); setLoginError(""); }}
              >Sign In</button>
            </div>

            {/* Register panel */}
            {tab === "register" && (
              <div className="card up-register-card" role="tabpanel">
                <span className="card__corner" aria-hidden="true" />
                <h3>Create Account</h3>
                <p className="card-subtext">Fill in the form to join the registry.</p>

                {regSuccess && (
                  <div className="up-success" role="status" aria-live="polite">
                    <span aria-hidden="true">✓</span> Account created — you are now signed in!
                  </div>
                )}

                <form className="up-form" onSubmit={handleRegSubmit} noValidate>
                  {/* Honeypot */}
                  <div className="up-honeypot" aria-hidden="true">
                    <label htmlFor="hp-website">Website</label>
                    <input id="hp-website" type="text" name="website"
                      value={regForm.website}
                      onChange={e => setRegForm(f => ({ ...f, website: e.target.value }))}
                      tabIndex={-1} autoComplete="off"
                    />
                  </div>

                  <AvatarPicker preview={avatarPreview} error={avatarError} onChange={handleAvatarChange} />

                  <div className="up-field">
                    <label className="up-label" htmlFor="r-username">Username</label>
                    <input id="r-username"
                      className={`up-input${regErrors.username ? " up-input--err" : ""}`}
                      type="text" value={regForm.username}
                      onChange={e => { setRegForm(f => ({ ...f, username: e.target.value })); setRegErrors(er => ({ ...er, username: undefined })); }}
                      placeholder="e.g. sakura_dev" autoComplete="username" spellCheck="false" maxLength={20}
                    />
                    {regErrors.username && <span className="up-field-err" role="alert">{regErrors.username}</span>}
                  </div>

                  <div className="up-field">
                    <label className="up-label" htmlFor="r-email">Email</label>
                    <input id="r-email"
                      className={`up-input${regErrors.email ? " up-input--err" : ""}`}
                      type="email" value={regForm.email}
                      onChange={e => { setRegForm(f => ({ ...f, email: e.target.value })); setRegErrors(er => ({ ...er, email: undefined })); }}
                      placeholder="hello@example.com" autoComplete="email" maxLength={254}
                    />
                    {regErrors.email && <span className="up-field-err" role="alert">{regErrors.email}</span>}
                  </div>

                  <div className="up-field">
                    <label className="up-label" htmlFor="r-password">Password</label>
                    <input id="r-password"
                      className={`up-input${regErrors.password ? " up-input--err" : ""}`}
                      type="password" value={regForm.password}
                      onChange={e => { setRegForm(f => ({ ...f, password: e.target.value })); setRegErrors(er => ({ ...er, password: undefined })); }}
                      placeholder="At least 8 characters" autoComplete="new-password" maxLength={128}
                    />
                    {regErrors.password && <span className="up-field-err" role="alert">{regErrors.password}</span>}
                  </div>

                  <div className="up-field">
                    <label className="up-label" htmlFor="r-confirm">Confirm Password</label>
                    <input id="r-confirm"
                      className={`up-input${regErrors.confirm ? " up-input--err" : ""}`}
                      type="password" value={regForm.confirm}
                      onChange={e => { setRegForm(f => ({ ...f, confirm: e.target.value })); setRegErrors(er => ({ ...er, confirm: undefined })); }}
                      placeholder="Re-enter password" autoComplete="new-password" maxLength={128}
                    />
                    {regErrors.confirm && <span className="up-field-err" role="alert">{regErrors.confirm}</span>}
                  </div>

                  {regErrors.form && <p className="up-field-err up-form-err" role="alert">{regErrors.form}</p>}

                  <button type="submit" className="btn btn-primary up-submit-btn" disabled={regPending}>
                    {regPending
                      ? "Creating…"
                      : <><span>Create Account</span><span className="btn__glyph" aria-hidden="true">→</span></>
                    }
                  </button>
                </form>
              </div>
            )}

            {/* Login panel */}
            {tab === "login" && (
              <div className="card up-register-card" role="tabpanel">
                <span className="card__corner" aria-hidden="true" />
                <h3>Sign In</h3>
                <p className="card-subtext">Welcome back. Enter your credentials below.</p>

                {loginError && (
                  <div className="up-error" role="alert" aria-live="polite">
                    <span aria-hidden="true">✕</span> {loginError}
                  </div>
                )}
                {session && (
                  <div className="up-success" role="status">
                    <span aria-hidden="true">✓</span> Signed in as <strong>{session.username}</strong>.
                  </div>
                )}

                <form className="up-form" onSubmit={handleLoginSubmit} noValidate>
                  <div className="up-field">
                    <label className="up-label" htmlFor="l-username">Username</label>
                    <input id="l-username"
                      className="up-input"
                      type="text" value={loginForm.username}
                      onChange={e => { setLoginForm(f => ({ ...f, username: e.target.value })); setLoginError(""); }}
                      placeholder="Your username" autoComplete="username" spellCheck="false" maxLength={20}
                    />
                  </div>

                  <div className="up-field">
                    <label className="up-label" htmlFor="l-password">Password</label>
                    <input id="l-password"
                      className="up-input"
                      type="password" value={loginForm.password}
                      onChange={e => { setLoginForm(f => ({ ...f, password: e.target.value })); setLoginError(""); }}
                      placeholder="Your password" autoComplete="current-password" maxLength={128}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary up-submit-btn"
                    disabled={loginPending || !!session}>
                    {loginPending
                      ? "Signing in…"
                      : <><span>Sign In</span><span className="btn__glyph" aria-hidden="true">→</span></>
                    }
                  </button>
                </form>
              </div>
            )}
          </section>

          {/* Right – User list */}
          <section className="section" aria-labelledby="users-heading">
            <SectionHead
              title="Registered Users"
              kicker={`${users.length} member${users.length !== 1 ? "s" : ""}`}
            />
            {users.length === 0 ? (
              <div className="card up-empty">
                <div className="up-empty__icon" aria-hidden="true">⛩</div>
                <p className="up-empty__text">No visitors yet.</p>
                <p className="up-empty__hint">Be the first to register.</p>
              </div>
            ) : (
              <ul className="up-user-list" aria-label="Registered users">
                {[...users].reverse().map(u => (
                  <li key={u.id} className="up-user-card card">
                    <UserAvatar user={u} size={40} />
                    <div className="up-user-info">
                      <p className="up-user-name">{u.username}</p>
                      <p className="up-user-email">{maskEmail(u.email)}</p>
                    </div>
                    <time className="up-user-time" dateTime={u.joinedAt}
                      title={new Date(u.joinedAt).toLocaleString()}>
                      {new Date(u.joinedAt).toLocaleDateString("en-US", {
                        year: "numeric", month: "short", day: "numeric",
                      })}
                    </time>
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
