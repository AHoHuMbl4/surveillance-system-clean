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
    
    const serverPath = path.join(__dirname, 'rtsp-server.js');
    
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
