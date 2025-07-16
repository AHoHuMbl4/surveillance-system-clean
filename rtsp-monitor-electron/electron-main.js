const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

// Функция создания главного окна
function createWindow() {
    console.log('🚀 Создание главного окна Electron...');
    
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: false, // Для локальных HLS потоков
            allowRunningInsecureContent: true
        },
        icon: path.join(__dirname, 'icon.png'),
        title: '🎥 RTSP Monitor - Система видеонаблюдения',
        show: false,
        autoHideMenuBar: true
    });

    // Показываем окно после полной загрузки
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        console.log('✅ Главное окно отображено');
        
        // DevTools для отладки (только в разработке)
        if (process.env.NODE_ENV === 'development') {
            mainWindow.webContents.openDevTools();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopServer();
    });

    return mainWindow;
}

// Запуск Node.js сервера
function startServer() {
    console.log('🌐 Запуск встроенного RTSP сервера...');
    
    try {
        // Запускаем сервер как отдельный процесс
        serverProcess = spawn('node', ['rtsp-server.mjs'], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        serverProcess.stdout.on('data', (data) => {
            console.log(`Server: ${data.toString().trim()}`);
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`Server Error: ${data.toString().trim()}`);
        });

        serverProcess.on('close', (code) => {
            console.log(`🛑 Сервер завершен с кодом: ${code}`);
        });

        serverProcess.on('error', (error) => {
            console.error('❌ Ошибка запуска сервера:', error);
        });

        // Ждем запуска сервера и загружаем интерфейс
        setTimeout(() => {
            const serverUrl = 'http://localhost:3000';
            console.log(`📱 Загрузка интерфейса: ${serverUrl}`);
            
            mainWindow.loadURL(serverUrl).catch(error => {
                console.error('❌ Ошибка загрузки интерфейса:', error);
                
                // Fallback: загружаем локальный index.html
                const fallbackPath = path.join(__dirname, 'index.html');
                console.log(`🔄 Fallback: загрузка ${fallbackPath}`);
                mainWindow.loadFile(fallbackPath);
            });
        }, 3000);

    } catch (error) {
        console.error('❌ Критическая ошибка запуска сервера:', error);
        
        // Fallback: загружаем только статический интерфейс
        const fallbackPath = path.join(__dirname, 'index.html');
        console.log(`🔄 Критический Fallback: загрузка ${fallbackPath}`);
        mainWindow.loadFile(fallbackPath);
    }
}

// Остановка сервера
function stopServer() {
    if (serverProcess) {
        console.log('🛑 Остановка RTSP сервера...');
        serverProcess.kill('SIGTERM');
        
        // Принудительная остановка через 5 секунд
        setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
                serverProcess.kill('SIGKILL');
            }
        }, 5000);
        
        serverProcess = null;
    }
}

// События приложения
app.whenReady().then(() => {
    console.log('🎥 RTSP Monitor Electron запускается...');
    
    createWindow();
    startServer();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    console.log('🛑 Все окна закрыты, завершение приложения...');
    stopServer();
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    console.log('🛑 Приложение завершается...');
    stopServer();
});

// IPC обработчики для коммуникации с renderer процессом
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('minimize-window', () => {
    if (mainWindow) {
        mainWindow.minimize();
    }
});

ipcMain.handle('maximize-window', () => {
    if (mainWindow) {
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    }
});

ipcMain.handle('close-window', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

console.log('✅ Electron main процесс инициализирован');
