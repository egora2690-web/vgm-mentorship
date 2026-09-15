const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ============ РЕГИСТРАЦИЯ ============
app.post('/api/register', async (req, res) => {
    try {
        const { login, name, password, role, direction, avatar } = req.body;

        if (!login || !name || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }

        const existing = db.prepare('SELECT id FROM users WHERE LOWER(login) = LOWER(?)').get(login);
        if (existing) {
            return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const directionJSON = direction ? JSON.stringify(direction) : null;

        const result = db.prepare(
            `INSERT INTO users (login, name, password, role, direction, avatar) 
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(login, name, hashedPassword, role || 'Наставник ВолгГМУ', directionJSON, avatar || null);

        res.json({
            success: true,
            user: {
                id: result.lastInsertRowid,
                login,
                name,
                role: role || 'Наставник ВолгГМУ',
                direction: direction || null,
                avatar: avatar || null
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ ВХОД ============
app.post('/api/login', async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({ error: 'Введите логин и пароль' });
        }

        const user = db.prepare('SELECT * FROM users WHERE LOWER(login) = LOWER(?)').get(login);
        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }

        let direction = null;
        if (user.direction) {
            try { direction = JSON.parse(user.direction); } catch (e) {}
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                login: user.login,
                name: user.name,
                role: user.role,
                direction,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ ОБНОВИТЬ ПРОФИЛЬ ============
app.put('/api/users/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, direction, avatar } = req.body;

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const newName = name || user.name;
        const newRole = role || user.role;
        const newDirection = direction ? JSON.stringify(direction) : user.direction;
        const newAvatar = avatar !== undefined ? avatar : user.avatar;

        db.prepare(
            `UPDATE users SET name = ?, role = ?, direction = ?, avatar = ? WHERE id = ?`
        ).run(newName, newRole, newDirection, newAvatar, id);

        let directionData = null;
        if (newDirection) {
            try { directionData = JSON.parse(newDirection); } catch (e) {}
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                login: user.login,
                name: newName,
                role: newRole,
                direction: directionData,
                avatar: newAvatar
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ ПОЛУЧИТЬ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ ============
app.get('/api/users', (req, res) => {
    try {
        const rows = db.prepare('SELECT id, login, name, role, direction, avatar, created_at FROM users').all();
        const users = rows.map(row => {
            let direction = null;
            if (row.direction) {
                try { direction = JSON.parse(row.direction); } catch (e) {}
            }
            return { ...row, direction };
        });
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ ПОЛУЧИТЬ НАСТАВНИКОВ ============
app.get('/api/mentors', (req, res) => {
    try {
        const { search, level, direction } = req.query;

        let sql = "SELECT id, login, name, role, direction, avatar, created_at FROM users WHERE role LIKE ?";
        const params = ['%Наставник%'];

        if (search) {
            sql += " AND (name LIKE ? OR login LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        const rows = db.prepare(sql).all(...params);

        let users = rows.map(row => {
            let directionData = null;
            if (row.direction) {
                try { directionData = JSON.parse(row.direction); } catch (e) {}
            }
            return { ...row, direction: directionData };
        });

        if (level) {
            users = users.filter(u => u.direction && u.direction.level === level);
        }
        if (direction) {
            users = users.filter(u => u.direction && u.direction.name === direction);
        }

        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ ЗАПУСК ============
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
    console.log(`📁 Файлы отдаются из: ${__dirname}`);
});
