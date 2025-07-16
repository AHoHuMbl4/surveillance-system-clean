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
