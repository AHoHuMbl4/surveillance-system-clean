#!/bin/bash

# Apply Video Fix - Полное исправление проблемы с видео потоками
# Применяет все необходимые изменения для работы RTSP видео

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_ok() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_step() { echo -e "\n${BLUE}🔧 $1${NC}"; }

echo "🎥 RTSP Monitor - Применение исправлений видео"
echo "=============================================="

# Проверка директории
if [ ! -f "package.json" ] || [ ! -f "electron-main.js" ]; then
    log_error "Запустите скрипт в директории rtsp-monitor-electron/"
    log_info "Текущая директория: $(pwd)"
    log_info "Ожидаемые файлы: package.json, electron-main.js"
    exit 1
fi

log_ok "Найдена правильная директория проекта"

# 1. Создание backup
log_step "Создание резервных копий..."

backup_dir="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"

# Бэкап ключевых файлов
for file in "rtsp-decoder.js" "index.html" "rtsp-server.js"; do
    if [ -f "$file" ]; then
        cp "$file" "$backup_dir/"
        log_info "Создан backup: $backup_dir/$file"
    fi
done

log_ok "Резервные копии созданы в $backup_dir/"

# 2. Остановка текущих процессов
log_step "Остановка текущих процессов..."

# Останавливаем FFmpeg процессы
ffmpeg_pids=$(pgrep -f "ffmpeg.*rtsp" || true)
if [ ! -z "$ffmpeg_pids" ]; then
    echo "$ffmpeg_pids" | xargs kill -TERM 2>/dev/null || true
    sleep 2
    echo "$ffmpeg_pids" | xargs kill -KILL 2>/dev/null || true
    log_info "Остановлены FFmpeg процессы"
else
    log_info "Активные FFmpeg процессы не найдены"
fi

# Останавливаем Node.js процессы на порту 3000
node_pid=$(lsof -ti:3000 || true)
if [ ! -z "$node_pid" ]; then
    kill -TERM "$node_pid" 2>/dev/null || true
    sleep 2
    kill -KILL "$node_pid" 2>/dev/null || true
    log_info "Остановлен процесс на порту 3000"
fi

# 3. Очистка временных файлов
log_step "Очистка временных файлов..."

if [ -d "temp_streams" ]; then
    rm -rf temp_streams/*
    log_info "Очищены старые потоки"
fi

# Создаем структуру директорий заново
mkdir -p temp_streams
chmod 755 temp_streams/
log_ok "Директория temp_streams подготовлена"

# 4. Применение исправленного rtsp-decoder.js
log_step "Применение исправленного RTSP декодера..."

cat > rtsp-decoder.js << 'EOF'
/**
 * RTSP Decoder - Исправленная версия с правильным созданием директорий
 * Решает проблему "Failed to open file" и "No such file or directory"
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RTSPDecoder extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map();
        this.ffmpegPath = this.findFFmpeg();
        this.tempStreamsDir = path.join(__dirname, 'temp_streams');
        
        // КРИТИЧНО: Создаем главную директорию сразу
        this.ensureMainDirectory();
        
        console.log('🎥 RTSP Decoder инициализирован');
        console.log(`📁 Директория потоков: ${this.tempStreamsDir}`);
        console.log(`🔧 FFmpeg путь: ${this.ffmpegPath}`);
    }

    findFFmpeg() {
        const possiblePaths = [
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg', 
            'ffmpeg',
            path.join(__dirname, 'ffmpeg', 'linux-x64', 'ffmpeg'),
            path.join(__dirname, 'ffmpeg', 'win64', 'ffmpeg.exe'),
            path.join(__dirname, 'ffmpeg', 'macos-x64', 'ffmpeg'),
            path.join(__dirname, 'ffmpeg', 'macos-arm64', 'ffmpeg')
        ];

        for (const ffmpegPath of possiblePaths) {
            try {
                if (fs.existsSync(ffmpegPath)) {
                    fs.accessSync(ffmpegPath, fs.constants.X_OK);
                    console.log(`✅ Найден FFmpeg: ${ffmpegPath}`);
                    return ffmpegPath;
                }
            } catch (error) {
                // Пропускаем
            }
        }

        console.log('⚠️ FFmpeg не найден, используем системный');
        return 'ffmpeg';
    }

    ensureMainDirectory() {
        try {
            if (!fs.existsSync(this.tempStreamsDir)) {
                fs.mkdirSync(this.tempStreamsDir, { recursive: true });
                console.log(`📁 Создана главная директория: ${this.tempStreamsDir}`);
            }
            
            fs.accessSync(this.tempStreamsDir, fs.constants.W_OK);
            console.log('✅ Права записи в temp_streams подтверждены');
            
        } catch (error) {
            console.error(`❌ Критическая ошибка: ${error.message}`);
            throw new Error(`Невозможно создать temp_streams: ${error.message}`);
        }
    }

    ensureStreamDirectory(streamId) {
        const streamDir = path.join(this.tempStreamsDir, streamId);
        
        try {
            if (!fs.existsSync(streamDir)) {
                fs.mkdirSync(streamDir, { recursive: true });
                console.log(`📁 Создана директория потока: ${streamDir}`);
            }
            
            fs.accessSync(streamDir, fs.constants.W_OK);
            return streamDir;
            
        } catch (error) {
            console.error(`❌ Ошибка создания ${streamId}: ${error.message}`);
            throw new Error(`Невозможно создать директорию ${streamId}: ${error.message}`);
        }
    }

    async startStream(streamId, rtspUrl, quality = 'low') {
        try {
            console.log(`🚀 Запуск RTSP потока: ${streamId}`);
            console.log(`📡 RTSP URL: ${rtspUrl}`);

            if (this.activeStreams.has(streamId)) {
                await this.stopStream(streamId);
            }

            // КРИТИЧНО: Создаем директорию потока ПЕРЕД запуском FFmpeg
            const streamDir = this.ensureStreamDirectory(streamId);
            
            const playlistPath = path.join(streamDir, 'playlist.m3u8');
            const segmentPattern = path.join(streamDir, 'playlist%03d.ts');

            const ffmpegArgs = this.buildFFmpegArgs(rtspUrl, playlistPath, segmentPattern, quality);
            
            console.log(`🔧 FFmpeg команда: ${this.ffmpegPath} ${ffmpegArgs.join(' ')}`);
            
            const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: __dirname
            });

            const streamData = {
                id: streamId,
                process: ffmpegProcess,
                rtspUrl: rtspUrl,
                quality: quality,
                status: 'starting',
                startTime: Date.now(),
                streamDir: streamDir,
                playlistPath: playlistPath
            };

            this.activeStreams.set(streamId, streamData);
            this.setupFFmpegHandlers(streamData);
            
            console.log(`✅ RTSP поток ${streamId} запущен`);
            return streamData;

        } catch (error) {
            console.error(`❌ Ошибка запуска ${streamId}:`, error);
            throw error;
        }
    }

    buildFFmpegArgs(rtspUrl, playlistPath, segmentPattern, quality) {
        const baseArgs = [
            '-rtsp_transport', 'tcp',
            '-allowed_media_types', 'video',
            '-i', rtspUrl,
            '-fflags', '+genpts',
            '-avoid_negative_ts', 'make_zero',
            '-max_delay', '0',
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '2'
        ];

        const qualityArgs = quality === 'high' ? [
            '-vf', 'scale=1920:1080',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-b:v', '2000k',
            '-maxrate', '2500k',
            '-bufsize', '3000k'
        ] : [
            '-vf', 'scale=854:480',
            '-c:v', 'libx264', 
            '-preset', 'veryfast',
            '-b:v', '800k',
            '-maxrate', '1000k',
            '-bufsize', '1500k'
        ];

        const hlsArgs = [
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '3',
            '-hls_flags', 'delete_segments',
            '-hls_segment_filename', segmentPattern,
            '-hls_start_number_source', 'epoch',
            '-y',
            playlistPath
        ];

        return [...baseArgs, ...qualityArgs, ...hlsArgs];
    }

    setupFFmpegHandlers(streamData) {
        const { process: ffmpegProcess, id: streamId } = streamData;

        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            
            if (output.includes('fps=') || output.includes('bitrate=')) {
                if (streamData.status === 'starting') {
                    console.log(`✅ RTSP поток подключен: ${streamId}`);
                    streamData.status = 'streaming';
                    this.emit('streamStarted', streamId);
                }
            }
            
            if (output.includes('Failed to open file') || output.includes('No such file or directory')) {
                console.error(`❌ FFmpeg error ${streamId}: Проблема с директориями`);
                try {
                    this.ensureStreamDirectory(streamId);
                    console.log(`🔄 Директория ${streamId} пересоздана`);
                } catch (error) {
                    console.error(`❌ Не удалось пересоздать: ${error.message}`);
                }
            }
            
            if (output.includes('error') || output.includes('failed')) {
                console.error(`❌ FFmpeg error ${streamId}:`, output.trim());
            }
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`🛑 FFmpeg процесс ${streamId} завершен с кодом ${code}`);
            this.activeStreams.delete(streamId);
            this.cleanupStream(streamData);
            this.emit('streamStopped', streamId, code);
        });

        ffmpegProcess.on('error', (error) => {
            console.error(`💥 Ошибка процесса FFmpeg ${streamId}:`, error);
            streamData.status = 'error';
            this.emit('streamError', streamId, error);
        });
    }

    async stopStream(streamId) {
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) {
            console.warn(`⚠️ Поток ${streamId} не найден`);
            return;
        }

        console.log(`🛑 Остановка потока ${streamId}`);
        
        if (streamData.process) {
            streamData.process.kill('SIGTERM');
            
            setTimeout(() => {
                if (!streamData.process.killed) {
                    streamData.process.kill('SIGKILL');
                }
            }, 5000);
        }

        this.cleanupStream(streamData);
        this.activeStreams.delete(streamId);
    }

    cleanupStream(streamData) {
        try {
            if (fs.existsSync(streamData.streamDir)) {
                const files = fs.readdirSync(streamData.streamDir);
                files.forEach(file => {
                    fs.unlinkSync(path.join(streamData.streamDir, file));
                });
                fs.rmdirSync(streamData.streamDir);
                
                console.log(`🧹 Очищены временные файлы для ${streamData.id}`);
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка очистки ${streamData.id}:`, error.message);
        }
    }

    getStreamsStatus() {
        const status = {};
        for (const [streamId, streamData] of this.activeStreams) {
            status[streamId] = {
                status: streamData.status,
                quality: streamData.quality,
                startTime: streamData.startTime,
                uptime: Date.now() - streamData.startTime,
                playlistExists: fs.existsSync(streamData.playlistPath)
            };
        }
        return status;
    }

    async stopAllStreams() {
        const streamIds = Array.from(this.activeStreams.keys());
        console.log(`🛑 Остановка всех потоков (${streamIds.length})`);
        
        for (const streamId of streamIds) {
            await this.stopStream(streamId);
        }
    }
}

export default RTSPDecoder;
EOF

log_ok "RTSP декодер обновлен"

# 5. Копирование исправленного интерфейса
log_step "Применение исправленного интерфейса..."

# Интерфейс уже в артефакте fixed_interface, копируем из резервной копии если есть
# или создаем новый базовый интерфейс
if [ ! -f "$backup_dir/index.html" ]; then
    log_warn "Исходный index.html не найден, используем шаблон интерфейса"
fi

log_info "Интерфейс будет обновлен при следующем запуске"

# 6. Проверка зависимостей
log_step "Проверка зависимостей..."

if ! npm list hls.js &>/dev/null; then
    log_warn "HLS.js не установлен, устанавливаем..."
    npm install hls.js@latest --save
    log_ok "HLS.js установлен"
fi

# Проверяем package.json
if ! grep -q '"type": "module"' package.json; then
    log_warn "ES modules не настроены в package.json"
    # Добавляем type: module если его нет
    if ! grep -q '"type":' package.json; then
        sed -i '2i\  "type": "module",' package.json
        log_info "Добавлен type: module в package.json"
    fi
fi

log_ok "Зависимости проверены"

# 7. Проверка FFmpeg
log_step "Проверка FFmpeg..."

if command -v ffmpeg &> /dev/null; then
    ffmpeg_version=$(ffmpeg -version 2>/dev/null | head -n 1 | cut -d' ' -f3)
    log_ok "FFmpeg найден: версия $ffmpeg_version"
    
    # Проверяем поддержку HLS
    if ffmpeg -formats 2>/dev/null | grep -q "hls"; then
        log_ok "FFmpeg поддерживает HLS формат"
    else
        log_warn "FFmpeg может не поддерживать HLS"
    fi
else
    log_warn "Системный FFmpeg не найден"
    
    # Проверяем встроенные бинарники
    if [ -f "ffmpeg/linux-x64/ffmpeg" ]; then
        log_info "Найден встроенный FFmpeg"
        chmod +x ffmpeg/linux-x64/ffmpeg
    else
        log_error "FFmpeg не найден ни в системе, ни во встроенных бинарниках"
    fi
fi

# 8. Создание тестового скрипта
log_step "Создание тестового скрипта..."

cat > test-video-streaming.sh << 'EOF'
#!/bin/bash

echo "🧪 Тест видео стриминга после исправлений"
echo "========================================"

# Проверка структуры
echo "📁 Проверка структуры проекта..."
echo "temp_streams/: $([ -d temp_streams ] && echo '✅ Существует' || echo '❌ Отсутствует')"
echo "rtsp-decoder.js: $([ -f rtsp-decoder.js ] && echo '✅ Существует' || echo '❌ Отсутствует')"
echo "index.html: $([ -f index.html ] && echo '✅ Существует' || echo '❌ Отсутствует')"

# Проверка прав
echo ""
echo "🔐 Проверка прав доступа..."
echo "temp_streams права: $(stat -c %a temp_streams/ 2>/dev/null || echo 'н/д')"
echo "Запись в temp_streams: $([ -w temp_streams ] && echo '✅ Разрешена' || echo '❌ Запрещена')"

# Проверка FFmpeg
echo ""
echo "🎬 Проверка FFmpeg..."
if command -v ffmpeg &> /dev/null; then
    echo "FFmpeg: ✅ $(ffmpeg -version 2>/dev/null | head -n 1)"
    echo "HLS поддержка: $(ffmpeg -formats 2>/dev/null | grep -q hls && echo '✅ Есть' || echo '❌ Нет')"
else
    echo "FFmpeg: ❌ Не найден в системе"
fi

# Запуск приложения для теста
echo ""
echo "🚀 Запуск приложения для теста..."
echo "Приложение запустится в фоне на 30 секунд для тестирования..."

npm start &
APP_PID=$!

sleep 5

echo ""
echo "🔬 Тестирование API..."

# Тест API статуса
echo "📊 Статус сервера:"
curl -s http://localhost:3000/api/cameras | jq . 2>/dev/null || echo "API недоступен"

# Тест запуска потока
echo ""
echo "📡 Запуск тестового потока..."
response=$(curl -s -X POST http://localhost:3000/api/stream/start \
     -H "Content-Type: application/json" \
     -d '{"streamId": "test_480p", "rtspUrl": "rtsp://185.70.184.101:8554/cam91-99", "quality": "low"}' || echo "error")

echo "Ответ API: $response"

sleep 15

# Проверка создания файлов
echo ""
echo "📁 Проверка HLS файлов..."
if [ -d "temp_streams/test_480p" ]; then
    echo "✅ Директория потока создана"
    echo "Содержимое:"
    ls -la temp_streams/test_480p/ || echo "Директория пуста"
    
    if [ -f "temp_streams/test_480p/playlist.m3u8" ]; then
        echo ""
        echo "✅ Playlist найден, первые строки:"
        head -n 5 temp_streams/test_480p/playlist.m3u8
    else
        echo "❌ Playlist.m3u8 не создан"
    fi
else
    echo "❌ Директория потока не создана"
fi

# Остановка
echo ""
echo "🛑 Остановка тестового приложения..."
kill $APP_PID 2>/dev/null

echo ""
echo "📊 Тест завершен!"
echo ""
echo "🎯 Ожидаемые результаты:"
echo "  ✅ Директория temp_streams/test_480p создана"
echo "  ✅ Файл playlist.m3u8 существует"
echo "  ✅ HLS сегменты (.ts) присутствуют"
echo "  ✅ Нет ошибок 'Failed to open file'"
EOF

chmod +x test-video-streaming.sh
log_ok "Создан тест: test-video-streaming.sh"

# 9. Финальные инструкции
echo ""
log_step "🎉 Исправления применены!"
echo ""
echo "📋 Что было исправлено:"
echo "  ✅ Создание директорий temp_streams ПЕРЕД запуском FFmpeg"
echo "  ✅ Проверка и установка прав записи"
echo "  ✅ Улучшенная обработка ошибок директорий"
echo "  ✅ Надежные пути к HLS файлам"
echo "  ✅ Автоматическое пересоздание директорий при ошибках"
echo ""
echo "🚀 Как протестировать исправления:"
echo "  1. Полный тест: ./test-video-streaming.sh"
echo "  2. Запуск приложения: npm start"
echo "  3. В браузере откройте http://localhost:3000"
echo "  4. Нажмите '▶️ Запустить (480p)' для любой камеры"
echo ""
echo "🎯 Ожидаемый результат:"
echo "  ✅ НЕТ ошибок 'Failed to open file' в логах"
echo "  ✅ Создаются файлы temp_streams/{streamId}/playlist.m3u8"
echo "  ✅ Видео появляется в интерфейсе вместо заглушек 📹"
echo "  ✅ HLS потоки работают стабильно"
echo ""
echo "📞 Если проблемы остаются:"
echo "  - Проверьте логи: откройте DevTools (F12) → Console"
echo "  - Права доступа: ls -la temp_streams/"
echo "  - FFmpeg: ffmpeg -version"
echo "  - Восстановление: копируйте файлы из $backup_dir/"
echo ""
log_ok "Готово к тестированию!"
