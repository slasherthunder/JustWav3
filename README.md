# JustWav3

A modern React.js application built with Vite and TypeScript.

## Getting Started

### Prerequisites

- Node.js (>= 20)
- npm

### Installation

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

Build for production:

```bash
npm run build
```

### Preview

Preview the production build:

```bash
npm run preview
```

## Firebase Setup

1. Create a Firebase project at [https://console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication:
   - Go to Authentication > Sign-in method
   - Enable "Email/Password" provider
3. Get your Firebase config:
   - Go to Project Settings > General
   - Scroll down to "Your apps" and select the web app (or create one)
   - Copy the Firebase configuration object
4. Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```
5. Fill in your Firebase credentials in the `.env` file:
   ```
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```

## Quick Demo Setup

Want to see the app in action quickly? See [DEMO_QUICKSTART.md](./DEMO_QUICKSTART.md) for a 5-minute setup guide.

For a detailed demo guide, see [DEMO_GUIDE.md](./DEMO_GUIDE.md).

## Tech Stack

- **React** 19.2.0
- **TypeScript** 5.9.3
- **Vite** 7.2.4
- **Firebase** for authentication
- **React Router** for routing
- **ESLint** for code linting

## Project Structure

```
JustWav3/
├── public/          # Static assets
├── src/            # Source files
│   ├── App.tsx     # Main App component
│   ├── main.tsx    # Entry point
│   └── assets/     # Images and other assets
├── index.html      # HTML template
└── vite.config.ts  # Vite configuration
```
