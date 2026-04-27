// ─────────────────────────────────────────────────────────────────────────────
//  ngo_server.js  —  NexusKind NGO Dashboard Backend
//  Port:  5002  (set NGO_PORT in .env to override)
//  Needs: server.js running on 5001 for auth
//
//  Routes:
//    GET    /api/ngo/health
//    GET    /api/ngo/profile
//    PUT    /api/ngo/profile
//    GET    /api/ngo/tasks
//    POST   /api/ngo/tasks
//    PUT    /api/ngo/tasks/:id
//    PATCH  /api/ngo/tasks/:id
//    DELETE /api/ngo/tasks/:id
// ─────────────────────────────────────────────────────────────────────────────

const express  = require('express');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.static('.'));

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('NGO Server: MongoDB connected'))
    .catch(err => console.error('NGO Server: MongoDB error:', err));

// ── NGO Schema — mirrors server.js exactly, same collection ──────────────────
const ngoSchema = new mongoose.Schema({
    organizationName:   { type: String },
    organizationType:   { type: String },
    registrationNumber: { type: String },
    bio:                { type: String },
    username:           { type: String },
    password:           { type: String },
    email:              { type: String },
    phone:              { type: String },
    pointOfContact:     { type: String },
    role:               { type: String },
    address:            { type: String },
    latitude:           { type: String },
    longitude:          { type: String },
    operatingRadius:    { type: Number },
    requiredSkills:     { type: String },
    volunteerCapacity:  { type: Number },
    resourcesProvided:  { type: String },
    taxExempt:          { type: Boolean },
    website:            { type: String },
    instagram:          { type: String },
    certificateFile:    { type: String },
    createdAt:          { type: Date },
    lastLogin:          { type: Date }
}, { collection: 'ngos' });

const NGO = mongoose.models.NGO || mongoose.model('NGO', ngoSchema);

// ── Task Schema ───────────────────────────────────────────────────────────────
const taskSchema = new mongoose.Schema({
    ngoId:            { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    title:            { type: String, required: true, trim: true },
    category:         { type: String, trim: true, default: 'General' },
    description:      { type: String, trim: true, default: '' },
    priority:         { type: String, enum: ['high', 'med', 'low'], default: 'med' },
    status:           { type: String, enum: ['pending', 'ongoing', 'completed'], default: 'pending' },
    location:         { type: String, trim: true, default: '' },
    deadline:         { type: String, default: '' },
    volunteersNeeded: { type: Number, default: 0 },
    assignedTo:       { type: Number, default: 0 },
    skills:           { type: String, trim: true, default: '' },
    notes:            { type: String, trim: true, default: '' },
    createdAt:        { type: Date, default: Date.now }
});

const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);

// ── User Schema — same collection as server.js ───────────────────────────────
const userSchema = new mongoose.Schema({
    username:             String,
    password:             String,
    secretQuestion:       String,
    secretAnswer:         String,
    fullName:             String,
    age:                  Number,
    email:                String,
    phone:                String,
    location:             String,
    profession:           String,
    timeAvailablePerWeek: Number,
    experienceLevel:      String,
    skills:               String,
    role:                 String,
    createdAt:            Date,
    lastLogin:            Date
}, { collection: 'users' });

const User = mongoose.models.User || mongoose.model('User', userSchema);

// ── JWT helpers ───────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';

// NGO-only middleware
function authenticateNGO(req, res, next) {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err)                    return res.status(403).json({ message: 'Invalid or expired token' });
        if (decoded.role !== 'ngo') return res.status(403).json({ message: 'NGO access only' });
        req.ngoId = decoded.id;
        next();
    });
}

// User-only middleware
function authenticateUser(req, res, next) {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err)                     return res.status(403).json({ message: 'Invalid or expired token' });
        if (decoded.role !== 'user') return res.status(403).json({ message: 'User access only' });
        req.userId = decoded.id;
        next();
    });
}

// ── Helper ────────────────────────────────────────────────────────────────────
function serializeTask(t) {
    const obj = t.toObject ? t.toObject() : t;
    return { ...obj, id: obj._id.toString() };
}

// ─────────────────────────────────────────────────────────────────────────────
//  HEALTH
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/ngo/health', (req, res) =>
    res.json({ status: 'OK', server: 'ngo_server', port: process.env.NGO_PORT || 5002 }));

// ─────────────────────────────────────────────────────────────────────────────
//  PROFILE
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ngo/profile
app.get('/api/ngo/profile', authenticateNGO, async (req, res) => {
    try {
        const ngo = await NGO.findById(req.ngoId).select('-password');
        if (!ngo) return res.status(404).json({ message: 'NGO not found' });
        res.json({ ngo });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching profile', error: err.message });
    }
});

// PUT /api/ngo/profile
app.put('/api/ngo/profile', authenticateNGO, async (req, res) => {
    try {
        const forbidden = ['password', 'username', 'role', '_id'];
        const update    = Object.fromEntries(
            Object.entries(req.body).filter(([k]) => !forbidden.includes(k))
        );
        const ngo = await NGO.findByIdAndUpdate(
            req.ngoId, update, { new: true, runValidators: false }
        ).select('-password');
        if (!ngo) return res.status(404).json({ message: 'NGO not found' });
        res.json({ message: 'Profile updated', ngo });
    } catch (err) {
        res.status(500).json({ message: 'Error updating profile', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  TASKS — full CRUD, scoped to the authenticated NGO only
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ngo/tasks
app.get('/api/ngo/tasks', authenticateNGO, async (req, res) => {
    try {
        const tasks = await Task.find({ ngoId: req.ngoId }).sort({ createdAt: -1 });
        res.json(tasks.map(serializeTask));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching tasks', error: err.message });
    }
});

// POST /api/ngo/tasks
app.post('/api/ngo/tasks', authenticateNGO, async (req, res) => {
    try {
        const { title, category, description, priority, status,
                location, deadline, volunteersNeeded, skills, notes } = req.body;

        if (!title) return res.status(400).json({ message: 'Title is required' });

        const task = await Task.create({
            ngoId:            req.ngoId,
            title:            title.trim(),
            category:         category         || 'General',
            description:      description      || '',
            priority:         priority         || 'med',
            status:           status           || 'pending',
            location:         location         || '',
            deadline:         deadline         || '',
            volunteersNeeded: parseInt(volunteersNeeded) || 0,
            assignedTo:       0,
            skills:           skills           || '',
            notes:            notes            || ''
        });

        res.status(201).json(serializeTask(task));
    } catch (err) {
        res.status(500).json({ message: 'Error creating task', error: err.message });
    }
});

// PUT /api/ngo/tasks/:id
app.put('/api/ngo/tasks/:id', authenticateNGO, async (req, res) => {
    try {
        const task = await Task.findOneAndUpdate(
            { _id: req.params.id, ngoId: req.ngoId },
            { $set: req.body },
            { new: true, runValidators: false }
        );
        if (!task) return res.status(404).json({ message: 'Task not found' });
        res.json(serializeTask(task));
    } catch (err) {
        res.status(500).json({ message: 'Error updating task', error: err.message });
    }
});

// PATCH /api/ngo/tasks/:id
app.patch('/api/ngo/tasks/:id', authenticateNGO, async (req, res) => {
    try {
        const task = await Task.findOneAndUpdate(
            { _id: req.params.id, ngoId: req.ngoId },
            { $set: req.body },
            { new: true }
        );
        if (!task) return res.status(404).json({ message: 'Task not found' });
        res.json(serializeTask(task));
    } catch (err) {
        res.status(500).json({ message: 'Error patching task', error: err.message });
    }
});

// DELETE /api/ngo/tasks/:id
app.delete('/api/ngo/tasks/:id', authenticateNGO, async (req, res) => {
    try {
        const result = await Task.findOneAndDelete({ _id: req.params.id, ngoId: req.ngoId });
        if (!result) return res.status(404).json({ message: 'Task not found' });
        res.json({ message: 'Task deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting task', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  USER PROFILE  —  full user data from DB (all signup fields)
//  GET /api/user/profile
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/user/profile', authenticateUser, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password -secretAnswer');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ user });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching user profile', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC TASK FEED  —  all pending/ongoing tasks from ALL NGOs
//  Used by the user dashboard task feed
//  GET /api/tasks/public
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/tasks/public', async (req, res) => {   // No auth — public endpoint for user dashboard
    try {
        // All tasks that are still open
        const tasks = await Task.find({
            status: { $in: ['pending', 'ongoing'] }
        }).sort({ createdAt: -1 });

        if (!tasks.length) return res.json([]);

        // Get unique NGO IDs from those tasks
        const ngoIds = [...new Set(tasks.map(t => t.ngoId.toString()))];

        // Fetch those NGOs in one query to get their names
        const ngos = await NGO.find({ _id: { $in: ngoIds } })
            .select('_id organizationName organizationType');

        // Build lookup map: ngoId string → NGO doc
        const ngoMap = {};
        ngos.forEach(n => { ngoMap[n._id.toString()] = n; });

        // Attach NGO info to each task and return
        const enriched = tasks.map(t => {
            const obj = t.toObject();
            const ngo = ngoMap[t.ngoId.toString()];
            return {
                ...obj,
                id:      obj._id.toString(),
                ngoName: ngo?.organizationName || 'Unknown NGO',
                ngoType: ngo?.organizationType || '',
                ngoInit: (ngo?.organizationName || 'UK')
                            .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            };
        });

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching public tasks', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC SINGLE TASK  —  full detail for one task by ID (no auth required)
//  Used by user_task_detail.html
//  GET /api/tasks/public/:id
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/tasks/public/:id', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const ngo = await NGO.findById(task.ngoId).select('organizationName organizationType address website instagram volunteerCapacity');

        const obj = task.toObject();
        const enriched = {
            ...obj,
            id:               obj._id.toString(),
            ngoName:          ngo?.organizationName || 'Unknown NGO',
            ngoType:          ngo?.organizationType || '',
            ngoAddress:       ngo?.address          || '',
            ngoWebsite:       ngo?.website          || '',
            ngoInstagram:     ngo?.instagram        || '',
            ngoCapacity:      ngo?.volunteerCapacity || 0,
            ngoInit: (ngo?.organizationName || 'NK')
                        .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        };

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching task', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MAP TASKS  —  all active tasks with NGO lat/lng for Google Maps pins
//  GET /api/tasks/map
// ─────────────────────────────────────────────────────────────────────────────

const _geocodeCache = {};

async function geocodeAddress(address) {
    if (!address) return null;
    const key = address.trim().toLowerCase();
    if (_geocodeCache[key]) return _geocodeCache[key];
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
        const r = await fetch(url, { headers: { 'User-Agent': 'NexusKind/1.0 volunteer-platform' } });
        if (!r.ok) return null;
        const results = await r.json();
        if (!results.length) return null;
        const coords = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
        _geocodeCache[key] = coords;
        return coords;
    } catch (e) {
        console.warn('Geocode failed for:', address, e.message);
        return null;
    }
}

app.get('/api/tasks/map', async (req, res) => {
    try {
        const tasks = await Task.find({ status: { $in: ['pending', 'ongoing'] } }).sort({ createdAt: -1 });
        if (!tasks.length) return res.json([]);

        const ngoIds = [...new Set(tasks.map(t => t.ngoId.toString()))];
        const ngos = await NGO.find({ _id: { $in: ngoIds } })
            .select('_id organizationName organizationType address latitude longitude bio website instagram volunteerCapacity requiredSkills');

        const ngoMap = {};
        ngos.forEach(n => { ngoMap[n._id.toString()] = n; });

        const coordMap = {};
        for (const ngo of ngos) {
            let lat = parseFloat(ngo.latitude);
            let lng = parseFloat(ngo.longitude);
            if (isNaN(lat) || isNaN(lng)) {
                const coords = await geocodeAddress(ngo.address || '');
                if (coords) { lat = coords.lat; lng = coords.lng; }
            }
            coordMap[ngo._id.toString()] = { lat, lng };
            await new Promise(r => setTimeout(r, 300));
        }

        const enriched = tasks.map(t => {
            const obj = t.toObject();
            const ngo = ngoMap[t.ngoId.toString()];
            if (!ngo) return null;
            const { lat, lng } = coordMap[t.ngoId.toString()] || {};
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
            return {
                ...obj,
                id:                obj._id.toString(),
                ngoName:           ngo.organizationName  || 'Unknown NGO',
                ngoType:           ngo.organizationType  || '',
                ngoAddress:        t.location || ngo.address || '',
                ngoWebsite:        ngo.website           || '',
                ngoInstagram:      ngo.instagram         || '',
                ngoCapacity:       ngo.volunteerCapacity || 0,
                ngoRequiredSkills: ngo.requiredSkills    || '',
                ngoBio:            ngo.bio               || '',
                ngoInit: (ngo.organizationName || 'NK')
                            .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
                lat, lng
            };
        }).filter(Boolean);

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching map tasks', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GEMINI HELPER  —  shared function for both AI routes
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
        })
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API ${response.status}: ${err}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
}

// ─────────────────────────────────────────────────────────────────────────────
//  AI TASK SUMMARY  —  Gemini-powered insight on nearby tasks
//  POST /api/ai/task-summary
//  Body: { tasks: [...], userLocation: { lat, lng } }
//  Requires GEMINI_API_KEY in .env
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/ai/task-summary', async (req, res) => {
    try {
        const { tasks, userLocation } = req.body;
        if (!tasks || !tasks.length) {
            return res.json({ summary: 'No nearby tasks found to summarise.' });
        }
        const taskList = tasks.slice(0, 10).map((t, i) =>
            `${i + 1}. "${t.title}" — ${t.category || 'General'} | ${t.status} | Priority: ${t.priority} | NGO: ${t.ngoName} | Skills: ${t.skills || 'N/A'} | Volunteers needed: ${t.volunteersNeeded || 'N/A'}`
        ).join('\n');
        const prompt = `You are a friendly volunteer coordinator assistant for NexusKind, a community relief platform.

A volunteer is viewing a map of nearby NGO tasks. Here are tasks near them:

${taskList}
${userLocation ? `\nVolunteer's approximate location: lat ${userLocation.lat.toFixed(4)}, lng ${userLocation.lng.toFixed(4)}` : ''}

Write a SHORT, warm, motivating 2-3 sentence summary that:
1. Highlights the most urgent or impactful opportunity
2. Mentions a skill or category that stands out
3. Encourages action

Under 70 words. Be specific. No bullet points.`;

        const summary = await callGemini(prompt);
        res.json({ summary });
    } catch (err) {
        console.error('AI summary error:', err.message);
        res.status(500).json({ message: 'AI summary error', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  AI VOLUNTEER CHAT  —  context-aware volunteer assistant (Gemini)
//  POST /api/ai/volunteer-chat
//  Body: { message, tasks, userSkills }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/ai/volunteer-chat', async (req, res) => {
    try {
        const { message, tasks, userSkills } = req.body;

        const taskContext = (tasks || []).slice(0, 15).map((t, i) =>
            `${i+1}. "${t.title}" [${t.category}/${t.status}/priority:${t.priority}] by ${t.ngoName} — needs: ${t.skills || 'any'}`
        ).join('\n');

        const prompt = `You are NexusKind's volunteer assistant. Help volunteers find the right tasks near them.
Available tasks on the map:
${taskContext}
${userSkills ? `The volunteer's skills: ${userSkills}` : ''}
Answer helpfully and concisely. Suggest specific tasks by name when relevant. Keep replies under 100 words. No markdown.

Volunteer asks: ${message}`;

        const reply = await callGemini(prompt);
        res.json({ reply });
    } catch (err) {
        console.error('Chat error:', err.message);
        res.status(500).json({ message: 'Chat error', error: err.message });
    }
});
// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong', error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.NGO_PORT || 5002;
app.listen(PORT, () => {
    console.log(`✅  NGO Server  →  http://localhost:${PORT}`);
    console.log(`   GET    /api/ngo/profile`);
    console.log(`   GET    /api/ngo/tasks`);
    console.log(`   POST   /api/ngo/tasks`);
    console.log(`   PUT    /api/ngo/tasks/:id`);
    console.log(`   PATCH  /api/ngo/tasks/:id`);
    console.log(`   DELETE /api/ngo/tasks/:id`);
    console.log(`   GET    /api/user/profile`);
    console.log(`   GET    /api/tasks/public`);
    console.log(`   GET    /api/tasks/public/:id`);
    console.log(`   GET    /api/tasks/map`);
    console.log(`   POST   /api/ai/task-summary`);
    console.log(`   POST   /api/ai/volunteer-chat`);
});