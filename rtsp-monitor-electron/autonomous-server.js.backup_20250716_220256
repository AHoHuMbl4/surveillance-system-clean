/**
 * Autonomous Surveillance Server - Полностью автономная система видеонаблюдения
 * Работает без внешних зависимостей + встроенный FFmpeg для RTSP потоков
 * Поддерживает 250 IP-камер с H.264 кодировкой
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { URL, fileURLToPath } from 'url';
import EmbeddedFFmpegManager from './autonomous-rtsp-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AutonomousServer {
    constructor() {
        this.server = http.createServer();
        this.sessions = new Map();
        this.currentConfig = null;
        this.configPath = path.join(__dirname, 'config.json');
        
        // Инициализация встроенного FFmpeg менеджера
        this.rtspManager = new EmbeddedFFmpegManager();
        
        // Системная информация
        this.systemInfo = {
            name: 'Autonomous Surveillance System',
            version: '2.0.0-embedded-ffmpeg',
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            autonomous: true,
            features: {
                realRTSP: true,
                embeddedFFmpeg: true,
                h264Support: true,
                mjpegOutput: true,
                multiPlatform: true,
                noDependencies: true
            }
        };

        // Настройка обработчика запросов
        this.server.on('request', (req, res) => {
            this.handleRequest(req, res);
        });

        console.log('🎥 Autonomous Surveillance Server with Embedded FFmpeg');
    }

    /**
     * Инициализация системы
     */
    async initialize() {
        console.log('🔧 Инициализация автономной системы...');
        
        // Проверяем встроенный FFmpeg
        const ffmpegStatus = await this.rtspManager.checkFFmpegAvailability();
        console.log('🎬 Статус FFmpeg:', ffmpegStatus.available ? '✅ Готов' : '❌ Не найден');
        
        if (!ffmpegStatus.available) {
            console.warn('⚠️ FFmpeg не найден, RTSP потоки будут недоступны');
            console.warn('📁 Создайте структуру: ffmpeg/[platform]/ffmpeg[.exe]');
            console.warn('📖 См. инструкцию по настройке FFmpeg');
        }

        // Загружаем или создаем конфигурацию
        await this.loadOrCreateConfig();
        
        console.log('✅ Автономная система инициализирована');
    }

    /**
     * Загрузка или создание конфигурации
     */
    async loadOrCreateConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                this.currentConfig = JSON.parse(configData);
                console.log('📋 Конфигурация загружена из файла');
            } else {
                console.log('📋 Создание новой конфигурации...');
                this.currentConfig = this.createDefaultConfig();
                this.saveConfig();
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки конфигурации:', error);
            this.currentConfig = this.createDefaultConfig();
        }
    }

    /**
     * Создание дефолтной конфигурации
     */
    createDefaultConfig() {
        return {
            system: {
                autonomous: true,
                platform: process.platform,
                arch: process.arch,
                embeddedFFmpeg: true
            },
            users: [
                {
                    login: 'admin',
                    password_hash: this.hashPassword('admin123'),
                    role: 'admin'
                },
                {
                    login: 'operator',
                    password_hash: this.hashPassword('operator123'),
                    role: 'operator'
                }
            ],
            apartments: [
                { id: 1, apartment_name: "Квартира на Пушкина", apartment_number: "12А" },
                { id: 2, apartment_name: "Офис центральный", apartment_number: "ОФ-1" },
                { id: 3, apartment_name: "Склад №1", apartment_number: "СК-1" }
            ],
            cameras: [
                { id: 1, camera_name: "Прихожая", apartment_id: 1, apartment_name: "Квартира на Пушкина", rtsp_link: "demo://camera1", status: "online" },
                { id: 2, camera_name: "Кухня", apartment_id: 1, apartment_name: "Квартира на Пушкина", rtsp_link: "demo://camera2", status: "online" },
                { id: 3, camera_name: "Гостиная", apartment_id: 1, apartment_name: "Квартира на Пушкина", rtsp_link: "demo://camera3", status: "offline" },
                { id: 4, camera_name: "Спальня", apartment_id: 1, apartment_name: "Квартира на Пушкина", rtsp_link: "demo://camera4", status: "online" }
            ],
            settings: {
                rotation_interval: 15,
                connection_timeout: 10,
                max_retry_attempts: 5,
                grid_size: 16,
                ffmpeg_enabled: true
            }
        };
    }

    /**
     * Сохранение конфигурации
     */
    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.currentConfig, null, 2));
            console.log('💾 Конфигурация сохранена');
        } catch (error) {
            console.error('❌ Ошибка сохранения конфигурации:', error);
        }
    }

    /**
     * Хеширование пароля
     */
    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    /**
     * Проверка пароля
     */
    verifyPassword(password, hash) {
        const passwordHash = this.hashPassword(password);
        return passwordHash === hash;
    }

    /**
     * Генерация токена сессии
     */
    generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Получение прав пользователя
     */
    getUserPermissions(role) {
        return {
            viewCameras: true,
            manageStreams: true,
            manageAudio: true,
            adminPanel: role === 'admin',
            editCameras: role === 'admin',
            editApartments: role === 'admin',
            editSettings: role === 'admin'
        };
    }

    /**
     * Главный обработчик HTTP запросов
     */
    async handleRequest(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;
        const method = req.method;

        // CORS заголовки
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        console.log(`📡 ${method} ${pathname}`);

        try {
            // API эндпоинты
            if (pathname.startsWith('/api/')) {
                await this.handleAPIRequest(req, res, pathname, method);
            }
            // Потоки видео
            else if (pathname.startsWith('/stream/')) {
                await this.handleStreamRequest(req, res, pathname);
            }
            // Статические файлы
            else {
                await this.serveStaticFile(req, res, pathname);
            }
        } catch (error) {
            console.error('❌ Ошибка обработки запроса:', error);
            this.sendError(res, 500, 'Internal Server Error');
        }
    }

    /**
     * Обработка API запросов
     */
    async handleAPIRequest(req, res, pathname, method) {
        let body = '';
        if (method === 'POST' || method === 'PUT') {
            body = await this.getRequestBody(req);
        }

        switch (pathname) {
            case '/api/login':
                if (method === 'POST') {
                    await this.handleLogin(res, JSON.parse(body));
                }
                break;

            case '/api/apartments':
                if (method === 'GET') {
                    await this.handleGetApartments(res);
                } else if (method === 'POST') {
                    await this.handleAddApartment(res, JSON.parse(body));
                } else if (method === 'PUT') {
                    await this.handleUpdateApartment(res, JSON.parse(body));
                } else if (method === 'DELETE') {
                    await this.handleDeleteApartment(res, JSON.parse(body));
                }
                break;

            case '/api/cameras':
                if (method === 'GET') {
                    await this.handleGetCameras(res);
                } else if (method === 'POST') {
                    await this.handleAddCamera(res, JSON.parse(body));
                } else if (method === 'PUT') {
                    await this.handleUpdateCamera(res, JSON.parse(body));
                } else if (method === 'DELETE') {
                    await this.handleDeleteCamera(res, JSON.parse(body));
                }
                break;

            case '/api/camera/test':
                if (method === 'POST') {
                    await this.handleTestCamera(res, JSON.parse(body));
                }
                break;

            case '/api/ffmpeg/status':
                if (method === 'GET') {
                    await this.handleFFmpegStatus(res);
                }
                break;

            case '/api/stream/start':
                if (method === 'POST') {
                    await this.handleStreamStart(res, JSON.parse(body));
                }
                break;

            case '/api/stream/stop':
                if (method === 'POST') {
                    await this.handleStreamStop(res, JSON.parse(body));
                }
                break;

            case '/api/streams/status':
                if (method === 'GET') {
                    await this.handleStreamsStatus(res);
                }
                break;

            case '/api/audio/toggle':
                if (method === 'POST') {
                    await this.handleAudioToggle(res, JSON.parse(body));
                }
                break;

            case '/api/settings':
                if (method === 'GET') {
                    await this.handleGetSettings(res);
                } else if (method === 'PUT') {
                    await this.handleUpdateSettings(res, JSON.parse(body));
                }
                break;

            default:
                this.send404(res);
        }
    }

    /**
     * Получение тела POST запроса
     */
    async getRequestBody(req) {
        return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => resolve(body));
        });
    }

    /**
     * Обработка входа в систему
     */
    async handleLogin(res, data) {
        try {
            const { login, password } = data;
            
            console.log(`🔐 Попытка входа: ${login}`);
            
            if (!login || !password) {
                return this.sendError(res, 400, 'Логин и пароль обязательны');
            }

            const user = this.currentConfig.users.find(u => u.login === login);
            if (!user) {
                console.log(`❌ Пользователь не найден: ${login}`);
                return this.sendError(res, 401, 'Неверный логин или пароль');
            }

            const isValidPassword = this.verifyPassword(password, user.password_hash);
            if (!isValidPassword) {
                console.log(`❌ Неверный пароль для: ${login}`);
                return this.sendError(res, 401, 'Неверный логин или пароль');
            }

            console.log(`✅ Успешная аутентификация: ${login}`);

            const sessionToken = this.generateSessionToken();
            this.sessions.set(sessionToken, {
                user: user,
                loginTime: Date.now(),
                permissions: this.getUserPermissions(user.role)
            });

            this.sendJSON(res, {
                success: true,
                token: sessionToken,
                user: {
                    login: user.login,
                    role: user.role
                }
            });

        } catch (error) {
            console.error('❌ Ошибка входа:', error);
            this.sendError(res, 500, 'Ошибка сервера');
        }
    }

    /**
     * Получение списка квартир
     */
    async handleGetApartments(res) {
        this.sendJSON(res, {
            success: true,
            apartments: this.currentConfig.apartments
        });
    }

    /**
     * Добавление квартиры
     */
    async handleAddApartment(res, data) {
        try {
            const { apartment_name, apartment_number } = data;
            
            if (!apartment_name || !apartment_number) {
                return this.sendError(res, 400, 'Название и номер квартиры обязательны');
            }

            const newId = Math.max(...this.currentConfig.apartments.map(a => a.id), 0) + 1;
            
            const newApartment = {
                id: newId,
                apartment_name,
                apartment_number
            };

            this.currentConfig.apartments.push(newApartment);
            this.saveConfig();

            console.log(`✅ Добавлена квартира: ${apartment_name}`);

            this.sendJSON(res, {
                success: true,
                apartment: newApartment
            });

        } catch (error) {
            console.error('❌ Ошибка добавления квартиры:', error);
            this.sendError(res, 500, 'Ошибка сервера');
        }
    }

    /**
     * Получение списка камер
     */
    async handleGetCameras(res) {
        this.sendJSON(res, {
            success: true,
            cameras: this.currentConfig.cameras
        });
    }

    /**
     * Добавление камеры
     */
    async handleAddCamera(res, data) {
        try {
            const { camera_name, apartment_name, rtsp_link } = data;
            
            if (!camera_name || !apartment_name || !rtsp_link) {
                return this.sendError(res, 400, 'Все поля обязательны');
            }

            const apartment = this.currentConfig.apartments.find(a => a.apartment_name === apartment_name);
            if (!apartment) {
                return this.sendError(res, 400, 'Квартира не найдена');
            }

            const newId = Math.max(...this.currentConfig.cameras.map(c => c.id), 0) + 1;
            
            const newCamera = {
                id: newId,
                camera_name,
                apartment_id: apartment.id,
                apartment_name,
                rtsp_link,
                status: 'offline'
            };

            this.currentConfig.cameras.push(newCamera);
            this.saveConfig();

            console.log(`✅ Добавлена камера: ${camera_name}`);

            this.sendJSON(res, {
                success: true,
                camera: newCamera
            });

        } catch (error) {
            console.error('❌ Ошибка добавления камеры:', error);
            this.sendError(res, 500, 'Ошибка сервера');
        }
    }

    /**
     * Тестирование RTSP камеры
     */
    async handleTestCamera(res, data) {
        try {
            const { rtspUrl } = data;
            
            if (!rtspUrl) {
                return this.sendError(res, 400, 'RTSP URL обязателен');
            }

            console.log(`🔍 Тестирование камеры: ${rtspUrl}`);

            // Проверяем FFmpeg
            const ffmpegStatus = await this.rtspManager.checkFFmpegAvailability();
            if (!ffmpegStatus.available) {
                return this.sendJSON(res, {
                    success: false,
                    error: 'FFmpeg not available',
                    details: 'Встроенный FFmpeg не найден. Проверьте структуру папок.'
                });
            }

            // Тестируем RTSP подключение
            const testResult = await this.rtspManager.testRTSPConnection(rtspUrl, 10000);

            this.sendJSON(res, testResult);

        } catch (error) {
            console.error('❌ Ошибка тестирования камеры:', error);
            this.sendJSON(res, {
                success: false,
                error: 'Test failed',
                details: error.message
            });
        }
    }

    /**
     * Статус FFmpeg
     */
    async handleFFmpegStatus(res) {
        try {
            const status = await this.rtspManager.checkFFmpegAvailability();
            this.sendJSON(res, status);
        } catch (error) {
            console.error('❌ Ошибка проверки FFmpeg:', error);
            this.sendError(res, 500, 'Ошибка проверки FFmpeg');
        }
    }

    /**
     * Запуск видеопотока
     */
    async handleStreamStart(res, data) {
        try {
            const { camera, quality = 'low' } = data;
            
            if (!camera || !camera.rtsp_link) {
                return this.sendError(res, 400, 'Некорректные данные камеры');
            }

            console.log(`🚀 Запуск потока: ${camera.camera_name} (${quality})`);

            const result = await this.rtspManager.startStream(camera, quality);
            this.sendJSON(res, result);

        } catch (error) {
            console.error('❌ Ошибка запуска потока:', error);
            this.sendError(res, 500, 'Ошибка запуска потока');
        }
    }

    /**
     * Остановка видеопотока
     */
    async handleStreamStop(res, data) {
        try {
            const { streamId } = data;
            
            if (!streamId) {
                return this.sendError(res, 400, 'ID потока обязателен');
            }

            console.log(`🛑 Остановка потока: ${streamId}`);

            const result = await this.rtspManager.stopStream(streamId);
            this.sendJSON(res, { success: result });

        } catch (error) {
            console.error('❌ Ошибка остановки потока:', error);
            this.sendError(res, 500, 'Ошибка остановки потока');
        }
    }

    /**
     * Статус всех потоков
     */
    async handleStreamsStatus(res) {
        try {
            const status = this.rtspManager.getStreamsStatus();
            this.sendJSON(res, status);
        } catch (error) {
            console.error('❌ Ошибка получения статуса потоков:', error);
            this.sendError(res, 500, 'Ошибка получения статуса');
        }
    }

    /**
     * Переключение аудио
     */
    async handleAudioToggle(res, data) {
        try {
            const { cameraId } = data;
            
            // Простая логика переключения аудио
            console.log(`🔊 Переключение аудио камеры: ${cameraId}`);
            
            this.sendJSON(res, {
                success: true,
                activeAudioCamera: cameraId,
                message: 'Аудио переключено'
            });

        } catch (error) {
            console.error('❌ Ошибка переключения аудио:', error);
            this.sendError(res, 500, 'Ошибка переключения аудио');
        }
    }

    /**
     * Получение настроек
     */
    async handleGetSettings(res) {
        this.sendJSON(res, {
            success: true,
            settings: this.currentConfig.settings
        });
    }

    /**
     * Обновление настроек
     */
    async handleUpdateSettings(res, data) {
        try {
            this.currentConfig.settings = { ...this.currentConfig.settings, ...data };
            this.saveConfig();

            console.log(`✅ Настройки обновлены`);

            this.sendJSON(res, {
                success: true,
                settings: this.currentConfig.settings
            });

        } catch (error) {
            console.error('❌ Ошибка обновления настроек:', error);
            this.sendError(res, 500, 'Ошибка сервера');
        }
    }

    /**
     * Обработка видеопотоков
     */
    async handleStreamRequest(req, res, pathname) {
        try {
            // Проксирование к RTSP менеджеру
            const streamPath = pathname.replace('/stream/', '');
            
            // Простое перенаправление к прокси потокам RTSP менеджера
            res.writeHead(302, {
                'Location': `http://localhost:8080/${streamPath}`
            });
            res.end();

        } catch (error) {
            console.error('❌ Ошибка обработки потока:', error);
            this.send404(res);
        }
    }

    /**
     * Подача статических файлов
     */
    async serveStaticFile(req, res, pathname) {
        try {
            // Определение файла
            let filePath;
            if (pathname === '/') {
                filePath = path.join(__dirname, 'index.html');
            } else {
                filePath = path.join(__dirname, pathname);
            }

            // Проверка существования файла
            if (!fs.existsSync(filePath)) {
                this.send404(res);
                return;
            }

            // Определение MIME типа
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon'
            };

            const contentType = mimeTypes[ext] || 'application/octet-stream';

            // Чтение и отправка файла
            const fileContent = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(fileContent);

        } catch (error) {
            console.error('❌ Ошибка подачи файла:', error);
            this.send404(res);
        }
    }

    /**
     * Отправка JSON ответа
     */
    sendJSON(res, data) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    /**
     * Отправка ошибки
     */
    sendError(res, statusCode, message) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message, autonomous: true }));
    }

    /**
     * Отправка 404
     */
    send404(res) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found - Autonomous Surveillance System');
    }

    /**
     * Запуск сервера
     */
    async start(port = 3000) {
        // Инициализация системы
        await this.initialize();
        
        // Проверка готовности
        const ffmpegStatus = await this.rtspManager.checkFFmpegAvailability();
        
        console.log(`✅ Автономная система готова:`);
        console.log(`📱 Платформа: ${process.platform}-${process.arch}`);
        console.log(`⚡ Node.js: ${process.version}`);
        console.log(`🎬 FFmpeg: ${ffmpegStatus.available ? '✅ Готов' : '❌ Не найден'}`);
        console.log(`🔐 Демо пароли: admin/admin123, operator/operator123`);

        // Запуск HTTP сервера
        this.server.listen(port, () => {
            console.log(`🚀 Сервер запущен на http://localhost:${port}`);
            console.log(`📱 Откройте в браузере для входа в систему`);
            
            if (!ffmpegStatus.available) {
                console.log(`⚠️ Для RTSP потоков установите FFmpeg (см. инструкцию)`);
            }
        });

        // Обработка завершения
        process.on('SIGINT', async () => {
            console.log('\n🛑 Получен сигнал завершения...');
            await this.shutdown();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('\n🛑 Получен сигнал SIGTERM...');
            await this.shutdown();
            process.exit(0);
        });
    }

    /**
     * Корректное завершение работы
     */
    async shutdown() {
        console.log('🧹 Завершение работы системы...');
        
        try {
            // Очистка RTSP менеджера
            await this.rtspManager.cleanup();
            
            // Закрытие HTTP сервера
            this.server.close();
            
            // Очистка сессий
            this.sessions.clear();
            
            console.log('✅ Система корректно завершена');
            
        } catch (error) {
            console.error('❌ Ошибка завершения:', error);
        }
    }
}

// Запуск сервера
const server = new AutonomousServer();
server.start(3000).catch(error => {
    console.error('💥 Критическая ошибка запуска:', error);
    process.exit(1);
});

export default AutonomousServer;
