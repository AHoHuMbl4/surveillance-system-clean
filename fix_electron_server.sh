#!/bin/bash

# Исправление проблемы с запуском сервера в Electron
# Проблема: ES модули vs CommonJS

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

echo "🔧 Исправление RTSP Monitor Electron"
echo "===================================="

cd rtsp-monitor-electron

# 1. Создание простого CommonJS сервера
create_simple_server() {
    log_info "Создание простого сервера..."
    
    cat > simple-server.js << 'EOF'
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
EOF
    log_info "simple-server.js создан"
}

# 2. Обновление Electron main.js
update_electron_main() {
    log_info "Обновление electron-main.js..."
    
    cat > electron-main.js << 'EOF'
const { app, BrowserWindow, Menu, Tray } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;
let serverProcess;
let tray;

function createWindow() {
    console.log('🚀 Создание главного окна...');
    
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        },
        title: 'RTSP Monitor - Система видеонаблюдения',
        show: false
    });

    // Запуск сервера
    startServer();

    // Загрузка интерфейса через 3 секунды
    setTimeout(() => {
        console.log('🌐 Загрузка http://localhost:3000');
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.show();
    }, 3000);

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('✅ Веб-интерфейс загружен успешно');
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('❌ Ошибка загрузки:', errorDescription);
        
        // Показываем ошибку в окне
        const errorHtml = `
        <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #e74c3c;">⚠️ Ошибка подключения</h1>
            <p>Не удается подключиться к серверу</p>
            <p><strong>Ошибка:</strong> ${errorDescription}</p>
            <button onclick="location.reload()" style="padding: 10px 20px; font-size: 16px;">Попробовать снова</button>
        </body>
        </html>`;
        
        mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml));
    });
}

function startServer() {
    console.log('🚀 Запуск встроенного сервера...');
    
    const serverPath = path.join(__dirname, 'simple-server.js');
    
    serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            NODE_ENV: 'production'
        }
    });

    serverProcess.stdout.on('data', (data) => {
        console.log('📊 Server:', data.toString().trim());
    });

    serverProcess.stderr.on('data', (data) => {
        console.error('❌ Server Error:', data.toString().trim());
    });

    serverProcess.on('close', (code) => {
        console.log(`🛑 Сервер завершился с кодом ${code}`);
    });

    serverProcess.on('error', (error) => {
        console.error('💥 Ошибка запуска сервера:', error);
    });
}

function createTray() {
    // Создаем простой трей без иконки
    try {
        const Menu = require('electron').Menu;
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Показать RTSP Monitor',
                click: () => {
                    mainWindow.show();
                }
            },
            {
                label: 'Выход',
                click: () => {
                    app.isQuiting = true;
                    if (serverProcess) {
                        serverProcess.kill();
                    }
                    app.quit();
                }
            }
        ]);

        // Устанавливаем меню приложения вместо трея (для совместимости)
        Menu.setApplicationMenu(contextMenu);
        console.log('📋 Меню приложения создано');
        
    } catch (error) {
        console.warn('⚠️ Не удалось создать трей:', error.message);
    }
}

app.whenReady().then(() => {
    console.log('⚡ Electron готов');
    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    // Не закрываем приложение полностью
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    app.isQuiting = true;
    if (serverProcess) {
        serverProcess.kill();
    }
});

console.log('🚀 RTSP Monitor Electron Main загружен');
EOF
    log_info "electron-main.js обновлен"
}

# 3. Исправление package.json
fix_package_json() {
    log_info "Исправление package.json..."
    
    # Обновляем main файл
    cat > package.json << 'EOF'
{
  "name": "rtsp-monitor-electron",
  "version": "1.0.0",
  "description": "Автономная система видеонаблюдения",
  "main": "electron-main.js",
  "scripts": {
    "start": "electron .",
    "dev": "NODE_ENV=development electron .",
    "test-server": "node simple-server.js",
    "build": "./node_modules/.bin/electron-builder",
    "build:win": "./node_modules/.bin/electron-builder --win",
    "build:linux": "./node_modules/.bin/electron-builder --linux",
    "clean": "rimraf dist build installers node_modules/.cache"
  },
  "devDependencies": {
    "electron": "^27.1.3",
    "electron-builder": "^24.8.1",
    "rimraf": "^5.0.5"
  },
  "build": {
    "appId": "com.rtspmonitor.app",
    "productName": "RTSP Monitor",
    "directories": {
      "output": "installers"
    },
    "files": [
      "electron-main.js",
      "simple-server.js",
      "autonomous-server.js",
      "autonomous-rtsp-manager.js",
      "index.html",
      "ffmpeg/**/*"
    ],
    "win": {
      "target": [
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ],
      "artifactName": "${productName}-${version}-Windows-Portable.${ext}"
    },
    "linux": {
      "target": [
        {
          "target": "AppImage",
          "arch": ["x64"]
        }
      ],
      "artifactName": "${productName}-${version}-Linux.${ext}"
    }
  }
}
EOF
    log_info "package.json исправлен"
}

# 4. Тестирование исправлений
test_fixes() {
    log_info "Тестирование исправлений..."
    
    # Тест простого сервера
    log_info "Тестирование simple-server.js..."
    if node -c simple-server.js; then
        log_info "✅ simple-server.js синтаксически корректен"
    else
        log_error "❌ Ошибка в simple-server.js"
        return 1
    fi
    
    # Тест electron-main.js
    log_info "Тестирование electron-main.js..."
    if node -c electron-main.js; then
        log_info "✅ electron-main.js синтаксически корректен"
    else
        log_error "❌ Ошибка в electron-main.js"
        return 1
    fi
    
    log_info "Все тесты пройдены"
}

# Основная функция
main() {
    create_simple_server
    update_electron_main
    fix_package_json
    test_fixes
    
    echo ""
    log_info "🎉 Исправления применены!"
    echo ""
    echo "📋 Следующие шаги:"
    echo "  1. Тест сервера: npm run test-server"
    echo "  2. Запуск Electron: npm start"
    echo "  3. Сборка Windows: npm run build:win"
    echo ""
    echo "🔧 Что исправлено:"
    echo "  ✅ Создан CommonJS совместимый сервер"
    echo "  ✅ Исправлен Electron main процесс"
    echo "  ✅ Убраны ES модули зависимости"
    echo "  ✅ Добавлена обработка ошибок"
}

# Запуск исправлений
main
