# Personal Finance Tracking Backend

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

**A modern, scalable backend for tracking personal finances using Google Sheets as a database.**

[![Nest Version](https://img.shields.io/npm/v/@nestjs/core.svg)](https://www.npmjs.com/~nestjscore)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🚀 Features

- ✅ **Google Sheets Integration** - Uses Google Sheets as your database
- ✅ **Income & Expense Tracking** - Full CRUD operations for financial records
- ✅ **Automatic Sheet Management** - Creates monthly sheets dynamically
- ✅ **Balance Calculation** - Real-time income vs expense calculations
- ✅ **Category System** - Dedicated categories sheet for organization
- ✅ **API Key Authentication** - Simple but secure authentication
- ✅ **TypeScript** - Full type safety with TypeScript
- ✅ **Modular Architecture** - Clean, maintainable NestJS modules
- ✅ **Input Validation** - Request validation with class-validator
- ✅ **Error Handling** - Global exception filter for consistent errors
- ✅ **CORS Enabled** - Ready for frontend integration

---

## 📋 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Cloud account
- Google Sheets API enabled

### Installation

```bash
# Clone or navigate to the project
cd web

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials (see Setup section below)
```

### Running the App

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod

# Debug mode
npm run start:debug
```

The server will start on `http://localhost:3000`

---

## 🔧 Setup Guide

### 1. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google Sheets API
4. Create a Service Account
5. Generate and download JSON key
6. Copy the `client_email` and `private_key`

### 2. Google Sheets Setup

1. Create a new Google Sheet
2. Copy the Sheet ID from the URL
3. Create a sheet named `Categories` with columns: Name, Type
4. Share the sheet with your service account email (Editor access)

### 3. Configure Environment Variables

Edit `.env` file:

```env
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKey\n-----END PRIVATE KEY-----\n"
PORT=3000
API_KEY=generate_a_secure_random_key
```

📖 **Detailed instructions:** See [SETUP.md](./SETUP.md) and [GOOGLE_SHEET_SETUP.md](./GOOGLE_SHEET_SETUP.md)

---

## 📡 API Endpoints

All endpoints require `x-api-key` header with your API_KEY value.

### Finance Operations

| Method | Endpoint                  | Description               |
| ------ | ------------------------- | ------------------------- |
| POST   | `/api/finance`            | Add income/expense        |
| GET    | `/api/finance`            | Get current month records |
| GET    | `/api/finance/month`      | Get specific month        |
| PUT    | `/api/finance/:rowIndex`  | Update record             |
| DELETE | `/api/finance/:rowIndex`  | Delete record             |
| GET    | `/api/finance/balance`    | Get balance summary       |
| GET    | `/api/finance/categories` | Get categories            |

### Example Request

```bash
# Add income
curl -X POST http://localhost:3000/api/finance \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key" \
  -d '{
    "date": "2026-03-31",
    "amount": 2000,
    "description": "Salary",
    "category": "Salary",
    "type": "income"
  }'

# Get balance
curl http://localhost:3000/api/finance/balance \
  -H "x-api-key: your_api_key"
```

📖 **Full API documentation:** [API.md](./API.md)

---

## 📁 Project Structure

```
src/
├── main.ts                    # Application entry point
├── app.module.ts              # Root module
├── auth/                      # Authentication
│   ├── api-key.guard.ts       # API Key guard
│   └── auth.controller.ts     # Auth endpoints
├── common/                    # Shared utilities
│   ├── interfaces/            # TypeScript interfaces
│   └── filters/               # Exception filters
├── finance/                   # Finance business logic
│   ├── dto/                   # Request DTOs
│   ├── finance.controller.ts  # Finance endpoints
│   ├── finance.service.ts     # Finance service
│   └── finance.module.ts      # Finance module
└── google-sheets/             # Google Sheets integration
    ├── google-sheets.service.ts  # Sheets API wrapper
    └── google-sheets.module.ts   # Module definition
```

📖 **Architecture details:** [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)

---

## 🛠️ Development

### Build

```bash
npm run build
```

### Format Code

```bash
npm run format
```

### Lint

```bash
npm run lint
```

### Test

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

---

## 📦 Dependencies

### Production

- `@nestjs/*` - NestJS framework
- `googleapis` - Google Sheets API client
- `class-validator` - Runtime validation
- `class-transformer` - Object transformation
- `@nestjs/config` - Configuration management
- `dotenv` - Environment variables

### Development

- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution
- `jest` - Testing framework
- `eslint` - Code linting
- `prettier` - Code formatting

---

## 🔒 Security

- API Key authentication for all endpoints
- Environment variables stored securely
- CORS configured for production
- Input validation on all requests
- Google Sheets service account with minimal permissions

⚠️ **Important:** Never commit your `.env` file to version control!

---

## 📚 Documentation

| Document                                         | Description                 |
| ------------------------------------------------ | --------------------------- |
| [SETUP.md](./SETUP.md)                           | Detailed Google Cloud setup |
| [GOOGLE_SHEET_SETUP.md](./GOOGLE_SHEET_SETUP.md) | Google Sheets configuration |
| [API.md](./API.md)                               | Complete API reference      |
| [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)     | Architecture and features   |
| [QUICKSTART.md](./QUICKSTART.md)                 | Quick start commands        |

---

## 🎯 Usage Examples

### Track Monthly Expenses

```bash
# Add rent expense
curl -X POST http://localhost:3000/api/finance \
  -H "Content-Type: application/json" \
  -H "x-api-key: key" \
  -d '{"date":"2026-03-01","amount":800,"description":"Monthly Rent","category":"Housing","type":"expense"}'

# Add salary income
curl -X POST http://localhost:3000/api/finance \
  -H "Content-Type: application/json" \
  -H "x-api-key: key" \
  -d '{"date":"2026-03-01","amount":3000,"description":"Monthly Salary","category":"Salary","type":"income"}'

# Check balance
curl http://localhost:3000/api/finance/balance -H "x-api-key: key"
```

---

## 🚨 Troubleshooting

### Common Issues

**"Sheet not found"**

- Verify GOOGLE_SHEET_ID is correct
- Check service account has Editor access

**"Private key format invalid"**

- Include BEGIN/END markers
- Keep `\n` characters in the key

**Port already in use**

- Change PORT in `.env` file
- Kill process: `netstat -ano | findstr :3000`

📖 **More help:** [QUICKSTART.md](./QUICKSTART.md)

---

## 🤝 Contributing

This is a personal project, but feel free to:

- Report bugs
- Suggest features
- Submit pull requests

---

## 📄 License

MIT Licensed - see [LICENSE](LICENSE) file for details.

---

## 💡 Tips

1. **Backup your Google Sheet regularly** (File → Download → Excel/CSV)
2. **Use meaningful category names** for better tracking
3. **Check your Google Sheet** to see data in real-time
4. **Monitor logs** during development for debugging
5. **Set up budget alerts** in a future enhancement

---

## 🔮 Future Enhancements

Potential features to add:

- [ ] Budget limits and alerts
- [ ] Data visualization/charts
- [ ] Export to CSV/PDF
- [ ] Recurring transactions
- [ ] Multi-currency support
- [ ] Bank API integration
- [ ] Mobile app integration
- [ ] Advanced analytics

---

## 📞 Support

- Documentation: See links above
- Issues: Check troubleshooting section
- Questions: Review PROJECT_OVERVIEW.md for architecture details

---

**Built with [NestJS](https://nestjs.com/) ❤️**
