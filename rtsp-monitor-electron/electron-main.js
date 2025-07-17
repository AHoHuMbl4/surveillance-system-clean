const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
    console.log('🎥 Создание главного окна RTSP Monitor');
    
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        minWidth: 1280,
        minHeight: 720,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            cache: false  // ОТКЛЮЧАЕМ КЕШИРОВАНИЕ
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        title: 'RTSP Monitor - Система видеонаблюдения',
        show: false,
        frame: true,
        titleBarStyle: 'default'
    });

    // ПРИНУДИТЕЛЬНАЯ ОЧИСТКА КЕША
    mainWindow.webContents.session.clearCache().then(() => {
        console.log('✅ Кеш очищен');
        
        // ЗАГРУЖАЕМ СТРАНИЦУ С ОТКЛЮЧЕННЫМ КЕШЕМ
        mainWindow.loadURL('http://localhost:3000', {
            extraHeaders: 'Cache-Control: no-cache, no-store, must-revalidate\nPragma: no-cache\nExpires: 0'
        });
    });

    // Скрываем меню в production
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
        Menu.setApplicationMenu(null);
    }

    // Показываем окно когда готово
    mainWindow.once('ready-to-show', () => {
        console.log('✅ Главное окно готово к показу');
        mainWindow.show();
        
        // В режиме разработки открываем DevTools
        if (process.env.NODE_ENV === 'development') {
            mainWindow.webContents.openDevTools();
        }
    });

    // Обработка закрытия окна
    mainWindow.on('closed', () => {
        console.log('🔌 Главное окно закрыто');
        mainWindow = null;
    });

    // ПРИНУДИТЕЛЬНАЯ ПЕРЕЗАГРУЗКА ПРИ ОШИБКАХ
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('❌ Ошибка загрузки интерфейса:', errorCode, errorDescription);
        
        if (errorCode === -102) { // CONNECTION_REFUSED
            console.log('🔄 Ожидание запуска сервера...');
            setTimeout(() => {
                // ОЧИЩАЕМ КЕШИРОВАНИЕ И ПЕРЕЗАГРУЖАЕМ
                mainWindow.webContents.session.clearCache().then(() => {
                    mainWindow.webContents.reloadIgnoringCache();
                });
            }, 2000);
        }
    });

    console.log('🎯 Главное окно создано');
}

function startServer() {
    console.log('🌐 Запуск встроенного RTSP сервера...');
    
    const serverScript = path.join(__dirname, 'rtsp-server.js');
    
    if (!require('fs').existsSync(serverScript)) {
        console.error('❌ Файл rtsp-server.js не найден');
        return;
    }

    serverProcess = spawn('node', [serverScript], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            console.log('🌐 [Server]:', output);
        }
    });

    serverProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            console.error('🌐 [Server Error]:', output);
        }
    });

    serverProcess.on('close', (code) => {
        console.log(`🌐 Сервер завершен с кодом: ${code}`);
        serverProcess = null;
    });

    serverProcess.on('error', (error) => {
        console.error('❌ Ошибка запуска сервера:', error);
    });

    console.log('✅ Сервер запущен');
}

function stopServer() {
    if (serverProcess) {
        console.log('🛑 Остановка встроенного сервера...');
        serverProcess.kill('SIGTERM');
        
        setTimeout(() => {
            if (serverProcess) {
                serverProcess.kill('SIGKILL');
            }
        }, 5000);
    }
}

// События приложения
app.whenReady().then(() => {
    console.log('🚀 Electron приложение готово');
    
    // Запускаем сервер
    startServer();
    
    // Даем время серверу запуститься, затем создаем окно
    setTimeout(() => {
        createWindow();
    }, 2000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    console.log('🔌 Все окна закрыты');
    stopServer();
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', (event) => {
    console.log('🛑 Завершение приложения...');
    stopServer();
});

// Горячие клавиши для разработки
app.whenReady().then(() => {
    const { globalShortcut } = require('electron');
    
    // F5 - перезагрузка с очисткой кеша
    globalShortcut.register('F5', () => {
        if (mainWindow) {
            console.log('🔄 F5: Принудительная перезагрузка с очисткой кеша');
            mainWindow.webContents.session.clearCache().then(() => {
                mainWindow.webContents.reloadIgnoringCache();
            });
        }
    });
    
    // Ctrl+R - перезагрузка с очисткой кеша
    globalShortcut.register('CommandOrControl+R', () => {
        if (mainWindow) {
            console.log('🔄 Ctrl+R: Принудительная перезагрузка с очисткой кеша');
            mainWindow.webContents.session.clearCache().then(() => {
                mainWindow.webContents.reloadIgnoringCache();
            });
        }
    });
});

process.on('uncaughtException', (error) => {
    console.error('💥 Необработанная ошибка:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Необработанное отклонение промиса:', reason);
});

console.log('🎥 RTSP Monitor Electron - С принудительной очисткой кеша');
