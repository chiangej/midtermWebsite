import { useEffect, useMemo, useState } from "react";
import { getFortuneForLocalDate } from "./fortuneData.js";
import UserPage from "./UserPage.jsx";
import MessageBoard from "./MessageBoard.jsx";
import AiPage from "./AiPage.jsx";
import { loadSession, saveSession, clearSession, apiLogout, apiMe } from "./utils.js";

const year = new Date().getFullYear();

function fortuneStorageKey(dateKey) {
  return `fortune-open-${dateKey}`;
}

function DailyFortune() {
  const fortune = useMemo(() => getFortuneForLocalDate(), []);
  const [opened, setOpened] = useState(() => {
    try {
      return (
        sessionStorage.getItem(fortuneStorageKey(fortune.dateKey)) === "1"
      );
    } catch {
      return false;
    }
  });
  const [shaking, setShaking] = useState(false);

  const persistOpened = () => {
    try {
      sessionStorage.setItem(fortuneStorageKey(fortune.dateKey), "1");
    } catch {
      /* ignore */
    }
  };

  const reveal = () => {
    setOpened(true);
    persistOpened();
  };

  const draw = () => {
    if (opened) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      reveal();
      return;
    }
    setShaking(true);
    window.setTimeout(() => {
      reveal();
      setShaking(false);
    }, 620);
  };

  return (
    <section id="fortune" className="section wrap section-fortune">
      <SectionHead title="Daily fortune" kicker="Omikuji" />
      <article className="card fortune-card" aria-labelledby="fortune-heading">
        <div className="fortune-card__top">
          <div
            className={`fortune-slip ${shaking ? "fortune-slip--shake" : ""} ${
              opened ? "fortune-slip--revealed" : ""
            }`}
            aria-hidden="true"
          >
            <span className="fortune-slip__seal" />
            <span className="fortune-slip__line" />
            <span className="fortune-slip__line" />
            <span className="fortune-slip__line fortune-slip__line--short" />
          </div>
          <div className="fortune-card__intro">
            <h3 id="fortune-heading" className="fortune-card__title">
              今日籤運
            </h3>
            <p className="fortune-card__hint">
              同一個日子只對應一支籤。誠心一抽，當作今日小寓言。
            </p>
            {!opened ? (
              <button
                type="button"
                className="btn btn-primary fortune-draw-btn"
                onClick={draw}
                disabled={shaking}
              >
                {shaking ? "籤筒搖動中…" : "抽籤 · 看今日運勢"}
              </button>
            ) : (
              <p className="fortune-done">今日籤已開 · 明天再來試試新籤吧</p>
            )}
          </div>
        </div>
        {opened ? (
          <div
            className="fortune-result fortune-result--visible"
            role="status"
            aria-live="polite"
          >
            <p className={`fortune-tier fortune-tier--${fortune.tone}`}>
              {fortune.tier}
            </p>
            <p className="fortune-tagline">{fortune.title}</p>
            <p className="fortune-body">{fortune.body}</p>
            <p className="fortune-meta">{fortune.dateKey} · 本日籤詩</p>
          </div>
        ) : null}
      </article>
    </section>
  );
}

function SectionHead({ title, kicker }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <span className="section-head__kicker" aria-hidden="true">
        {kicker}
      </span>
      <span className="section-head__line" aria-hidden="true" />
    </div>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState("home");
  const [session, setSession] = useState(loadSession);

  // On mount, verify the HttpOnly cookie against the server. The localStorage
  // cache is only a UI hint — /api/me is the source of truth.
  useEffect(() => {
    apiMe().then((me) => {
      if (me) {
        const sess = { userId: me.id, username: me.username, avatar: me.avatar };
        saveSession(sess);
        setSession(sess);
      } else {
        clearSession();
        setSession(null);
      }
    });
  }, []);

  const onLogin = (sess) => setSession(sess);
  const onLogout = async () => { await apiLogout(); setSession(null); };

  if (currentPage === "users") {
    return <UserPage onNavigate={setCurrentPage} session={session} onLogin={onLogin} onLogout={onLogout} />;
  }

  if (currentPage === "board") {
    return <MessageBoard onNavigate={setCurrentPage} session={session} onLogout={onLogout} />;
  }

  if (currentPage === "ai") {
    return <AiPage onNavigate={setCurrentPage} session={session} onLogout={onLogout} />;
  }

  return (
    <div className="page">
      <span className="page__motif page__motif--1" aria-hidden="true" />
      <span className="page__motif page__motif--2" aria-hidden="true" />
      <span className="page__grain" aria-hidden="true" />

      <header className="site-header">
        <div className="wrap header-inner">
          <div className="brand">
            <a className="logo" href="#" aria-label="Top">
              <span className="logo__inner">AC</span>
            </a>
            <p className="brand__tag">
              <span className="brand__welcome">Welcome</span>
              <span className="brand__dot" aria-hidden="true" />
              <span className="brand__sub">personal studio</span>
            </p>
          </div>
          <nav className="nav" aria-label="Primary">
            <a href="#intro">Intro</a>
            <a href="#interests">Study</a>
            <a href="#fortune">Fortune</a>
            <a href="#goals">Goals</a>
            <button
              className="nav-text-btn"
              onClick={() => setCurrentPage("users")}
            >
              Users
            </button>
            <button
              className="nav-text-btn"
              onClick={() => setCurrentPage("board")}
            >
              Board
            </button>
            <button
              className="nav-text-btn"
              onClick={() => setCurrentPage("ai")}
            >
              AI Tools
            </button>
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
        <section className="hero wrap" aria-labelledby="hero-title">
          <p className="hero__vertical" aria-hidden="true">
            Hello
          </p>
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow__en">Portfolio garden</span>
              <span className="eyebrow__slash" aria-hidden="true">
                /
              </span>
              <span className="eyebrow__sub">A tiny portfolio</span>
            </p>
            <h1 id="hero-title">
              Hi, I’m <span className="h1-accent">Yi Jie</span> Chiang
            </h1>
            <p className="lede">
              I’m a graduate student exploring how networks stay calm under
              real-world pressure. This page is a quiet corner to share who I am
              and what I’m growing toward.
            </p>
          </div>

          <div className="hero-card">
            <div className="hero-card__wash" aria-hidden="true" />
            <div className="hero-card__petals" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="avatar">
              <span className="avatar__ring" aria-hidden="true" />
              <div className="avatar__clip">
                <img
                  className="avatar__photo"
                  src={`${import.meta.env.BASE_URL}avatar.png`}
                  alt="Profile photo"
                  width={120}
                  height={120}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
            <p className="card-title">Network security · NTU</p>
            <p className="card-meta">M.S. Year 1 · Taipei, Taiwan</p>
            <p className="card-note" aria-hidden="true">
              Taipei · Taiwan
            </p>
          </div>
        </section>

        <DailyFortune />

        <section id="goals" className="section wrap">
          <SectionHead title="Goals" kicker="Next chapter" />
          <div className="grid-2">
            <article className="card">
              <h3>For this course</h3>
              <p>
                I want to finish each lab carefully, document what I learn, and be
                able to explain both the attack path and the mitigation in plain
                English.
              </p>
            </article>
            <article className="card">
              <h3>Looking ahead</h3>
              <p>
                Live life to the fullest and enjoy the journey. Raise a dog and a cat.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-inner">
          <p className="footer__main">
            © {year} Yi Jie Chiang · React &amp; Vite · GitHub Pages
          </p>
          <p className="footer__whisper" aria-hidden="true">
            One quiet step at a time.
          </p>
        </div>
      </footer>
    </div>
  );
}
