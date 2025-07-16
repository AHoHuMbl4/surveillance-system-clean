/**
 * Простой HTTP сервер для Electron приложения
 * CommonJS совместимый
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class SimpleRTSPServer {
    constructor() {
        this.port = 3000;
        this.users = [
            { login: 'admin', password: 'admin123', role: 'admin' },
            { login: 'operator', password: 'operator123', role: 'operator' }
        ];
        this.cameras = [
            {
                id: 1,
                camera_name: 'Тестовая камера 1',
                apartment_name: 'Демо квартира',
                rtsp_link: 'rtsp://185.70.184.101:8554/cam91-99'
            },
            {
                id: 2,
                camera_name: 'Тестовая камера 2',
                apartment_name: 'Демо квартира',
                rtsp_link: 'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4'
            }
        ];
        this.apartments = [
            { id: 1, apartment_name: 'Демо квартира', apartment_number: 'TEST-1' }
        ];
        
        console.log('🎥 Simple RTSP Server инициализирован');
    }

    /**
     * Создание HTTP сервера
     */
    createServer() {
        const server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });
        
        return server;
    }

    /**
     * Обработка HTTP запросов
     */
    handleRequest(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;
        
        // CORS заголовки
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        console.log(`📊 ${req.method} ${pathname}`);

        // Маршруты API
        if (pathname.startsWith('/api/')) {
            this.handleAPI(req, res, pathname);
        } else if (pathname === '/' || pathname === '/index.html') {
            this.serveIndexHTML(res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }

    /**
     * Обработка API запросов
     */
    handleAPI(req, res, pathname) {
        res.setHeader('Content-Type', 'application/json');
        
        try {
            switch (pathname) {
                case '/api/cameras':
                    res.writeHead(200);
                    res.end(JSON.stringify(this.cameras));
                    break;
                    
                case '/api/apartments':
                    res.writeHead(200);
                    res.end(JSON.stringify(this.apartments));
                    break;
                    
                case '/api/login':
                    if (req.method === 'POST') {
                        this.handleLogin(req, res);
                    } else {
                        res.writeHead(405);
                        res.end(JSON.stringify({ error: 'Method not allowed' }));
                    }
                    break;
                    
                case '/api/system-status':
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        status: 'running',
                        version: '1.0.0',
                        cameras_count: this.cameras.length,
                        apartments_count: this.apartments.length,
                        uptime: process.uptime()
                    }));
                    break;
                    
                default:
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'API endpoint not found' }));
            }
        } catch (error) {
            console.error('❌ API Error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    /**
     * Обработка логина
     */
    handleLogin(req, res) {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const { login, password } = JSON.parse(body);
                const user = this.users.find(u => u.login === login && u.password === password);
                
                if (user) {
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        success: true,
                        user: { login: user.login, role: user.role }
                    }));
                } else {
                    res.writeHead(401);
                    res.end(JSON.stringify({
                        success: false,
                        error: 'Invalid credentials'
                    }));
                }
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    }

    /**
     * Отдача главной HTML страницы
     */
    serveIndexHTML(res) {
        const indexPath = path.join(__dirname, 'index.html');
        
        if (fs.existsSync(indexPath)) {
            const content = fs.readFileSync(indexPath, 'utf8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(200);
            res.end(content);
        } else {
            // Fallback HTML если файл не найден
            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>RTSP Monitor - Electron</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
        .status { background: #27ae60; color: white; padding: 20px; border-radius: 10px; }
        .info { margin: 20px 0; padding: 20px; background: #ecf0f1; border-radius: 10px; }
    </style>
</head>
<body>
    <h1>🎥 RTSP Monitor</h1>
    <div class="status">✅ Electron приложение запущено успешно!</div>
    
    <div class="info">
        <h3>📊 Статус системы</h3>
        <p><strong>Сервер:</strong> Работает на порту ${this.port}</p>
        <p><strong>Камер:</strong> ${this.cameras.length}</p>
        <p><strong>Квартир:</strong> ${this.apartments.length}</p>
        <p><strong>Время:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="info">
        <h3>🔐 Тестовые учетные записи</h3>
        <p><strong>Администратор:</strong> admin / admin123</p>
        <p><strong>Оператор:</strong> operator / operator123</p>
    </div>

    <script>
        console.log('🚀 RTSP Monitor Electron интерфейс загружен');
        
        // Тест API
        fetch('/api/system-status')
            .then(response => response.json())
            .then(data => {
                console.log('✅ API тест успешен:', data);
                document.title = 'RTSP Monitor - ' + data.status;
            })
            .catch(error => {
                console.error('❌ API тест неудачен:', error);
            });
    </script>
</body>
</html>`;
            
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(200);
            res.end(html);
        }
    }

    /**
     * Запуск сервера
     */
    start(port = 3000) {
        this.port = port;
        const server = this.createServer();
        
        server.listen(port, 'localhost', () => {
            console.log(`🌐 Simple RTSP Server запущен на http://localhost:${port}`);
            console.log(`🔐 Тестовые логины: admin/admin123, operator/operator123`);
            console.log(`✅ Готов к работе в Electron приложении`);
        });

        server.on('error', (error) => {
            console.error('❌ Ошибка сервера:', error);
        });

        return server;
    }
}

// Запуск сервера
if (require.main === module) {
    const server = new SimpleRTSPServer();
    server.start(3000);
}

module.exports = SimpleRTSPServer;
