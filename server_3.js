const express   = require('express');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ─── MongoDB ──────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// ─── Password helpers ─────────────────────────────────────────────────────────
const hashPassword    = async (pw) => bcrypt.hash(pw, await bcrypt.genSalt(10));
const comparePassword = (candidate, hashed) => bcrypt.compare(candidate, hashed);

// ─────────────────────────────────────────────────────────────────────────────
//  USER SCHEMA
//  Covers every field collected in signup_new.html user form (3 steps)
// ─────────────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    // ── Step 1: Account ──────────────────────────────────────────────────────
    username:             { type: String, required: true, unique: true, trim: true, lowercase: true },
    password:             { type: String, required: true, minlength: 6 },
    secretQuestion:       { type: String, trim: true },   // "What was your first pet?"
    secretAnswer:         { type: String, trim: true },   // hashed answer for password reset

    // ── Step 2: Personal ─────────────────────────────────────────────────────
    fullName:             { type: String, trim: true },
    age:                  { type: Number, min: 16, max: 100 },
    email:                { type: String, trim: true, lowercase: true, sparse: true },
    phone:                { type: String, trim: true },
    location:             { type: String, trim: true },   // "City, State, Country"
    profession:           { type: String, trim: true },   // dropdown value

    // ── Step 3: Volunteer ────────────────────────────────────────────────────
    timeAvailablePerWeek: { type: Number },               // hours/week from slider
    experienceLevel:      { type: String, trim: true },   // dropdown value
    skills:               { type: String, trim: true },   // comma-separated chip selections

    // ── Meta ─────────────────────────────────────────────────────────────────
    role:                 { type: String, default: 'user' },
    createdAt:            { type: Date, default: Date.now },
    lastLogin:            { type: Date }
});

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await hashPassword(this.password);
});

const User = mongoose.model('User', userSchema);

// ─────────────────────────────────────────────────────────────────────────────
//  NGO SCHEMA
//  Covers every field collected in signup_new.html NGO form (5 steps)
// ─────────────────────────────────────────────────────────────────────────────
const ngoSchema = new mongoose.Schema({
    // ── Step 1: Identity ─────────────────────────────────────────────────────
    organizationName:   { type: String, required: true, trim: true },
    organizationType:   { type: String, trim: true },     // dropdown: Healthcare, Education…
    registrationNumber: { type: String, trim: true },     // CIN / 80G / Charity ID
    bio:                { type: String, trim: true, maxlength: 280 },

    // ── Step 2: Account & Contact ────────────────────────────────────────────
    username:           { type: String, required: true, unique: true, trim: true, lowercase: true },
    password:           { type: String, required: true, minlength: 6 },
    email:              { type: String, trim: true, lowercase: true, sparse: true },
    phone:              { type: String, trim: true },
    pointOfContact:     { type: String, trim: true },     // admin/manager name

    // ── Step 3: Geographic Footprint ─────────────────────────────────────────
    address:            { type: String, trim: true },     // headquarters address
    latitude:           { type: String },                 // from geolocation API
    longitude:          { type: String },
    operatingRadius:    { type: Number, default: 25 },    // km, from slider

    // ── Step 4: Operational DNA ──────────────────────────────────────────────
    requiredSkills:     { type: String },                 // comma-separated chip selections
    volunteerCapacity:  { type: Number, default: 20 },   // per week, from slider
    resourcesProvided:  { type: String },                 // comma-separated checklist

    // ── Step 5: Verification & Legal ─────────────────────────────────────────
    taxExempt:          { type: Boolean, default: false },
    website:            { type: String, trim: true },
    instagram:          { type: String, trim: true },
    certificateFile:    { type: String },                 // filename of uploaded cert

    // ── Meta ─────────────────────────────────────────────────────────────────
    role:               { type: String, default: 'ngo' },
    createdAt:          { type: Date, default: Date.now },
    lastLogin:          { type: Date }
});

ngoSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await hashPassword(this.password);
});

const NGO = mongoose.model('NGO', ngoSchema);

// ─── JWT helpers ──────────────────────────────────────────────────────────────
const JWT_SECRET  = process.env.JWT_SECRET || 'change-this-secret-in-production';
const generateToken = (id, role) => jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '7d' });

const authenticateToken = (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Invalid or expired token' });
        req.userId   = decoded.id;
        req.userRole = decoded.role;
        next();
    });
};

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) =>
    res.json({ status: 'OK', message: 'Server is running' }));

// ─────────────────────────────────────────────────────────────────────────────
//  USER SIGNUP
//  Accepts every field from signup_new.html user form
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/user/signup', async (req, res) => {
    try {
        const {
            username, password,
            secretQuestion, secretAnswer,
            fullName, age, email, phone, location, profession,
            timeAvailablePerWeek, experienceLevel, skills
        } = req.body;

        if (!username || !password)
            return res.status(400).json({ message: 'Username and password are required' });
        if (password.length < 6)
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        if (await User.findOne({ username: username.toLowerCase() }))
            return res.status(400).json({ message: 'Username already taken' });
        if (email && await User.findOne({ email: email.toLowerCase() }))
            return res.status(400).json({ message: 'Email already registered' });

        const user = await User.create({
            username,
            password,
            secretQuestion:       secretQuestion       || null,
            secretAnswer:         secretAnswer         || null,
            fullName:             fullName             || null,
            age:                  age                  || null,
            email:                email                || null,
            phone:                phone                || null,
            location:             location             || null,
            profession:           profession           || null,
            timeAvailablePerWeek: timeAvailablePerWeek || null,
            experienceLevel:      experienceLevel      || null,
            skills:               skills               || null,
        });

        const token = generateToken(user._id, 'user');
        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id:       user._id,
                username: user.username,
                fullName: user.fullName,
                email:    user.email,
                role:     'user'
            }
        });
    } catch (err) {
        console.error('User signup error:', err);
        res.status(500).json({ message: 'Error creating user', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  USER LOGIN
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/user/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ message: 'Username and password are required' });

        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user || !(await comparePassword(password, user.password)))
            return res.status(401).json({ message: 'Invalid username or password' });

        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user._id, 'user');
        res.json({
            message: 'Login successful',
            token,
            user: {
                id:        user._id,
                username:  user.username,
                fullName:  user.fullName,
                email:     user.email,
                role:      'user',
                lastLogin: user.lastLogin
            }
        });
    } catch (err) {
        console.error('User login error:', err);
        res.status(500).json({ message: 'Error logging in', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  NGO SIGNUP
//  Accepts every field from signup_new.html NGO form (all 5 steps)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/ngo/signup', async (req, res) => {
    try {
        const {
            // Step 1 — Identity
            organizationName, organizationType, registrationNumber, bio,
            // Step 2 — Account & Contact
            username, password, email, phone, pointOfContact,
            // Step 3 — Geographic
            address, latitude, longitude, operatingRadius,
            // Step 4 — Operations
            requiredSkills, volunteerCapacity, resourcesProvided,
            // Step 5 — Legal
            taxExempt, website, instagram
        } = req.body;

        if (!username || !password || !organizationName)
            return res.status(400).json({ message: 'Username, password, and organization name are required' });
        if (password.length < 6)
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        if (await NGO.findOne({ username: username.toLowerCase() }))
            return res.status(400).json({ message: 'NGO username already taken' });
        if (email && await NGO.findOne({ email: email.toLowerCase() }))
            return res.status(400).json({ message: 'Email already registered' });

        const ngo = await NGO.create({
            // Step 1
            organizationName,
            organizationType:   organizationType   || null,
            registrationNumber: registrationNumber || null,
            bio:                bio                || null,
            // Step 2
            username,
            password,
            email:              email              || null,
            phone:              phone              || null,
            pointOfContact:     pointOfContact     || null,
            // Step 3
            address:            address            || null,
            latitude:           latitude           || null,
            longitude:          longitude          || null,
            operatingRadius:    operatingRadius    || 25,
            // Step 4
            requiredSkills:     requiredSkills     || null,
            volunteerCapacity:  volunteerCapacity  || 20,
            resourcesProvided:  resourcesProvided  || null,
            // Step 5
            taxExempt:          taxExempt          || false,
            website:            website            || null,
            instagram:          instagram          || null,
        });

        const token = generateToken(ngo._id, 'ngo');
        res.status(201).json({
            message: 'NGO registered successfully',
            token,
            user: {
                id:               ngo._id,
                username:         ngo.username,
                organizationName: ngo.organizationName,
                email:            ngo.email,
                role:             'ngo'
            }
        });
    } catch (err) {
        console.error('NGO signup error:', err);
        res.status(500).json({ message: 'Error creating NGO', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  NGO LOGIN
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/ngo/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ message: 'Username and password are required' });

        const ngo = await NGO.findOne({ username: username.toLowerCase() });
        if (!ngo || !(await comparePassword(password, ngo.password)))
            return res.status(401).json({ message: 'Invalid username or password' });

        ngo.lastLogin = new Date();
        await ngo.save();

        const token = generateToken(ngo._id, 'ngo');
        res.json({
            message: 'Login successful',
            token,
            user: {
                id:               ngo._id,
                username:         ngo.username,
                organizationName: ngo.organizationName,
                email:            ngo.email,
                role:             'ngo',
                lastLogin:        ngo.lastLogin
            }
        });
    } catch (err) {
        console.error('NGO login error:', err);
        res.status(500).json({ message: 'Error logging in', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PROFILE — GET full profile (no password) for both roles
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const Model   = req.userRole === 'ngo' ? NGO : User;
        const account = await Model.findById(req.userId).select('-password');
        if (!account) return res.status(404).json({ message: 'Account not found' });
        res.json({ user: account });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching profile', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PROFILE — PUT update (no password/username/role changes)
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const forbidden = ['password', 'username', 'role', '_id'];
        const update    = Object.fromEntries(
            Object.entries(req.body).filter(([k]) => !forbidden.includes(k))
        );
        const Model   = req.userRole === 'ngo' ? NGO : User;
        const account = await Model.findByIdAndUpdate(
            req.userId, update, { new: true, runValidators: false }
        ).select('-password');
        res.json({ message: 'Profile updated', user: account });
    } catch (err) {
        res.status(500).json({ message: 'Error updating profile', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  CHANGE PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword)
            return res.status(400).json({ message: 'Both passwords are required' });
        if (newPassword.length < 6)
            return res.status(400).json({ message: 'New password must be at least 6 characters' });

        const Model   = req.userRole === 'ngo' ? NGO : User;
        const account = await Model.findById(req.userId);
        if (!(await comparePassword(currentPassword, account.password)))
            return res.status(401).json({ message: 'Current password is incorrect' });

        account.password = newPassword;
        await account.save();
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error changing password', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  LOGOUT
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/logout', authenticateToken, (req, res) =>
    res.json({ message: 'Logout successful' }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`✅  Auth server running on port ${PORT}`);
    console.log(`   User signup:  POST http://localhost:${PORT}/api/auth/user/signup`);
    console.log(`   NGO  signup:  POST http://localhost:${PORT}/api/auth/ngo/signup`);
    console.log(`   NGO  login:   POST http://localhost:${PORT}/api/auth/ngo/login`);
});