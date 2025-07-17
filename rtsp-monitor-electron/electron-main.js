<<<<<<< HEAD
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
=======
const { app, BrowserWindow, Menu } = require('electron');
>>>>>>> 9b806b3 (pre)
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

// Функция создания главного окна
function createWindow() {
<<<<<<< HEAD
    console.log('🚀 Создание главного окна Electron...');
=======
    console.log('🎥 Создание главного окна RTSP Monitor');
>>>>>>> 9b806b3 (pre)
    
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        minWidth: 1280,
        minHeight: 720,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
<<<<<<< HEAD
            enableRemoteModule: false,
            webSecurity: false, // Для локальных HLS потоков
            allowRunningInsecureContent: true
        },
        icon: path.join(__dirname, 'icon.png'),
        title: '🎥 RTSP Monitor - Система видеонаблюдения',
        show: false,
        autoHideMenuBar: false // Показываем меню для доступа к DevTools
    });

    // Создаем меню с возможностью открыть DevTools
    const template = [
        {
            label: 'Файл',
            submenu: [
                {
                    label: 'Выход',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Вид',
            submenu: [
                {
                    label: 'Перезагрузить',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        mainWindow.webContents.reload();
                    }
                },
                {
                    label: 'Инструменты разработчика',
                    accelerator: 'F12',
                    click: () => {
                        mainWindow.webContents.openDevTools();
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Полноэкранный режим',
                    accelerator: 'F11',
                    click: () => {
                        mainWindow.setFullScreen(!mainWindow.isFullScreen());
                    }
                }
            ]
        },
        {
            label: 'Помощь',
            submenu: [
                {
                    label: 'О программе',
                    click: () => {
                        console.log('RTSP Monitor v1.0.0');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Автоматически открываем DevTools для отладки
    // Закомментируйте эту строку в продакшене
    mainWindow.webContents.openDevTools();

    // Показываем окно после полной загрузки
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        console.log('✅ Главное окно отображено');
    });

    // Обработчик горячих клавиш
    mainWindow.webContents.on('before-input-event', (event, input) => {
        // F12 для DevTools
        if (input.key === 'F12') {
            mainWindow.webContents.openDevTools();
        }
        // Ctrl+Shift+I для DevTools
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
=======
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
>>>>>>> 9b806b3 (pre)
            mainWindow.webContents.openDevTools();
        }
    });

<<<<<<< HEAD
    mainWindow.on('closed', () => {
        mainWindow = null;
        stopServer();
    });

    // Логирование событий загрузки
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('✅ Страница загружена');
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('❌ Ошибка загрузки:', errorDescription);
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer] ${message}`);
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
=======
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
>>>>>>> 9b806b3 (pre)

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
<<<<<<< HEAD
    console.log('🛑 Все окна закрыты, завершение приложения...');
=======
    console.log('🔌 Все окна закрыты');
>>>>>>> 9b806b3 (pre)
    stopServer();
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

<<<<<<< HEAD
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
=======
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
>>>>>>> 9b806b3 (pre)
