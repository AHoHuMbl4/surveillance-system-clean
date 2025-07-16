#!/bin/bash

# Локальная установка Electron и сборка БЕЗ sudo прав
# Все устанавливается в папку проекта

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo "🚀 Локальная установка RTSP Monitor Electron"
echo "============================================="

# 1. Создание локальной структуры проекта
setup_local_project() {
    log_info "Создание структуры проекта..."
    
    # Создаем папку для electron приложения
    mkdir -p rtsp-monitor-electron
    cd rtsp-monitor-electron
    
    # Инициализация npm проекта (если нет package.json)
    if [ ! -f "package.json" ]; then
        log_info "Инициализация npm проекта..."
        npm init -y
    fi
    
    # Локальная установка Electron и electron-builder (БЕЗ -g)
    log_info "Установка Electron локально (без sudo)..."
    npm install electron@latest --save-dev
    npm install electron-builder@latest --save-dev
    npm install rimraf --save-dev
    
    log_info "Electron установлен локально в node_modules"
}

# 2. Создание файлов проекта
create_project_files() {
    log_info "Создание файлов проекта..."
    
    # Копируем основные файлы из родительской папки
    if [ -f "../autonomous-server.js" ]; then
        cp ../autonomous-server.js ./
        log_info "autonomous-server.js скопирован"
    else
        log_warn "autonomous-server.js не найден, создаем заглушку"
        echo "console.log('RTSP Server placeholder');" > autonomous-server.js
    fi
    
    if [ -f "../autonomous-rtsp-manager.js" ]; then
        cp ../autonomous-rtsp-manager.js ./
        log_info "autonomous-rtsp-manager.js скопирован"
    else
        log_warn "autonomous-rtsp-manager.js не найден, создаем заглушку"
        echo "console.log('RTSP Manager placeholder');" > autonomous-rtsp-manager.js
    fi
    
    if [ -f "../index.html" ]; then
        cp ../index.html ./
        log_info "index.html скопирован"
    else
        log_warn "index.html не найден, создаем простой интерфейс"
        cat > index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>RTSP Monitor</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #2c3e50; }
    </style>
</head>
<body>
    <h1>🎥 RTSP Monitor</h1>
    <p>Система видеонаблюдения запущена</p>
    <p>Порт: 3000</p>
</body>
</html>
EOF
    fi
    
    # Копируем FFmpeg если есть
    if [ -d "../ffmpeg" ]; then
        cp -r ../ffmpeg ./
        log_info "FFmpeg бинарники скопированы"
    else
        log_warn "FFmpeg не найден, создаем структуру заглушек"
        mkdir -p ffmpeg/{win64,linux-x64,macos-x64,macos-arm64}
        # Создаем заглушки для тестирования
        echo "#!/bin/bash" > ffmpeg/linux-x64/ffmpeg
        echo "echo 'FFmpeg placeholder'" >> ffmpeg/linux-x64/ffmpeg
        chmod +x ffmpeg/linux-x64/ffmpeg
        
        # Windows заглушка
        echo "@echo FFmpeg placeholder" > ffmpeg/win64/ffmpeg.exe
    fi
}

# 3. Создание Electron main.js
create_electron_main() {
    log_info "Создание Electron main процесса..."
    
    cat > electron-main.js << 'EOF'
const { app, BrowserWindow, Menu, Tray } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

let mainWindow;
let serverProcess;
let tray;

function createWindow() {
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

    // Запуск встроенного сервера
    startServer();

    // Загрузка интерфейса через 3 секунды
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.show();
    }, 3000);

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function startServer() {
    console.log('🚀 Запуск встроенного сервера...');
    
    const serverPath = path.join(__dirname, 'autonomous-server.js');
    serverProcess = spawn('node', [serverPath], {
        stdio: 'pipe',
        env: {
            ...process.env,
            PORT: '3000',
            NODE_ENV: 'production'
        }
    });

    serverProcess.stdout.on('data', (data) => {
        console.log('Server:', data.toString().trim());
    });

    serverProcess.stderr.on('data', (data) => {
        console.error('Server Error:', data.toString().trim());
    });
}

function createTray() {
    // Простая иконка для трея (если нет файла иконки)
    tray = new Tray(path.join(__dirname, 'assets/tray.png'));
    
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

    tray.setContextMenu(contextMenu);
    tray.setToolTip('RTSP Monitor');
}

app.whenReady().then(() => {
    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    // Не закрываем приложение, оставляем в трее
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

console.log('🚀 RTSP Monitor Electron запущен');
EOF

    log_info "electron-main.js создан"
}

# 4. Обновление package.json для Electron
update_package_json() {
    log_info "Обновление package.json..."
    
    cat > package.json << 'EOF'
{
  "name": "rtsp-monitor-electron",
  "version": "1.0.0",
  "description": "Автономная система видеонаблюдения",
  "main": "electron-main.js",
  "scripts": {
    "start": "electron .",
    "dev": "NODE_ENV=development electron .",
    "build": "./node_modules/.bin/electron-builder",
    "build:win": "./node_modules/.bin/electron-builder --win",
    "build:linux": "./node_modules/.bin/electron-builder --linux",
    "build:mac": "./node_modules/.bin/electron-builder --mac",
    "dist": "./node_modules/.bin/electron-builder --publish=never",
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
      "autonomous-server.js",
      "autonomous-rtsp-manager.js",
      "index.html",
      "ffmpeg/**/*",
      "assets/**/*"
    ],
    "extraResources": [
      {
        "from": "ffmpeg",
        "to": "ffmpeg",
        "filter": ["**/*"]
      }
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        },
        {
          "target": "portable", 
          "arch": ["x64"]
        }
      ],
      "artifactName": "${productName}-${version}-Windows.${ext}"
    },
    "linux": {
      "target": [
        {
          "target": "AppImage",
          "arch": ["x64"]
        },
        {
          "target": "deb",
          "arch": ["x64"]
        }
      ],
      "artifactName": "${productName}-${version}-Linux.${ext}",
      "category": "Network"
    },
    "mac": {
      "target": [
        {
          "target": "dmg",
          "arch": ["x64", "arm64"]
        }
      ],
      "artifactName": "${productName}-${version}-macOS.${ext}"
    }
  }
}
EOF

    log_info "package.json обновлен"
}

# 5. Создание простых ресурсов
create_simple_assets() {
    log_info "Создание простых ресурсов..."
    
    mkdir -p assets
    
    # Создание простой иконки в текстовом формате (для тестирования)
    cat > assets/tray.png.txt << 'EOF'
# Простая текстовая иконка
# В production замените на настоящую PNG иконку 16x16
RTSP
EOF

    # Создание README
    cat > README.md << 'EOF'
# RTSP Monitor Electron

Автономная система видеонаблюдения с поддержкой RTSP потоков.

## Запуск разработки
```bash
npm start
```

## Сборка установщиков
```bash
npm run build:win     # Windows
npm run build:linux   # Linux  
npm run build:mac     # macOS
```

## Структура
- electron-main.js - основной процесс Electron
- autonomous-server.js - Node.js сервер
- index.html - веб-интерфейс
- ffmpeg/ - бинарники для обработки видео
EOF

    log_info "Ресурсы созданы"
}

# 6. Тестирование локальной установки
test_local_setup() {
    log_info "Тестирование установки..."
    
    # Проверка что Electron установлен локально
    if [ -f "node_modules/.bin/electron" ]; then
        log_info "Electron установлен локально: $(./node_modules/.bin/electron --version)"
    else
        log_error "Electron не найден в node_modules"
        return 1
    fi
    
    # Проверка electron-builder
    if [ -f "node_modules/.bin/electron-builder" ]; then
        log_info "electron-builder установлен локально"
    else
        log_error "electron-builder не найден"
        return 1
    fi
    
    # Проверка основных файлов
    for file in electron-main.js autonomous-server.js index.html; do
        if [ -f "$file" ]; then
            log_info "✅ $file присутствует"
        else
            log_warn "⚠️  $file отсутствует"
        fi
    done
    
    log_info "Установка проверена"
}

# 7. Создание скриптов сборки
create_build_scripts() {
    log_info "Создание скриптов сборки..."
    
    # Скрипт для Windows
    cat > build-windows.sh << 'EOF'
#!/bin/bash
echo "🪟 Сборка для Windows..."
./node_modules/.bin/electron-builder --win
echo "✅ Windows сборка завершена!"
echo "📁 Файлы в: installers/"
ls -la installers/ | grep -E "\.(exe|msi)$" || echo "Нет Windows файлов"
EOF
    
    # Скрипт для Linux
    cat > build-linux.sh << 'EOF'
#!/bin/bash
echo "🐧 Сборка для Linux..."
./node_modules/.bin/electron-builder --linux
echo "✅ Linux сборка завершена!"
echo "📁 Файлы в: installers/"
ls -la installers/ | grep -E "\.(deb|rpm|AppImage)$" || echo "Нет Linux файлов"
EOF
    
    # Скрипт для всех платформ
    cat > build-all.sh << 'EOF'
#!/bin/bash
echo "🌍 Сборка для всех платформ..."
./node_modules/.bin/electron-builder --win --linux --mac
echo "✅ Сборка завершена!"
echo "📁 Результаты:"
if [ -d "installers" ]; then
    ls -lah installers/
else
    echo "Папка installers не создана"
fi
EOF
    
    # Делаем скрипты исполняемыми
    chmod +x build-windows.sh build-linux.sh build-all.sh
    
    log_info "Скрипты сборки созданы"
}

# Основная функция
main() {
    echo "🎯 Цель: Локальная установка без sudo прав"
    echo ""
    
    setup_local_project
    create_project_files
    create_electron_main
    update_package_json
    create_simple_assets
    create_build_scripts
    test_local_setup
    
    echo ""
    log_info "🎉 Локальная установка завершена успешно!"
    echo ""
    echo "📋 Следующие шаги:"
    echo "  1. Тестирование: npm start"
    echo "  2. Сборка Windows: ./build-windows.sh"
    echo "  3. Сборка Linux: ./build-linux.sh" 
    echo "  4. Сборка всех: ./build-all.sh"
    echo ""
    echo "📁 Все файлы в папке: $(pwd)"
    echo "🚀 Готово к тестированию!"
}

# Запуск
main

# Показ структуры проекта
echo ""
log_info "📂 Структура проекта:"
find . -maxdepth 2 -type f -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.sh" | sort
EOF
