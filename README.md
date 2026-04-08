# TokensByte — Next-gen LLM API Gateway

High-performance LLM API distribution and management platform built with Rust + React.

## 🚀 Key Features

- **Extreme Performance**: Rust-powered backend based on Axum & Tokio.
- **Unified API**: OpenAI-compatible endpoint for all major models.
- **Advanced Management**: Manage channels, tokens, and users with a modern UI.
- **Enterprise Ready**: Multitenancy, quotas, and granular access control.
- **Full Monitoring**: Real-time request logging and status tracking.
- **Docker-First**: One-click deployment with Docker Compose.

## 📦 Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Rust (for development)
- Node.js (for development)

### 2. Deploy with Compose
```bash
docker-compose up -d
```
Access the management dashboard at `http://localhost:3000`.
The default admin login is:
- **Username**: `admin`
- **Password**: `admin`

### 3. Using the API
Configure your OpenAI SDK:
- **Base URL**: `http://localhost:3000/v1`
- **API Key**: `sk-xxxx` (Generate in TokensByte UI)

## 🛠️ Development Setup

### Backend
```bash
cd backend
cp .env.example .env
cargo run
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 🏗️ Technical Stack
- **Backend**: Rust, Axum, SQLx, SQLite/PostgreSQL
- **Frontend**: React, TypeScript, Ant Design 5, Zustand
- **Deployment**: Docker, Nginx, Docker Compose

## 🛡️ License
MIT License
