# Express Backend with PostgreSQL & MongoDB

A modern backend API built with Express.js, TypeScript, and Bun runtime, featuring a hybrid database architecture using both PostgreSQL and MongoDB.

## Features

- ⚡ Fast runtime with Bun
- 🔷 TypeScript for type safety
- 🗄️ Dual database support (PostgreSQL + MongoDB)
- 🚀 Express.js for robust API development
- 🔄 Hot reload in development
- 🛡️ CORS enabled
- ✅ Health check endpoints

## Prerequisites

- [Bun](https://bun.sh) (v1.0 or higher)
- [PostgreSQL](https://www.postgresql.org/) (v14 or higher)
- [MongoDB](https://www.mongodb.com/) (v6.0 or higher)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd express-backend
```

2. Install dependencies:
```bash
bun install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```env
PORT=3000
NODE_ENV=development

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=myapp
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

# MongoDB
MONGODB_URI=mongodb://localhost:27017/myapp
```

4. Set up databases:
```bash
# PostgreSQL - Create database
psql -U postgres -c "CREATE DATABASE myapp;"

# MongoDB - Will auto-create on first connection
```

## Usage

### Development
```bash
bun run dev
```

### Production
```bash
bun run start
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and timestamp.

### Root
```
GET /
```
Returns welcome message.

## Database Usage

### PostgreSQL
Use for:
- User accounts and authentication
- Transactional data
- Relational data requiring ACID compliance

### MongoDB
Use for:
- Logs and analytics
- Session storage
- Flexible schema documents
- High-volume unstructured data

## Project Structure

```
.
├── src/
│   └── index.ts          # Main application entry
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── PRD.md               # Product Requirements Document
└── README.md            # This file
```

## Scripts

- `bun run dev` - Start development server with hot reload
- `bun run start` - Start production server
- `bun run test` - Run tests (to be implemented)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC
