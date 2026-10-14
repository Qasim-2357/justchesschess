# ♟️ JustChessChess

### A cinematic 3D chess experience on the web.

JustChessChess is a browser-based chess project with a 3D chessboard, a dark visual style, and a player leaderboard. The project uses a React frontend and a Node.js backend, with Socket.IO for real-time communication and PostgreSQL for persistent data.

https://justchesschess.vercel.app

## Preview

![JustChessChess main interface](docs/screenshots/chess-game.png)

## Gameplay

![JustChessChess gameplay](docs/screenshots/gameplay.png)

## 3D Board Views

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/chess-3d.png" alt="JustChessChess 3D chessboard from an angled camera view" width="100%">
    </td>
    <td width="50%">
      <img src="docs/screenshots/chess-camera.png" alt="JustChessChess chessboard from another camera perspective" width="100%">
    </td>
  </tr>
</table>

## About

The goal of JustChessChess is to make it easy to get into a game of chess through a focused browser experience. The interface combines a 3D board with player information and a leaderboard.

The screenshots show the current visual interface. Refer to the implementation and test results for the exact status of individual gameplay, account, and matchmaking features.

## Technology Stack

### Frontend
- React
- Vite
- JavaScript
- `react-chessboard`
- `chess.js`
- Three.js
- React Three Fiber

### Backend
- Node.js
- Express
- Socket.IO
- PostgreSQL
- `pg`
- `bcrypt`
- `jsonwebtoken`

### Testing
- Vitest

## Architecture

```text
Browser
  |
  v
React + Vite frontend
  |
  | HTTP requests / Socket.IO
  v
Node.js + Express backend
  |
  +---- Socket.IO real-time events
  |
  v
PostgreSQL database
```

- **Frontend:** renders the interface and handles browser-side interaction.
- **Backend:** exposes HTTP routes and handles real-time communication.
- **Database:** stores application data that needs to persist between sessions.

## Getting Started

### Prerequisites

Install:
- Node.js (use a version compatible with the project's dependencies)
- npm
- PostgreSQL, or access to a PostgreSQL database

Check your installed versions:

```bash
node --version
npm --version
```

### 1. Clone the repository

```bash
git clone https://github.com/Qasim-2357/justchesschess.git
cd justchesschess
```

### 2. Configure and start the backend

```bash
cd server
npm install
```

Create a local `.env` file based on `.env.example`. A typical configuration may look like this, but use the exact variable names required by the current code:

```env
PORT=3001
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/justchesschess
JWT_SECRET=replace_with_a_random_local_secret
```

Replace the example database credentials with your own. Ensure the database exists and that the backend's database initialization succeeds.

Generate a local JWT secret in PowerShell with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the backend using the script available in `server/package.json`. If a production `start` script has been added, use:

```bash
npm start
```

Otherwise, use the development script:

```bash
npm run dev
```

### 3. Configure and start the frontend

Open a second terminal from the repository root:

```bash
cd client
npm install
```

Configure the frontend's backend URL using the environment variable that the code actually reads. For example, if the application uses `VITE_API_URL`, create `client/.env` with:

```env
VITE_API_URL=http://localhost:3001
```

Do not use this variable name unless it matches the implementation.

Start the frontend:

```bash
npm run dev
```

Vite commonly serves the app at `http://localhost:5173`.

### 4. Build the frontend

From `client/`:

```bash
npm run build
```

## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `PORT` | Backend | HTTP server port; the hosting platform may provide this value |
| `CLIENT_URL` | Backend | Allowed frontend origin for CORS and Socket.IO |
| `DATABASE_URL` | Backend | PostgreSQL connection string |
| `JWT_SECRET` | Backend | Secret for signing and verifying JWTs |
| Frontend API URL | Frontend | Backend address used by the browser; use the variable name expected by the code |

Keep real credentials in local environment files and your hosting provider's secret configuration. Never commit production secrets or expose them through `VITE_` variables.

## Testing

From `server/`, run the test script defined in `server/package.json`. If it is named `test`, use:

```bash
npm test
```

From `client/`, build the frontend:

```bash
npm run build
```

A successful frontend build does not by itself verify authentication, database persistence, matchmaking, or multiplayer synchronization. Test those flows separately.

## Deployment

A simple hosting option to evaluate is:

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** Neon PostgreSQL

Free-tier limits and availability can change. Review each provider's current terms before deploying.

Deployment checklist:

1. Create the PostgreSQL database and verify the connection.
2. Deploy the backend with the correct start command.
3. Set `DATABASE_URL` and a strong `JWT_SECRET` in the backend's environment settings.
4. Set `CLIENT_URL` to the exact deployed frontend origin.
5. Deploy the frontend with its backend URL configured.
6. Restrict CORS to the intended production origin.
7. Verify the backend health endpoint, if enabled.
8. Test HTTP requests and Socket.IO connections from the live frontend.
9. Test a game using two separate browser sessions.
10. Confirm that game results and other persistent data survive a backend restart.

## Security Notes

- Never commit `.env` files, database credentials, or JWT secrets.
- Keep secrets on the backend; frontend environment variables are visible to users.
- Use parameterized SQL queries.
- Validate and authorize sensitive operations on the server.
- Validate chess moves and game results on the server rather than trusting the browser.
- Restrict CORS and apply appropriate rate limits.
- Avoid returning stack traces or sensitive internal details to clients.
- Review dependency advisories and test security fixes before release.

## Roadmap

Update this list as work is completed:

- [ ] Publish a live demo
- [ ] Verify matchmaking and multiplayer flows end to end
- [ ] Test reconnection and disconnect handling
- [ ] Verify authentication and authorization
- [ ] Confirm leaderboard and game-result persistence
- [ ] Expand automated test coverage
- [ ] Document any remaining deployment limitations

## Contributing

This is a personal development project. Bug reports and constructive suggestions are welcome through GitHub Issues.

## License

No license is specified here. Add a `LICENSE` file if you decide to grant others permission to reuse, modify, or distribute the project.

## Author

**Qasim Khan** · [GitHub profile](https://github.com/Qasim-2357)
