# NexusKind — Volunteer Coordination Platform

> Connecting volunteers with NGOs through smart task matching, real-time maps, and AI-powered assistance.

---

## What is NexusKind?

Local NGOs struggle to find the right volunteers fast. Volunteers don't know where they're needed. NexusKind bridges that gap — NGOs post tasks, volunteers discover them on a live map, and an AI assistant helps match the right person to the right opportunity.

Built as a full-stack production application with separate role-based experiences for volunteers and NGO administrators.

---

## Live Demo

> **Frontend:** [https://nexus-kind-final-page.netlify.app/signup_new.html]

---

## Features

**For Volunteers**
- Interactive task map powered by OpenStreetMap — see exactly where help is needed
- Filter tasks by priority, category, and distance from your location
- AI-powered insight banner summarising the most urgent opportunities nearby
- AI chat assistant that recommends tasks based on your skills and location
- Apply to tasks and track application status in real time
- Edit your profile and skill set

**For NGOs**
- Full task management — create, edit, assign, and close volunteer tasks
- Member directory with join request approvals
- Applicant review system — accept or reject volunteer applications per task
- Dashboard with live stats on active tasks and member count

**Platform**
- Dual login system — separate flows for Users and NGOs
- JWT-based authentication with secure password hashing
- Dark mode across all pages
- Fully responsive UI

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| UI Framework | Bootstrap 5.3 |
| Icons | Font Awesome 6.4 |
| Map | Leaflet.js + OpenStreetMap |
| Geocoding | Nominatim API |
| Backend | Node.js + Express.js |
| Database | MongoDB Atlas |
| Auth | JWT + bcryptjs |
| AI | Google Gemini 2.5 Flash |
| Deployment | Render (backend) + Netlify (frontend) |

---

## Architecture

Three independent Express servers handle different concerns:

```
server_3.js          (port 5001)  →  Authentication — signup, login, profile
ngo_server_3new.js   (port 5002)  →  Tasks, NGO data, AI routes
community_server.js  (port 5003)  →  Memberships, applications, community
```

All three connect to the same MongoDB Atlas cluster and share JWT-based auth middleware.

---

## AI Integration

The Gemini 2.5 Flash API powers two features on the task map:

**AI Insight Banner** — on page load, analyses up to 10 nearby tasks and generates a short contextual summary highlighting the most urgent opportunity for the volunteer. Results are cached server-side for 10 minutes to avoid unnecessary API calls.

**AI Chat Assistant** — a context-aware chat panel that knows the volunteer's skills, location, and all available tasks. Responds to natural language questions like *"what tasks match my skills?"* or *"which NGO needs the most help right now?"*

Both features route through the backend server to avoid CORS issues and keep the API key secure.

---

## Project Structure

```
NEXUS_KIND/
├── server_3.js              # Auth server (port 5001)
├── ngo_server_3new.js       # NGO + AI server (port 5002)
├── community_server.js      # Community server (port 5003)
├── .env                     # Environment variables (not committed)
├── package.json
├── login_2.html             # Login page (User + NGO)
├── signup_new.html          # Registration page
├── user_dashboard_3.html    # Volunteer dashboard
├── task_map_osm.html        # Interactive task map + AI
├── user_profile.html        # Volunteer profile
├── user_task_detail.html    # Task detail view
├── ngo_dashboard_2.html     # NGO dashboard
├── ngo_tasks_2.html         # Task management
├── ngo_members.html         # Member management
└── ngo_reports.html         # Analytics
```

---

## Getting Started

### Prerequisites
- Node.js v18+
- MongoDB Atlas account
- Google AI Studio API key (Gemini)

### Installation

```bash
git clone https://github.com/YOURUSERNAME/nexuskind.git
cd nexuskind
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
GEMINI_API_KEY=your_gemini_api_key
PORT=5001
NGO_PORT=5002
COMMUNITY_PORT=5003
NODE_ENV=development
```

### Running Locally

Open three terminal windows:

```bash
# Terminal 1 — Auth server
node server_3.js

# Terminal 2 — NGO + AI server
node ngo_server_3new.js

# Terminal 3 — Community server
node community_server.js
```

Then open `login_2.html` in your browser via a local server (e.g. Live Server in VS Code) or access via `http://localhost:5002/login_2.html` after adding `app.use(express.static('.'))` to ngo_server_3new.js.

---

## API Overview

**Auth Server — port 5001**
```
POST   /api/auth/user/signup
POST   /api/auth/user/login
POST   /api/auth/ngo/signup
POST   /api/auth/ngo/login
GET    /api/profile
PUT    /api/profile
PUT    /api/change-password
```

**NGO Server — port 5002**
```
GET    /api/tasks/public
GET    /api/tasks/map
GET    /api/ngo/profile
GET    /api/ngo/tasks
POST   /api/ngo/tasks
PUT    /api/ngo/tasks/:id
DELETE /api/ngo/tasks/:id
GET    /api/user/profile
POST   /api/ai/task-summary
POST   /api/ai/volunteer-chat
```

**Community Server — port 5003**
```
POST   /api/community/membership/request
GET    /api/community/membership/my
PATCH  /api/community/membership/:id/accept
PATCH  /api/community/membership/:id/reject
GET    /api/community/members
POST   /api/community/task/:id/apply
GET    /api/community/task/:id/applicants
PATCH  /api/community/task-application/:id/accept
PATCH  /api/community/task-application/:id/reject
GET    /api/community/task/my-applications
```

---

## Screenshots

<img width="1413" height="855" alt="image" src="https://github.com/user-attachments/assets/d56767c8-ba9c-4ed5-a6ac-650f33c81fb0" />
<img width="1896" height="880" alt="image" src="https://github.com/user-attachments/assets/590e85fa-3a49-4426-a016-bc16ee65e1bd" />
<img width="1916" height="971" alt="image" src="https://github.com/user-attachments/assets/ae77d532-eed5-407b-bf1c-1c01f9099e13" />
<img width="1914" height="879" alt="image" src="https://github.com/user-attachments/assets/47dd32ad-ba33-4bce-b829-3d65a8e1b830" />
<img width="1913" height="875" alt="image" src="https://github.com/user-attachments/assets/916fe149-32a8-488a-803a-c82a2e730c6e" />
<img width="1891" height="873" alt="image" src="https://github.com/user-attachments/assets/ba0c2923-2f0f-4722-a20c-046ed5b75ab1" />
<img width="1252" height="639" alt="image" src="https://github.com/user-attachments/assets/bdd48896-ff8a-4211-9ddb-e104de9bb535" />
<img width="1252" height="639" alt="image" src="https://github.com/user-attachments/assets/db86d259-d2b1-42f0-9e82-6e39b7bbde7a" />





---

## Roadmap

- [ ] Mobile app (React Native)
- [ ] NGO analytics dashboard with charts
- [ ] In-app notifications
- [ ] Volunteer rating system
- [ ] Multi-language support

---

## License

MIT License — feel free to use, modify, and distribute.

---

*Built with a lot of late nights and way too much debugging.*
