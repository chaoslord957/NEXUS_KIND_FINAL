// ─────────────────────────────────────────────────────────────────────────────
//  community_server.js  —  NexusKind Community & Membership Backend
//  Port:  5003  (set COMMUNITY_PORT in .env to override)
//
//  Handles:
//    • Volunteer membership requests  (user → NGO)
//    • Task applications              (user applies for a specific task)
//    • NGO accepts / rejects both
//    • NGO members list (accepted volunteers)
//
//  Routes:
//    POST   /api/community/membership/request        user requests to join an NGO
//    GET    /api/community/membership/requests       NGO views all pending requests
//    PATCH  /api/community/membership/:id/accept     NGO accepts a membership
//    PATCH  /api/community/membership/:id/reject     NGO rejects a membership
//    DELETE /api/community/membership/:id            NGO removes a member
//    GET    /api/community/members                   NGO fetches its accepted members
//    GET    /api/community/membership/my             user sees their membership statuses
//
//    POST   /api/community/task/:taskId/apply        user applies for a task
//    GET    /api/community/task/:taskId/applicants   NGO views applicants for a task
//    PATCH  /api/community/task-application/:id/accept
//    PATCH  /api/community/task-application/:id/reject
//    GET    /api/community/task/my-applications      user's own task applications
//
//    GET    /api/community/ngos                      list all NGOs (for user to browse)
//    GET    /api/community/health
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

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Community Server: MongoDB connected'))
    .catch(err => console.error('Community Server: MongoDB error:', err));

// ── Shared schemas (same collections as server.js / ngo_server.js) ────────────

const ngoSchema = new mongoose.Schema({
    organizationName:  String,
    organizationType:  String,
    username:          String,
    email:             String,
    phone:             String,
    address:           String,
    bio:               String,
    pointOfContact:    String,
    requiredSkills:    String,
    volunteerCapacity: Number,
    role:              String,
    createdAt:         Date
}, { collection: 'ngos' });
const NGO = mongoose.models.NGO || mongoose.model('NGO', ngoSchema);

const userSchema = new mongoose.Schema({
    username:             String,
    fullName:             String,
    email:                String,
    phone:                String,
    location:             String,
    profession:           String,
    skills:               String,
    experienceLevel:      String,
    timeAvailablePerWeek: Number,
    role:                 String,
    createdAt:            Date
}, { collection: 'users' });
const User = mongoose.models.User || mongoose.model('User', userSchema);

const taskSchema = new mongoose.Schema({
    ngoId:            { type: mongoose.Schema.Types.ObjectId, index: true },
    title:            String,
    category:         String,
    description:      String,
    priority:         String,
    status:           String,
    location:         String,
    deadline:         String,
    volunteersNeeded: Number,
    assignedTo:       { type: Number, default: 0 },
    skills:           String,
    notes:            String,
    createdAt:        Date
}, { collection: 'tasks' });
const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);

// ── New schemas ───────────────────────────────────────────────────────────────

// MembershipRequest: user wants to become a volunteer member of an NGO
const membershipRequestSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    ngoId:     { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'NGO',  index: true },
    message:   { type: String, trim: true, default: '' },   // optional cover note
    status:    { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    resolvedAt:{ type: Date }
});

// Compound uniqueness — one pending/accepted request per user-NGO pair
membershipRequestSchema.index({ userId: 1, ngoId: 1 }, { unique: true });
const MembershipRequest = mongoose.model('MembershipRequest', membershipRequestSchema);

// TaskApplication: user applies for a specific task
const taskApplicationSchema = new mongoose.Schema({
    taskId:    { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Task',  index: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User',  index: true },
    ngoId:     { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'NGO',   index: true },
    message:   { type: String, trim: true, default: '' },
    status:    { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    resolvedAt:{ type: Date }
});

taskApplicationSchema.index({ taskId: 1, userId: 1 }, { unique: true });
const TaskApplication = mongoose.model('TaskApplication', taskApplicationSchema);

// ── JWT middleware ────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';

function authUser(req, res, next) {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err)                     return res.status(403).json({ message: 'Invalid or expired token' });
        if (decoded.role !== 'user') return res.status(403).json({ message: 'User access only' });
        req.userId = decoded.id;
        next();
    });
}

function authNGO(req, res, next) {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err)                    return res.status(403).json({ message: 'Invalid or expired token' });
        if (decoded.role !== 'ngo') return res.status(403).json({ message: 'NGO access only' });
        req.ngoId = decoded.id;
        next();
    });
}

function authAny(req, res, next) {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Invalid or expired token' });
        req.userId   = decoded.id;
        req.userRole = decoded.role;
        if (decoded.role === 'ngo') req.ngoId = decoded.id;
        next();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  HEALTH
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/community/health', (req, res) =>
    res.json({ status: 'OK', server: 'community_server', port: process.env.COMMUNITY_PORT || 5003 }));

// ─────────────────────────────────────────────────────────────────────────────
//  NGO LISTING  —  public, so users can browse & request to join
//  GET /api/community/ngos
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/community/ngos', async (req, res) => {
    try {
        const ngos = await NGO.find()
            .select('_id organizationName organizationType address bio requiredSkills volunteerCapacity')
            .sort({ organizationName: 1 });
        res.json(ngos);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching NGOs', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MEMBERSHIP — USER REQUESTS TO JOIN AN NGO
//  POST /api/community/membership/request
//  Body: { ngoId, message? }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/community/membership/request', authUser, async (req, res) => {
    try {
        const { ngoId, message } = req.body;
        if (!ngoId) return res.status(400).json({ message: 'ngoId is required' });

        const ngo = await NGO.findById(ngoId);
        if (!ngo) return res.status(404).json({ message: 'NGO not found' });

        // Check for existing request
        const existing = await MembershipRequest.findOne({ userId: req.userId, ngoId });
        if (existing) {
            if (existing.status === 'accepted')
                return res.status(400).json({ message: 'You are already a member of this NGO' });
            if (existing.status === 'pending')
                return res.status(400).json({ message: 'You already have a pending request for this NGO' });
            // was rejected — allow re-request by updating
            existing.status    = 'pending';
            existing.message   = message || '';
            existing.createdAt = new Date();
            existing.resolvedAt= undefined;
            await existing.save();
            return res.status(201).json({ message: 'Membership request sent', request: existing });
        }

        const request = await MembershipRequest.create({
            userId:  req.userId,
            ngoId,
            message: message || ''
        });
        res.status(201).json({ message: 'Membership request sent successfully', request });
    } catch (err) {
        res.status(500).json({ message: 'Error sending request', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MEMBERSHIP — USER'S OWN REQUEST STATUSES
//  GET /api/community/membership/my
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/community/membership/my', authUser, async (req, res) => {
    try {
        const requests = await MembershipRequest.find({ userId: req.userId })
            .sort({ createdAt: -1 });

        const ngoIds = [...new Set(requests.map(r => r.ngoId.toString()))];
        const ngos   = await NGO.find({ _id: { $in: ngoIds } })
            .select('_id organizationName organizationType');
        const ngoMap = {};
        ngos.forEach(n => { ngoMap[n._id.toString()] = n; });

        const enriched = requests.map(r => {
            const ngo = ngoMap[r.ngoId.toString()];
            return {
                ...r.toObject(),
                ngoName: ngo?.organizationName || 'Unknown NGO',
                ngoType: ngo?.organizationType || ''
            };
        });
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching requests', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MEMBERSHIP — NGO VIEWS ALL INCOMING REQUESTS
//  GET /api/community/membership/requests?status=pending  (default: all)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/community/membership/requests', authNGO, async (req, res) => {
    try {
        const filter = { ngoId: req.ngoId };
        if (req.query.status) filter.status = req.query.status;

        const requests = await MembershipRequest.find(filter).sort({ createdAt: -1 });

        const userIds = [...new Set(requests.map(r => r.userId.toString()))];
        const users   = await User.find({ _id: { $in: userIds } })
            .select('-password -secretAnswer');
        const userMap = {};
        users.forEach(u => { userMap[u._id.toString()] = u; });

        const enriched = requests.map(r => ({
            ...r.toObject(),
            user: userMap[r.userId.toString()] || null
        }));
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching requests', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MEMBERSHIP — NGO ACCEPTS
//  PATCH /api/community/membership/:id/accept
// ─────────────────────────────────────────────────────────────────────────────
app.patch('/api/community/membership/:id/accept', authNGO, async (req, res) => {
    try {
        const request = await MembershipRequest.findOne({ _id: req.params.id, ngoId: req.ngoId });
        if (!request) return res.status(404).json({ message: 'Request not found' });
        if (request.status !== 'pending')
            return res.status(400).json({ message: `Request is already ${request.status}` });

        request.status     = 'accepted';
        request.resolvedAt = new Date();
        await request.save();
        res.json({ message: 'Membership accepted', request });
    } catch (err) {
        res.status(500).json({ message: 'Error accepting request', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MEMBERSHIP — NGO REJECTS
//  PATCH /api/community/membership/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
app.patch('/api/community/membership/:id/reject', authNGO, async (req, res) => {
    try {
        const request = await MembershipRequest.findOne({ _id: req.params.id, ngoId: req.ngoId });
        if (!request) return res.status(404).json({ message: 'Request not found' });
        if (request.status !== 'pending')
            return res.status(400).json({ message: `Request is already ${request.status}` });

        request.status     = 'rejected';
        request.resolvedAt = new Date();
        await request.save();
        res.json({ message: 'Membership rejected', request });
    } catch (err) {
        res.status(500).json({ message: 'Error rejecting request', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MEMBERSHIP — NGO REMOVES AN EXISTING MEMBER
//  DELETE /api/community/membership/:id
// ─────────────────────────────────────────────────────────────────────────────
app.delete('/api/community/membership/:id', authNGO, async (req, res) => {
    try {
        const result = await MembershipRequest.findOneAndDelete({ _id: req.params.id, ngoId: req.ngoId });
        if (!result) return res.status(404).json({ message: 'Member not found' });
        res.json({ message: 'Member removed successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error removing member', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MEMBERS LIST — NGO FETCHES ALL ACCEPTED MEMBERS
//  GET /api/community/members
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/community/members', authNGO, async (req, res) => {
    try {
        const accepted = await MembershipRequest.find({ ngoId: req.ngoId, status: 'accepted' })
            .sort({ resolvedAt: -1 });

        const userIds = accepted.map(r => r.userId);
        const users   = await User.find({ _id: { $in: userIds } })
            .select('-password -secretAnswer');
        const userMap = {};
        users.forEach(u => { userMap[u._id.toString()] = u; });

        // Count tasks completed per user for this NGO
        const completedCounts = await TaskApplication.aggregate([
            { $match: {
                ngoId:  new mongoose.Types.ObjectId(req.ngoId),
                userId: { $in: userIds },
                status: 'accepted'
            }},
            { $group: { _id: '$userId', count: { $sum: 1 } } }
        ]);
        const countMap = {};
        completedCounts.forEach(c => { countMap[c._id.toString()] = c.count; });

        const members = accepted.map(r => {
            const u = userMap[r.userId.toString()];
            if (!u) return null;
            return {
                membershipId:    r._id,
                userId:          u._id,
                name:            u.fullName || u.username,
                username:        u.username,
                role:            'volunteer',
                email:           u.email    || null,
                phone:           u.phone    || null,
                location:        u.location || null,
                joined:          r.resolvedAt ? r.resolvedAt.toISOString().split('T')[0] : null,
                skills:          u.skills   || null,
                tasksApplied:    countMap[u._id.toString()] || 0,
                tasksCompleted:  countMap[u._id.toString()] || 0,
                donations:       null
            };
        }).filter(Boolean);

        res.json(members);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching members', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  TASK APPLICATION — USER APPLIES FOR A TASK
//  POST /api/community/task/:taskId/apply
//  Body: { message? }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/community/task/:taskId/apply', authUser, async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId);
        if (!task)                            return res.status(404).json({ message: 'Task not found' });
        if (task.status === 'completed')      return res.status(400).json({ message: 'This task is already completed' });
        if (task.volunteersNeeded > 0 && task.assignedTo >= task.volunteersNeeded)
            return res.status(400).json({ message: 'This task is already full' });

        const existing = await TaskApplication.findOne({ taskId: req.params.taskId, userId: req.userId });
        if (existing) {
            if (existing.status === 'accepted')
                return res.status(400).json({ message: 'You are already accepted for this task' });
            if (existing.status === 'pending')
                return res.status(400).json({ message: 'You already applied for this task' });
            // rejected — allow re-apply
            existing.status     = 'pending';
            existing.message    = req.body.message || '';
            existing.createdAt  = new Date();
            existing.resolvedAt = undefined;
            await existing.save();
            return res.status(201).json({ message: 'Application re-submitted', application: existing });
        }

        const application = await TaskApplication.create({
            taskId:  req.params.taskId,
            userId:  req.userId,
            ngoId:   task.ngoId,
            message: req.body.message || ''
        });
        res.status(201).json({ message: 'Application submitted successfully', application });
    } catch (err) {
        res.status(500).json({ message: 'Error applying for task', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  TASK APPLICANTS — NGO SEES WHO APPLIED FOR A TASK
//  GET /api/community/task/:taskId/applicants
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/community/task/:taskId/applicants', authNGO, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.taskId, ngoId: req.ngoId });
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const apps = await TaskApplication.find({ taskId: req.params.taskId })
            .sort({ createdAt: -1 });

        const userIds = apps.map(a => a.userId);
        const users   = await User.find({ _id: { $in: userIds } }).select('-password -secretAnswer');
        const userMap = {};
        users.forEach(u => { userMap[u._id.toString()] = u; });

        const enriched = apps.map(a => ({
            ...a.toObject(),
            user: userMap[a.userId.toString()] || null
        }));
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching applicants', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  TASK APPLICATION — NGO ACCEPTS
//  PATCH /api/community/task-application/:id/accept
// ─────────────────────────────────────────────────────────────────────────────
app.patch('/api/community/task-application/:id/accept', authNGO, async (req, res) => {
    try {
        const app = await TaskApplication.findOne({ _id: req.params.id, ngoId: req.ngoId });
        if (!app) return res.status(404).json({ message: 'Application not found' });
        if (app.status !== 'pending')
            return res.status(400).json({ message: `Application is already ${app.status}` });

        const task = await Task.findById(app.taskId);
        if (task && task.volunteersNeeded > 0 && task.assignedTo >= task.volunteersNeeded)
            return res.status(400).json({ message: 'Task is already full' });

        app.status     = 'accepted';
        app.resolvedAt = new Date();
        await app.save();

        // Increment assignedTo counter on the task
        if (task) {
            task.assignedTo = (task.assignedTo || 0) + 1;
            await task.save();
        }

        res.json({ message: 'Application accepted', application: app, newAssignedTo: task?.assignedTo });
    } catch (err) {
        res.status(500).json({ message: 'Error accepting application', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  TASK APPLICATION — NGO REJECTS
//  PATCH /api/community/task-application/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
app.patch('/api/community/task-application/:id/reject', authNGO, async (req, res) => {
    try {
        const app = await TaskApplication.findOne({ _id: req.params.id, ngoId: req.ngoId });
        if (!app) return res.status(404).json({ message: 'Application not found' });
        if (app.status !== 'pending')
            return res.status(400).json({ message: `Application is already ${app.status}` });

        // If was previously accepted, decrement the counter
        if (app.status === 'accepted') {
            const task = await Task.findById(app.taskId);
            if (task && task.assignedTo > 0) {
                task.assignedTo -= 1;
                await task.save();
            }
        }

        app.status     = 'rejected';
        app.resolvedAt = new Date();
        await app.save();
        res.json({ message: 'Application rejected', application: app });
    } catch (err) {
        res.status(500).json({ message: 'Error rejecting application', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  USER'S OWN TASK APPLICATIONS
//  GET /api/community/task/my-applications
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/community/task/my-applications', authUser, async (req, res) => {
    try {
        const apps = await TaskApplication.find({ userId: req.userId }).sort({ createdAt: -1 });

        const taskIds = [...new Set(apps.map(a => a.taskId.toString()))];
        const ngoIds  = [...new Set(apps.map(a => a.ngoId.toString()))];

        const [tasks, ngos] = await Promise.all([
            Task.find({ _id: { $in: taskIds } }).select('title category status priority deadline'),
            NGO.find({ _id: { $in: ngoIds } }).select('organizationName organizationType')
        ]);

        const taskMap = {};
        tasks.forEach(t => { taskMap[t._id.toString()] = t; });
        const ngoMap = {};
        ngos.forEach(n => { ngoMap[n._id.toString()] = n; });

        const enriched = apps.map(a => ({
            ...a.toObject(),
            task:    taskMap[a.taskId.toString()] || null,
            ngoName: ngoMap[a.ngoId.toString()]?.organizationName || 'Unknown NGO',
            ngoType: ngoMap[a.ngoId.toString()]?.organizationType || ''
        }));
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching applications', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  NGO — PENDING COUNTS SUMMARY  (for dashboard badges)
//  GET /api/community/ngo/pending-counts
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/community/ngo/pending-counts', authNGO, async (req, res) => {
    try {
        const [membershipCount, taskAppCount] = await Promise.all([
            MembershipRequest.countDocuments({ ngoId: req.ngoId, status: 'pending' }),
            TaskApplication.countDocuments({ ngoId: req.ngoId, status: 'pending' })
        ]);
        res.json({ membershipRequests: membershipCount, taskApplications: taskAppCount });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching counts', error: err.message });
    }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong', error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.COMMUNITY_PORT || 5003;
app.listen(PORT, () => {
    console.log(`✅  Community Server  →  http://localhost:${PORT}`);
    console.log(`   POST   /api/community/membership/request`);
    console.log(`   GET    /api/community/membership/requests     (NGO)`);
    console.log(`   PATCH  /api/community/membership/:id/accept   (NGO)`);
    console.log(`   PATCH  /api/community/membership/:id/reject   (NGO)`);
    console.log(`   DELETE /api/community/membership/:id          (NGO)`);
    console.log(`   GET    /api/community/members                 (NGO)`);
    console.log(`   GET    /api/community/membership/my           (User)`);
    console.log(`   POST   /api/community/task/:taskId/apply      (User)`);
    console.log(`   GET    /api/community/task/:taskId/applicants (NGO)`);
    console.log(`   PATCH  /api/community/task-application/:id/accept`);
    console.log(`   PATCH  /api/community/task-application/:id/reject`);
    console.log(`   GET    /api/community/task/my-applications    (User)`);
    console.log(`   GET    /api/community/ngo/pending-counts      (NGO)`);
    console.log(`   GET    /api/community/ngos                    (Public)`);
});
