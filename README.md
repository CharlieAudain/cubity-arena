# 🧊 Cubity - The Competitive Speedcubing Platform

> **"Chess.com for Speedcubing"** — A real-time, ELO-based ranked battling platform for speedcubers.

![License](https://img.shields.io/badge/license-AGPLv3-blue.svg)
![Status](https://img.shields.io/badge/status-Public%20Beta-orange.svg)
![Stack](https://img.shields.io/badge/stack-React%20%2F%20Node%20%2F%20Firebase-yellow)

## 📖 About The Project

**Cubity** is a web application designed to gamify speedcubing practice. Unlike traditional static timers, Cubity focuses on **Synchronous Multiplayer** competition. It utilizes a custom matchmaking algorithm to pair users based on skill (ELO), providing a fair and competitive environment similar to modern eSports titles.

**Live Site:** [https://www.cubity.app/]

### ✨ Key Features
* **⚔️ Ranked Matchmaking:** Real-time 1v1 battles using an ELO rating system (Ripple Search algorithm).
* **🔌 Smart Cube Integration:** Native support for Bluetooth hardware (Gan, Moyu) to visualize opponent moves in real-time.
* **⚡ WebSocket Architecture:** Zero-latency state synchronization for instant result verification.
* **📊 Post-Match Analytics:** Heatmap analysis of solve phases (Cross, F2L, OLL, PLL). (Coming Soon)

---

## 🛠️ Tech Stack

Built with a modern JavaScript stack focused on performance and real-time data.

* **Frontend:** React (Vite), TailwindCSS, Three.js (for 3D Cube Visualization).
* **Backend:** Node.js, Express, Socket.io (Real-time communication).
* **Database:** Google Firestore (User Data & Match History).
* **Authentication:** Firebase Auth.
* **Hosting:** Railway (Server) & Vercel (Client).

---

## 🚀 Getting Started

This project is structured as a **Monorepo**.
* `/`: The React frontend.
* `/server`: The Node.js backend API.

### Prerequisites
* Node.js (v18+)
* npm or yarn
* A Firebase Project (for API keys)

### 1. Installation

Clone the repository:
```bash
git clone [https://github.com/CharlieAudain/cubity-arena.git](https://github.com/CharlieAudain/cubity-arena.git)
cd cubity-arena
Install Server Dependencies:

Bash

cd server
npm install
Install Client Dependencies:

Bash

cd ..
npm install
2. Environment Variables
You must create a .env file in both directories.

Server (/server/.env):

Code snippet

PORT=3001
FIREBASE_ADMIN_KEY=...
CLIENT_URL=http://localhost:5173
Client (/.env):

Code snippet

VITE_API_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
3. Running Locally
To run the full stack, you need two terminal windows.

Terminal 1 (Backend):

Bash

cd server
node index.js
Terminal 2 (Frontend):

Bash


npm run dev
Open http://localhost:5173 to view it in the browser.

🤝 Contributing
Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are greatly appreciated.

Fork the Project

Create your Feature Branch (git checkout -b feature/AmazingFeature)

Commit your Changes (git commit -m 'Add some AmazingFeature')

Push to the Branch (git push origin feature/AmazingFeature)

Open a Pull Request

🛡️ License
Distributed under the AGPLv3 License. See LICENSE for more information.

👤 Author
Charles Audain

Role: Full Stack Developer

Location: London, UK

Portfolio: [https://dainz.co.uk]

GitHub: [https://github.com/CharlieAudain]
