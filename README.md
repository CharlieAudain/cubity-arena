🧊 CUBITY

The fastest, most competitive speedcubing platform on the web.
A "Unicorn Strategy" project focusing on high-performance, social connectivity, and hardware integration.

🚀 Vision & Strategy

Cubity is not just another timer app. It is a Connected Gaming Platform for the speedcubing community. Our goal is to transition the sport from solitary practice to a socially connected, competitive esport.

We are executing a "Hardware-Enabled SaaS" strategy (similar to Peloton or Whoop), moving through three distinct phases:

The Build (Current): Perfecting the core software engine, data analytics, and user experience.

The Network: Introducing real-time multiplayer ("The Arena"), ranked leagues, and social features to build a defensible moat.

The Ecosystem: Launching proprietary hardware (Cubity One) to unlock anti-cheat verified tournaments and professional AI coaching.

⚡ Current Progress (Alpha 1.0)

We have successfully built and deployed the foundational "Single Player" experience.

✅ Core Infrastructure

Tech Stack: Vite + React (Frontend), Tailwind CSS (Styling), Firebase (Auth & Firestore).

Deployment: Live on Vercel with CI/CD.

Authentication: Robust system supporting Guest Mode (frictionless entry), Google Sign-In, and account linking to save progress.

🧩 The Timer Engine

Pro-Grade Timer: Keyboard (Spacebar) and Touch controls with inspection logic.

Scramble Generation: legitimate, random scrambles for 2x2, 3x3, and 4x4 puzzles.

Scramble Visualization: 2D unfolded net visualizer that accurately renders the scrambled state.

📊 Data & Analytics

Persistent History: All solves are saved to a scalable Firestore database.

Smart Stats: Automatic calculation of Ao5 (Average of 5) and Ao12.

Filtering: View history by puzzle type (2x2, 3x3, 4x4).

Penalty System: Full support for +2 and DNF penalties, with stats recalculating instantly.

"Best vs Current": Toggle to see your all-time best averages vs your current session.

⚔️ The Arena (Multiplayer Beta)

Matchmaking System: A serverless, client-side matchmaking hook (useMatchmaking).

Lobby System: Users can Host or Join rooms based on puzzle type (2x2 queue, 3x3 queue, etc.).

Battle Room: A dedicated VS screen where opponents see the exact same scramble to ensure fair play.

Live Status: Real-time syncing of match results (Win/Loss/Draw).

🎨 Design & Branding

"Velocity" Theme: A custom aesthetic built on electric blues (#3b82f6) and deep indigo, designed to feel fast and energetic.

Responsive: Fully optimized for Desktop (keyboard focus) and Mobile (touch-friendly large tap zones).

🛠️ Roadmap (The Path to Unicorn)

🛑 Sprint 1: The Core Loop (Completed)

[x] Timer Engine & Scrambles

[x] Auth & Database

[x] Stats & History

[x] Visualizer

⚔️ Sprint 2: The Multiplayer Engine (In Progress)

[x] Matchmaking Logic

[x] Battle Room UI

[ ] Live Progress Sync: Seeing the opponent's progress bar move in real-time during the solve.

[ ] ELO System: Ranking players (Bronze/Silver/Gold) based on match outcomes.

🔌 Sprint 3: Hardware Integration (Next)

[ ] Bluetooth Driver: Connecting to GAN/GoCube smart cubes via Web Bluetooth API.

[ ] Auto-Timer: Timer starts/stops automatically when physical moves are detected.

[ ] 3D Replay: Replaying solves move-by-move to analyze mistakes.

💻 Local Development

Clone the repo:

git clone [https://github.com/YOUR_USERNAME/cubity.git](https://github.com/YOUR_USERNAME/cubity.git)
cd cubity


Install dependencies:

npm install


Configure Environment:
Create a .env.local file in the root directory with your Firebase keys:

VITE_API_KEY=...
VITE_AUTH_DOMAIN=...
VITE_PROJECT_ID=...
VITE_STORAGE_BUCKET=...
VITE_MESSAGING_SENDER_ID=...
VITE_APP_ID=...


Run the app:

npm run dev


Built with 💙 for speedcubers.