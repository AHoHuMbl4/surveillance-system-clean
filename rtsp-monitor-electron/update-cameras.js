// Замените в rtsp-server.js секцию this.config.cameras на:

this.config = {
    cameras: [
        { 
            id: 1, 
            camera_name: 'Тестовая камера (рабочая)', 
            apartment_name: 'Тест зона', 
            rtsp_main: 'rtsp://185.70.184.101:8554/cam91-99', 
            rtsp_sub: 'rtsp://185.70.184.101:8554/cam91-99' 
        },
        { 
            id: 2, 
            camera_name: 'Камера Hikvision 1', 
            apartment_name: 'Офис 1', 
            rtsp_main: 'rtsp://admin:Hikvision@192.168.12.107:554/h264', 
            rtsp_sub: 'rtsp://admin:Hikvision@192.168.12.107:554/h264' 
        },
        { 
            id: 3, 
            camera_name: 'Камера Hikvision 2', 
            apartment_name: 'Офис 2', 
            rtsp_main: 'rtsp://admin:Hikvision@192.168.11.107:554/h264', 
            rtsp_sub: 'rtsp://admin:Hikvision@192.168.11.107:554/h264' 
        },
        { 
            id: 4, 
            camera_name: 'Камера Hikvision 3', 
            apartment_name: 'Офис 3', 
            rtsp_main: 'rtsp://admin:Hikvision@192.168.29.107:554/h264', 
            rtsp_sub: 'rtsp://admin:Hikvision@192.168.29.107:554/h264' 
        },
        { 
            id: 5, 
            camera_name: 'Камера Hikvision 4', 
            apartment_name: 'Офис 4', 
            rtsp_main: 'rtsp://admin:Hikvision@192.168.28.107:554/h264', 
            rtsp_sub: 'rtsp://admin:Hikvision@192.168.28.107:554/h264' 
        }
    ]
};
