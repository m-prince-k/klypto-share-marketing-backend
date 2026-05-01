const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || '7fas89f789a7f89a798f7as89f7a8s9f';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// ✅ REGISTER
const register = async (req, res) => {
    try {
        if(!req.body || req.body.email =="" || req.body.password =="" || req.body.firstName =="" || req.body.lastName ==""){
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        const { firstName, lastName, email, password, mobile } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const existingUser = await User.findOne({ where: { email: email.toLowerCase(),mobile:mobile } });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'User and mobile with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await User.create({
            firstName:firstName,
            lastName:lastName,
            email: email.toLowerCase(),
            password: hashedPassword,
            mobile:mobile,
            verified: false,
        });

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                token,
                user: {
                    id: user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    mobile: user.mobile,
                    verified: user.verified,
                }
            }
        });
    } catch (error) {
        console.error('[Auth] Register Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

// ✅ LOGIN
const login = async (req, res) => {
    try {

        if(!req.body || req.body.email =="" || req.body.password ==""){
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const user = await User.findOne({ where: { email: email.toLowerCase() } });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    mobile: user.mobile,
                    verified: user.verified,
                    rule: user.rule,
                }
            }
        });
    } catch (error) {
        console.error('[Auth] Login Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

// ✅ GET PROFILE (me)
const getProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password', 'otp'] }
        });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        res.json({ success: true, data: user });
    } catch (error) {
        console.error('[Auth] GetProfile Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

module.exports = { register, login, getProfile };
