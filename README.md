# AI Interviewer

A realtime, voice-based technical interviewer. You paste a candidate's GitHub
profile, the app reads their public repositories, and an AI interviewer holds a
spoken conversation — asking questions grounded in the candidate's actual
projects, one at a time, like a real interview. When the session ends, Claude
scores the transcript out of 10 and writes short, specific feedback.

## How it works

```
                 ┌─────────────┐   WebRTC audio    ┌──────────────────┐
   Candidate ───▶│  Frontend   │◀─────────────────▶│ OpenAI Realtime  │
   (browser mic) │ (Bun+React) │                   │  (voice model)   │
                 └──────┬──────┘                   └────────┬─────────┘
                        │ REST                              │ sideband WS
                        ▼                                   ▼ (transcripts)
                 ┌─────────────────────────────────────────────────┐
                 │              Backend (Bun + Express)             │
                 │  • Scrapes GitHub repos                          │
                 │  • Relays WebRTC SDP offer/answer to OpenAI      │
                 │  • Sideband WebSocket captures both sides'       │
                 │    transcripts and stores them                   │
                 │  • Scores the finished transcript with Claude    │
                 └───────────────────┬─────────────────────────────┘
                                     │ Prisma
                                     ▼
                              ┌─────────────┐
                              │  Postgres   │  Interview + Message tables
                              └─────────────┘
```

### The flow

1. **Setup** — On the home page the candidate submits a GitHub profile URL. The
   backend (`POST /api/v1/pre-interview`) scrapes their public repos (name,
   description, stars) via the GitHub API and creates an `Interview` row with
   status `Pre`, returning an interview id.
2. **Interview** — The browser captures microphone audio and opens a
   [WebRTC](https://developer.mozilla.org/docs/Web/API/WebRTC_API) connection.
   Its SDP offer is relayed through the backend
   (`POST /api/v1/session/:interviewId`) to the **OpenAI Realtime API**, which
   drives the spoken conversation. The interviewer is instructed to ask exactly
   one question per turn, working through the candidate's repositories one at a
   time.
3. **Transcription** — In parallel the backend opens a **sideband WebSocket** to
   the same realtime call (`sideband.ts`). It enables input-audio transcription
   and listens for both the candidate's transcribed answers and the assistant's
   responses, persisting each as a `Message` (`type: User | Assistant`) linked to
   the interview.
4. **Scoring** — When the results page loads (`GET /api/v1/result/:interviewId`),
   if the interview isn't already `Done`, the backend sends the transcript to
   **Claude** (`result.ts`), which returns a `{ score, feedback }` JSON object
   scored strictly on the candidate's own answers. The interview is marked `Done`
   and the score/feedback are saved.

## Tech stack

| Layer     | Stack                                                                       |
| --------- | --------------------------------------------------------------------------- |
| Monorepo  | [Turborepo](https://turborepo.dev) + [Bun](https://bun.sh) workspaces       |
| Frontend  | Bun-served React 19, `react-router`, Tailwind CSS v4, Radix UI / shadcn-style components |
| Backend   | Bun + Express 5                                                             |
| Voice     | OpenAI Realtime API (WebRTC audio + sideband WebSocket for transcription)   |
| Scoring   | Anthropic Claude (`@anthropic-ai/sdk`) with structured JSON output          |
| Database  | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)                              |

## Repository layout

```
apps/
  frontend/          Bun + React SPA
    src/
      components/
        form.tsx         GitHub URL entry (home page)
        interview.tsx    WebRTC voice session
        VoiceIndicator.tsx
        result.tsx       Score + feedback + transcript
        ui/              Reusable UI primitives
      lib/config.ts      BACKEND_URL
  backend/           Bun + Express API
    index.ts             Routes: pre-interview, session, user response, result
    sideband.ts          Realtime sideband WS → stores transcripts
    result.ts            Claude scoring
    scrapper/github.ts   GitHub repo scraper
    prisma/schema.prisma Interview + Message models
```

## Data model

```prisma
model Interview {
  id             String          @id @default(uuid())
  githubMetadata Json
  status         InterviewStatus // Pre | InProgress | Done
  score          Int             @default(0)
  conversations  Message[]
  feedback       String?
}

model Message {
  id          String      @id @default(uuid())
  message     String
  type        MessageType // User | Assistant
  interviewId String
  createdAt   DateTime    @default(now())
}
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh) `>= 1.3`
- A running **PostgreSQL** instance
- API keys: **OpenAI** (realtime voice), **Anthropic** (scoring), and optionally a
  **GitHub token** (raises the repo-scraping rate limit)

### 1. Install dependencies

```sh
bun install
```

### 2. Configure environment

Copy the backend env template and fill in the values:

```sh
cp apps/backend/.env.example apps/backend/.env
```

```dotenv
# apps/backend/.env
GITHUB_TOKEN=            # optional; higher GitHub API rate limit
CLAUDE_API_KEY=          # Anthropic key — scores the interview
OPENAI_KEY=              # OpenAI key — realtime voice
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_interviewer"
```

The frontend talks to the backend at `http://localhost:3001`, set in
[`apps/frontend/src/lib/config.ts`](apps/frontend/src/lib/config.ts).

### 3. Set up the database

```sh
cd apps/backend
bun prisma migrate deploy   # apply existing migrations
bun prisma generate         # generate the client
```

### 4. Run

From the repo root, start everything with Turborepo:

```sh
bun run dev
```

Or run each app individually:

```sh
# Backend (http://localhost:3001)
cd apps/backend && bun --hot index.ts

# Frontend
cd apps/frontend && bun run dev
```

Open the frontend, paste a GitHub profile URL, allow microphone access, and start
talking.

## API reference

| Method | Route                                      | Purpose                                              |
| ------ | ------------------------------------------ | ---------------------------------------------------- |
| `POST` | `/api/v1/pre-interview`                    | Scrape GitHub repos, create an interview, return id  |
| `POST` | `/api/v1/session/:interviewId`             | Relay WebRTC SDP to OpenAI, start the sideband       |
| `POST` | `/api/v1/session/user/response/:interviewId` | Persist a candidate message                        |
| `GET`  | `/api/v1/result/:interviewId`              | Return score + feedback + transcript (scores if new) |

## Notes & limitations

- The interviewer voice model is `gpt-realtime-2`; scoring uses
  `claude-sonnet-4-6` by default (swap to `claude-opus-4-8` in
  [`result.ts`](apps/backend/result.ts) for higher scoring quality).
- `DATABASE_URL` points at a local Postgres by default — deploying the backend
  elsewhere requires a hosted Postgres and re-running migrations.
- Interviews are scored lazily on the first results-page load; there is no lock,
  so concurrent result requests could score twice (noted as a TODO in the code).
- `BACKEND_URL` is hardcoded for local development.
