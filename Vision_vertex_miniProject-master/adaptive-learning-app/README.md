# VISION – Behaviour-Aware Adaptive Teaching for Visually Impaired Students

**Third-Year AIML Engineering Project | 4SF24CI033**

> Behaviour-Aware Adaptive Teaching Strategy Selection for Multilingual  
> Personalised Learning of Visually Impaired Students.

---

## Project Description

VISION is a personalised, accessible learning platform designed exclusively
for visually impaired students. It adapts teaching strategies to individual
behaviour, learning pace, and goals, and supports:

- **Academic curriculum learning** at the student's own pace
- **Competitive examination preparation** (e.g., JEE, NEET, UPSC)
- **Focused single-topic deep dives**

The platform is fully keyboard-navigable and screen-reader compatible.

---

## Team Responsibilities

| Member | Module |
|--------|--------|
| Member 1 | Frontend & Voice Accessibility |
| Member 2 | Diagnostic Assessment & Learner Modelling |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, React Router |
| Backend | Python, FastAPI, SQLAlchemy |
| Database | SQLite (via SQLAlchemy ORM) |
| Communication | REST APIs |
| Accessibility | Keyboard navigation, ARIA landmarks, skip links, screen-reader compatibility |

---

## Project Structure

```
adaptive-learning-app/
├── frontend/                        # React + TypeScript + Vite application
│   ├── public/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── WelcomePage.tsx      # Accessible welcome / landing page  ✅
│   │   │   ├── WelcomePage.css
│   │   │   ├── LoginPage.tsx        # Placeholder — implemented in Stage 2
│   │   │   ├── RegisterPage.tsx     # Placeholder — implemented in Stage 2
│   │   │   ├── LearnerDashboard.tsx # Placeholder — implemented in Stage 5
│   │   │   └── PlaceholderPage.css  # Shared styles for placeholder pages
│   │   ├── App.tsx                  # Router setup
│   │   ├── App.css                  # Global styles & CSS design tokens
│   │   ├── index.css                # Minimal base reset
│   │   └── main.tsx                 # React entry point
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/                         # Python + FastAPI application
│   ├── app/
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   └── health.py            # GET /health endpoint  ✅
│   │   ├── __init__.py
│   │   ├── database.py              # SQLAlchemy engine + get_db() dependency  ✅
│   │   └── models.py                # All SQLAlchemy table definitions  ✅
│   ├── main.py                      # FastAPI app factory + DB init on startup
│   ├── requirements.txt             # Python dependencies
│   ├── .env.example                 # Environment variable template (safe to commit)
│   └── .gitignore
│
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18  (check: `node -v`)
- **npm** ≥ 9       (check: `npm -v`)
- **Python** ≥ 3.10 (check: `python --version`)
- **pip**           (check: `pip --version`)

---

### 1 — Set Up Environment Variables (backend)

```powershell
cd adaptive-learning-app/backend
copy .env.example .env
```

Then open `.env` and set a value for `SECRET_KEY`
(generate one with `python -c "import secrets; print(secrets.token_hex(32))"`).  
The `DATABASE_URL` default (`sqlite:///./vision.db`) works without changes.

---

### 2 — Install Backend Dependencies

```powershell
cd adaptive-learning-app/backend

# Create virtual environment (first time only)
python -m venv venv

# Activate (Windows PowerShell)
.\venv\Scripts\activate.bat

# Install all dependencies
pip install -r requirements.txt
```

---

### 3 — Install Frontend Dependencies

```powershell
cd adaptive-learning-app/frontend
npm install
```

---

## Running the Applications

### Start the Backend

> Make sure the virtual environment is activated (`(venv)` visible in prompt).

```powershell
cd adaptive-learning-app/backend
uvicorn main:app --reload --port 8000
```

On first start, SQLAlchemy automatically creates `vision.db` with all tables.

- Base URL: **http://localhost:8000**
- Swagger UI: **http://localhost:8000/docs**
- Health check: **http://localhost:8000/health**

---

### Start the Frontend

```powershell
cd adaptive-learning-app/frontend
npm run dev
```

- Opens at: **http://localhost:5173**

---

## API Endpoints

### Stage 1 (implemented)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Backend health check |

### Stage 2 (coming next)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | None | Learner registration |
| `POST` | `/auth/login` | None | Learner login → JWT token |
| `POST` | `/auth/logout` | Bearer | Invalidate session |
| `POST` | `/auth/recover` | None | Password recovery |

---

## Database Tables (created on startup)

| Table | Purpose |
|-------|---------|
| `users` | Learners and admins |
| `subjects` | Top-level academic subjects |
| `topics` | Sub-topics within subjects |
| `questions` | Diagnostic/assessment questions |
| `question_options` | Answer choices per question |
| `question_i18n` | Multilingual question text |
| `learner_profiles` | Per-learner preferences |
| `assessment_attempts` | Every answer attempt |
| `concept_mastery` | Mastery score per topic per learner |

---

## Accessibility Features

- Semantic HTML5 landmark elements (`<header>`, `<main>`, `<footer>`, `<nav>`)
- Single `<h1>` per page
- Skip-navigation link on every page
- Visible focus ring (vivid orange, `3px solid`) on all interactive elements
- `aria-label` on navigation and list elements
- `aria-describedby` on buttons
- `role="status"` with `aria-live="polite"` on status notices
- High-contrast colour palette (dark navy on white)
- 18 px base font for readability

---

## Stage Roadmap

| Stage | Status | Description |
|-------|--------|-------------|
| Stage 1 | ✅ Complete | Project setup, welcome page, DB schema, routing skeleton |
| Stage 2 | ⬜ Next | Learner authentication (register, login, JWT, recovery) |
| Stage 3 | ⬜ | Admin role + content management |
| Stage 4 | ⬜ | Voice-first accessibility (TTS + speech input) |
| Stage 5 | ⬜ | Learning workflow + diagnostic assessment |
| Stage 6 | ⬜ | Multilingual content delivery |
| Stage 7 | ⬜ | Full integration, adaptive engine, testing |

---

## Security Notes

- Never commit `.env` to git — it is listed in `.gitignore`
- Never store passwords in plaintext — use `passlib[bcrypt]` (installed, used in Stage 2)
- JWT tokens will use `python-jose` (installed, used in Stage 2)
- SQLite `vision.db` is excluded from git
- Each team member generates their own `SECRET_KEY` for local development
