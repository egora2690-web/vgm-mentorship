const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000

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

        db.get('SELECT id FROM users WHERE LOWER(login) = LOWER(?)', [login], async (err, existing) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            if (existing) {
                return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const directionJSON = direction ? JSON.stringify(direction) : null;

            db.run(
                `INSERT INTO users (login, name, password, role, direction, avatar) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [login, name, hashedPassword, role || 'Наставник ВолгГМУ', directionJSON, avatar || null],
                function (err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Ошибка при создании пользователя' });
                    }

                    res.json({
                        success: true,
                        user: {
                            id: this.lastID,
                            login,
                            name,
                            role: role || 'Наставник ВолгГМУ',
                            direction: direction || null,
                            avatar: avatar || null
                        }
                    });
                }
            );
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ ВХОД ============
app.post('/api/login', (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({ error: 'Введите логин и пароль' });
        }

        db.get('SELECT * FROM users WHERE LOWER(login) = LOWER(?)', [login], async (err, user) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
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

        const updates = [];
        const values = [];

        if (name) { updates.push('name = ?'); values.push(name); }
        if (role) { updates.push('role = ?'); values.push(role); }
        if (direction) { updates.push('direction = ?'); values.push(JSON.stringify(direction)); }
        if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нечего обновлять' });
        }

        values.push(id);

        db.run(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            values,
            function (err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Ошибка обновления' });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Пользователь не найден' });
                }

                db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
                    if (err || !user) {
                        return res.status(500).json({ error: 'Ошибка' });
                    }
                    let directionData = null;
                    if (user.direction) {
                        try { directionData = JSON.parse(user.direction); } catch (e) {}
                    }
                    res.json({
                        success: true,
                        user: {
                            id: user.id,
                            login: user.login,
                            name: user.name,
                            role: user.role,
                            direction: directionData,
                            avatar: user.avatar
                        }
                    });
                });
            }
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ ПОЛУЧИТЬ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ ============
app.get('/api/users', (req, res) => {
    db.all('SELECT id, login, name, role, direction, avatar, created_at FROM users', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }

        const users = rows.map(row => {
            let direction = null;
            if (row.direction) {
                try { direction = JSON.parse(row.direction); } catch (e) {}
            }
            return { ...row, direction };
        });

        res.json(users);
    });
});

// ============ ПОЛУЧИТЬ НАСТАВНИКОВ (С ФИЛЬТРАМИ) ============
app.get('/api/mentors', (req, res) => {
    const { search, level, direction, role } = req.query;

    let sql = "SELECT id, login, name, role, direction, avatar, created_at FROM users WHERE role LIKE ?";
    const params = ['%Наставник%'];

    if (search) {
        sql += " AND (name LIKE ? OR login LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }

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
    });
});

// ============ ЗАПУСК ============
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
    console.log(`📁 Файлы отдаются из: ${__dirname}`);
});
