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
- **DOI Import Interface** — Enter DOI information and review publication metadata.
- **Local Persistence** — Retain library and collection changes using browser local storage.

### Planned Features

- DOI-based metadata retrieval through Crossref.
- Persistent paper and collection storage using MongoDB.
- User registration and authentication.
- PDF uploads and document management.
- Paper annotations and collaborative workspaces.
- Semantic search and AI-assisted research analysis.
- Research knowledge graphs and analytics.

## Technology Stack

| Component         | Technology                              |
| ----------------- | --------------------------------------- |
| Frontend          | React, Vite                             |
| Styling           | Tailwind CSS                            |
| Routing           | React Router                            |
| Icons             | Lucide                                  |
| Backend           | Node.js, Express.js                     |
| Database          | MongoDB, Mongoose (planned integration) |
| Metadata Provider | Crossref (planned integration)          |

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
├── docs/                   # Project documentation
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

### 2. Start the frontend

```bash
cd client
npm install
npm run dev
```

The frontend development server is available at:

`http://localhost:5173`

### 3. Start the backend

Open another terminal:

```bash
cd server
npm install
npm start
```

The backend runs on:

`http://localhost:5000`

Health check:

`http://localhost:5000/api/health`

## Current Development Status

ResearchForge is currently in its initial Demo MVP development phase.

The frontend provides an interactive prototype using mock publication data and browser local storage. The Express backend provides the initial server foundation and health-check endpoint.

Database persistence, authentication and live academic metadata integration are not yet implemented.

For detailed implementation progress, completed tasks and upcoming milestones, see [PROJECT_STATE.md](PROJECT_STATE.md).

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
