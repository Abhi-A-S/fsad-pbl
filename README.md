# ResearchForge

**A Research Discovery and Knowledge Management Platform**

ResearchForge is a web-based platform designed to help researchers and students discover, organise, manage and explore academic publications.

The project aims to simplify research-paper management by bringing publication metadata, personal research libraries, collections and intelligent research discovery into a unified application.

> **Development status:** Early development — Demo MVP

## Features

### Currently Implemented

- **Research Dashboard** — Overview of the research library and collections.
- **Research Library** — Browse and search academic publications.
- **Paper Details** — View publication metadata, authors, abstracts and DOI information.
- **Collections** — Create collections and organise research papers.
- **DOI Import Interface** — Enter DOI information and review publication metadata using mock lookup data.
- **Local Persistence** — Retain library and collection changes using browser local storage.
- **Express Backend** — Initial backend foundation with a health-check endpoint.
- **Development Scripts** — Root-level commands to run the frontend and backend together and build the application.

### Planned Features

- DOI-based metadata retrieval through Crossref.
- Persistent paper and collection storage using MongoDB.
- User registration and authentication.
- PDF uploads and document management.
- Paper annotations and collaborative workspaces.
- Semantic search and AI-assisted research analysis.
- Research knowledge graphs and analytics.

## Technology Stack

| Component         | Technology                     |
| ----------------- | ------------------------------ |
| Frontend          | React, Vite                    |
| Styling           | Tailwind CSS                   |
| Routing           | React Router                   |
| Icons             | Lucide                         |
| Backend           | Node.js, Express.js            |
| Database          | MongoDB, Mongoose              |
| Metadata Provider | Crossref (planned integration) |

## Project Structure

```text
ResearchForge/
├── client/                 # React frontend
│   └── src/
│       ├── context/
│       ├── data/
│       ├── layouts/
│       └── pages/
│
├── server/                 # Express backend
│   └── src/
│       ├── config/
│       ├── middleware/
│       ├── routes/
│       ├── app.js
│       └── server.js
│
├── scripts/
│   └── dev.js              # Concurrent frontend/backend development runner
│
├── docs/                   # Project documentation
├── package.json            # Root-level development scripts
├── package-lock.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 22 LTS
- npm

### 1. Clone the repository

```bash
git clone https://github.com/Abhi-A-S/fsad-pbl.git
cd fsad-pbl
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the application

```bash
npm run dev
```

This starts both development servers concurrently.

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:5000

### Available Commands

| Command         | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `npm run dev`   | Start frontend and backend development servers concurrently. |
| `npm run build` | Build the frontend for production.                           |
| `npm test`      | Run tests when test infrastructure is configured.            |

> **Note:** Jest and Vitest test infrastructure has not yet been configured. Consequently, `npm test` currently exits with a message indicating that testing is not configured.

### Backend Health Check

Verify that the backend is running:

http://localhost:5000/api/health

## Current Development Status

ResearchForge is currently in its initial Demo MVP development phase.

The frontend provides an interactive prototype using mock publication data and browser local storage. The Express backend provides the initial server foundation and health-check endpoint. Root-level development scripts are available for coordinating the frontend and backend.

MongoDB connection integration, database persistence, authentication and live academic metadata integration are not yet implemented.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
