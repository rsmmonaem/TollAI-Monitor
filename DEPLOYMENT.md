# TollAI Monitor — Full Deployment Guide

> **System:** AI-Powered Toll & Lease Collection Monitoring  
> **Stack:** Python 3.10 · Flask · YOLOv8s · EasyOCR · MySQL · Nginx · Gunicorn  
> **Audience:** System administrator / DevOps engineer

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Choose Your Deployment Option](#2-choose-your-deployment-option)
3. [Option A — Local Server (On-Premise)](#3-option-a--local-server-on-premise)
4. [Option B — Hybrid Cloud + Local Edge](#4-option-b--hybrid-cloud--local-edge)
5. [Option C — Docker / HuggingFace Spaces](#5-option-c--docker--huggingface-spaces)
6. [Environment & Dependencies](#6-environment--dependencies)
7. [Database Setup (MySQL)](#7-database-setup-mysql)
8. [Configure Environment Variables](#8-configure-environment-variables)
9. [Production Server (Gunicorn + Nginx)](#9-production-server-gunicorn--nginx)
10. [Systemd Service (Auto-restart)](#10-systemd-service-auto-restart)
11. [CCTV Camera Connection (RTSP)](#11-cctv-camera-connection-rtsp)
12. [SSL / HTTPS Setup](#12-ssl--https-setup)
13. [Firewall Configuration](#13-firewall-configuration)
14. [Maintenance & Monitoring](#14-maintenance--monitoring)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Architecture Overview

```
╔══════════════════════════════════════════════════════════════════╗
║  TOLL BOOTH  (Local Edge Device)                                 ║
║                                                                  ║
║  CCTV Cam 1 ──→ ┌─────────────────────────────────────────┐    ║
║  CCTV Cam 2 ──→ │  ai_engine.py                           │    ║
║                 │  YOLOv8s Vehicle Detection               │    ║
║                 │  EasyOCR Plate Recognition               │    ║
║                 │  3-Layer Deduplication                   │    ║
║                 └────────────┬──────────────────┬──────────┘    ║
║                              │ DB records        │ JPEG frames   ║
╚══════════════════════════════╪══════════════════╪═══════════════╝
                               │                  │
╔══════════════════════════════╪══════════════════╪═══════════════╗
║  CLOUD / LOCAL SERVER        │                  │               ║
║                              ↓                  ↓               ║
║  ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐   ║
║  │    MySQL     │   │  Flask API   │   │  MJPEG Stream     │   ║
║  │   Database   │←──│  server.py   │   │  /api/camera/N/   │   ║
║  └──────────────┘   └──────┬───────┘   └───────────────────┘   ║
║                             │                                    ║
║                      Gunicorn WSGI                              ║
║                             │                                    ║
║                      Nginx (Port 80/443)                        ║
║                             │                                    ║
╚═════════════════════════════╪══════════════════════════════════╝
                              │
                     Browser Dashboard
                   (Any device, anywhere)
```

---

## 2. Choose Your Deployment Option

| Option | Best For | Complexity | Cost |
|---|---|---|---|
| **A — Local Server** | Single toll plaza, no internet needed | ⭐⭐ Easy | ৳0/mo extra |
| **B — Hybrid Cloud** | Multi-location, remote management | ⭐⭐⭐ Medium | ৳2,000–3,500/mo |
| **C — Docker/HuggingFace** | Demo / testing only | ⭐ Easiest | Free |

---

## 3. Option A — Local Server (On-Premise)

All components run on a single machine at the toll booth.

### Hardware Required
```
CPU: Intel i5/i7 (6+ cores)  or  AMD Ryzen 5/7
RAM: 8 GB minimum (16 GB recommended for 2+ cameras)
SSD: 256 GB+
OS:  Ubuntu 22.04 LTS Server
UPS: 700VA (mandatory — protects against power cuts)
```

### Step 1 — Install Ubuntu Server 22.04 LTS
Download from: https://ubuntu.com/download/server  
Flash to USB with Balena Etcher → Install → Choose "Minimal Installation"

### Step 2 — Initial Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y git curl wget unzip ufw nginx python3.10 python3.10-venv \
     python3-pip mysql-server libgl1 libglib2.0-0 libgomp1 ffmpeg

# Create dedicated system user
sudo useradd -m -s /bin/bash tollai
sudo usermod -aG sudo tollai
```

### Step 3 — Clone the Repository
```bash
sudo su - tollai
cd /home/tollai
git clone https://github.com/YOUR_USERNAME/tole.git
cd tole
```

---

## 4. Option B — Hybrid Cloud + Local Edge

**Cloud server:** Hosts Flask dashboard + MySQL  
**Local edge device (at booth):** Runs YOLO AI engine, connects to cloud DB

### Cloud Server Setup (Vultr/AWS/DigitalOcean Singapore)

```bash
# Create a $20/month VPS (Ubuntu 22.04, 2vCPU, 4GB RAM)
# SSH into cloud server:
ssh root@YOUR_CLOUD_IP

# Repeat Step 2 from Option A on the cloud server
# Then configure MySQL to accept remote connections:
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
  # Change: bind-address = 0.0.0.0

# Create remote DB user
sudo mysql
  CREATE USER 'toll_user'@'%' IDENTIFIED BY 'StrongPass123!';
  GRANT ALL PRIVILEGES ON toll_monitoring.* TO 'toll_user'@'%';
  FLUSH PRIVILEGES;
  EXIT;

# Open MySQL port only for edge device IP
sudo ufw allow from EDGE_DEVICE_IP to any port 3306
```

### Edge Device Setup (Mini PC at toll booth)
```bash
# Same code deployment as Option A
# BUT configure .env to point to cloud DB:
DB_HOST=YOUR_CLOUD_IP
DB_USER=toll_user
DB_PASSWORD=StrongPass123!

# Only run the AI engine (not the Flask server) on edge device:
./venv/bin/python python/ai_engine.py \
    --source rtsp://admin:pass@192.168.1.101:554/stream \
    --no-window
```

---

## 5. Option C — Docker / HuggingFace Spaces

### Docker (Local or any cloud with Docker)
```bash
# Build and run
docker build -t tollai-monitor .
docker run -d \
  --name tollai \
  -p 5002:5002 \
  -e DB_HOST=localhost \
  -e DB_PASSWORD=your_password \
  -e PORT=5002 \
  -v $(pwd)/captured_vehicles:/app/captured_vehicles \
  tollai-monitor

# View logs
docker logs -f tollai
```

### HuggingFace Spaces (Free Demo Hosting)
See [HUGGINGFACE.md](HUGGINGFACE.md) in the repository root.
> ⚠️ HuggingFace is for demo only — no persistent DB, no CCTV support.

---

## 6. Environment & Dependencies

### Python Virtual Environment
```bash
cd /home/tollai/tole

# Create venv
python3.10 -m venv venv
source venv/bin/activate

# Install all dependencies
pip install --upgrade pip
pip install -r python/requirements.txt

# Install EasyOCR (required for plate reading)
pip install easyocr>=1.7.0

# Install Gunicorn (production server)
pip install gunicorn

# Verify YOLO model downloads correctly
python -c "from ultralytics import YOLO; YOLO('yolov8s.pt')"
```

### Dependency Summary
| Package | Version | Purpose |
|---|---|---|
| ultralytics | ≥8.0 | YOLOv8s vehicle detection |
| opencv-python | ≥4.8 | Video capture / frame processing |
| easyocr | ≥1.7 | Bengali + English plate OCR |
| flask | ≥3.0 | REST API + Dashboard server |
| flask-cors | ≥4.0 | Cross-origin request headers |
| gunicorn | latest | Production WSGI server |
| mysql-connector-python | ≥8.2 | MySQL database connector |
| Pillow | ≥10.0 | Image manipulation |
| numpy | ≥1.24 | Array operations |

---

## 7. Database Setup (MySQL)

```bash
# Secure MySQL installation
sudo mysql_secure_installation
# → Set root password: YES
# → Remove anonymous users: YES
# → Disallow remote root login: YES
# → Remove test database: YES

# Login to MySQL
sudo mysql -u root -p

# Create database and user
CREATE DATABASE toll_monitoring
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'toll_user'@'localhost' IDENTIFIED BY 'YourStrongPassword123!';
GRANT ALL PRIVILEGES ON toll_monitoring.* TO 'toll_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Import schema
mysql -u toll_user -p toll_monitoring < python/schema.sql

# Verify tables created
mysql -u toll_user -p -e "SHOW TABLES;" toll_monitoring
```

Expected output:
```
+---------------------------+
| Tables_in_toll_monitoring |
+---------------------------+
| fraud_reports             |
| rate_audit_log            |
| toll_rates                |
| vehicle_detections        |
+---------------------------+
```

---

## 8. Configure Environment Variables

```bash
# Copy example file
cp .env.example .env
nano .env
```

Fill in your values:
```bash
# .env — KEEP THIS FILE SECRET
DB_HOST=localhost
DB_PORT=3306
DB_NAME=toll_monitoring
DB_USER=toll_user
DB_PASSWORD=YourStrongPassword123!

PORT=5002
SECRET_KEY=<run: python3 -c "import secrets; print(secrets.token_hex(32))">

YOLO_MODEL=yolov8s.pt

CAM1_SOURCE=rtsp://admin:password@192.168.1.101:554/Streaming/Channels/101
CAM2_SOURCE=rtsp://admin:password@192.168.1.102:554/Streaming/Channels/101
```

Load environment variables into shell:
```bash
export $(grep -v '^#' .env | xargs)
```

---

## 9. Production Server (Gunicorn + Nginx)

### Gunicorn WSGI Server

```bash
# Test Gunicorn works
cd /home/tollai/tole
source venv/bin/activate
export $(grep -v '^#' .env | xargs)
gunicorn --workers 2 --bind 0.0.0.0:5002 --chdir python server:app

# If it works, Ctrl+C and proceed to systemd setup
```

### Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/tollai
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    # Increase timeouts for MJPEG video streams
    proxy_read_timeout 3600;
    proxy_send_timeout 3600;
    send_timeout 3600;

    # Increase upload size for camera frame uploads
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }

    # MJPEG camera streams — disable buffering
    location /api/camera/ {
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/tollai /etc/nginx/sites-enabled/
sudo nginx -t           # Test config
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 10. Systemd Service (Auto-restart)

### Flask/Gunicorn Service

```bash
sudo nano /etc/systemd/system/tollai-server.service
```

```ini
[Unit]
Description=TollAI Monitor Web Server
After=network.target mysql.service
Requires=mysql.service

[Service]
User=tollai
Group=tollai
WorkingDirectory=/home/tollai/tole
EnvironmentFile=/home/tollai/tole/.env
ExecStart=/home/tollai/tole/venv/bin/gunicorn \
    --workers 2 \
    --bind 127.0.0.1:5002 \
    --timeout 120 \
    --chdir /home/tollai/tole/python \
    server:app
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tollai-server

[Install]
WantedBy=multi-user.target
```

### AI Engine Service (Camera 1)

```bash
sudo nano /etc/systemd/system/tollai-engine-cam1.service
```

```ini
[Unit]
Description=TollAI AI Engine Camera 1
After=tollai-server.service
Requires=tollai-server.service

[Service]
User=tollai
Group=tollai
WorkingDirectory=/home/tollai/tole
EnvironmentFile=/home/tollai/tole/.env
ExecStartPre=/bin/sleep 10
ExecStart=/home/tollai/tole/venv/bin/python \
    /home/tollai/tole/python/ai_engine.py \
    --source rtsp://admin:password@192.168.1.101:554/Streaming/Channels/101 \
    --model yolov8s.pt \
    --camera-id 1 \
    --no-window
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tollai-engine-cam1

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start all services
sudo systemctl daemon-reload
sudo systemctl enable tollai-server tollai-engine-cam1
sudo systemctl start tollai-server
sudo systemctl start tollai-engine-cam1

# Check status
sudo systemctl status tollai-server
sudo systemctl status tollai-engine-cam1
```

---

## 11. CCTV Camera Connection (RTSP)

### Find Your Camera's RTSP URL

| Brand | Stream URL Format |
|---|---|
| Hikvision | `rtsp://admin:PASSWORD@IP:554/Streaming/Channels/101` |
| Dahua | `rtsp://admin:PASSWORD@IP:554/cam/realmonitor?channel=1&subtype=0` |
| Generic IP Cam | `rtsp://admin:PASSWORD@IP:554/stream1` |

### Test RTSP Connection
```bash
# Install ffmpeg first
sudo apt install -y ffmpeg

# Test stream (should show video info without error)
ffprobe rtsp://admin:password@192.168.1.101:554/Streaming/Channels/101

# Or view live (requires desktop):
ffplay rtsp://admin:password@192.168.1.101:554/Streaming/Channels/101
```

### CCTV Network Setup
```
Router LAN:  192.168.1.0/24
Edge Server: 192.168.1.10  (static IP)
Camera 1:    192.168.1.101 (static IP via DHCP reservation)
Camera 2:    192.168.1.102 (static IP via DHCP reservation)

Set cameras to static IP in their web admin panel:
  Open browser → http://192.168.1.101 → Network → IP Settings
```

### Camera Best Practice Settings
```
Resolution:   1920×1080 (1080p)
Frame Rate:   25 FPS
Codec:        H.264 (not H.265 — OpenCV compatibility)
Bitrate:      2–4 Mbps (CBR mode)
Night Vision: Enable IR, Auto IR cut
```

---

## 12. SSL / HTTPS Setup

```bash
# Install Certbot (free SSL from Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate (requires a domain name pointing to your server)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run

# Certbot auto-renews — confirm cron job exists:
sudo systemctl status certbot.timer
```

> For local network (no public domain), use a self-signed certificate:
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/tollai.key \
  -out /etc/ssl/certs/tollai.crt
```

---

## 13. Firewall Configuration

```bash
# Enable UFW firewall
sudo ufw enable

# Allow essential services
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS

# Block direct Flask access (only Nginx should access it)
sudo ufw deny 5002/tcp

# Allow MySQL only from localhost (and edge device if hybrid)
# sudo ufw allow from EDGE_DEVICE_IP to any port 3306

# Verify rules
sudo ufw status verbose
```

---

## 14. Maintenance & Monitoring

### Daily Image Cleanup (Cron)
```bash
# Delete vehicle images older than 30 days
crontab -e
# Add this line:
0 2 * * * find /home/tollai/tole/captured_vehicles -name "*.jpg" -mtime +30 -delete
```

### View Live Logs
```bash
# Flask server logs
sudo journalctl -u tollai-server -f

# AI Engine logs
sudo journalctl -u tollai-engine-cam1 -f

# Nginx access logs
sudo tail -f /var/log/nginx/access.log
```

### Database Backup (Daily)
```bash
# Add to crontab:
0 3 * * * mysqldump -u toll_user -pYourPassword toll_monitoring | \
    gzip > /home/tollai/backups/toll_$(date +\%Y\%m\%d).sql.gz

# Create backup directory
mkdir -p /home/tollai/backups
```

### Restart Services
```bash
sudo systemctl restart tollai-server
sudo systemctl restart tollai-engine-cam1
sudo systemctl restart nginx
```

---

## 15. Troubleshooting

### Camera stream not showing
```bash
# 1. Test RTSP URL
ffprobe rtsp://admin:pass@192.168.1.101:554/...

# 2. Check AI engine running
sudo systemctl status tollai-engine-cam1

# 3. Check AI engine logs for errors
sudo journalctl -u tollai-engine-cam1 -n 50
```

### Database connection failed
```bash
# 1. Check MySQL running
sudo systemctl status mysql

# 2. Test connection
mysql -u toll_user -p -h localhost toll_monitoring

# 3. Check .env file loaded
systemctl show tollai-server | grep EnvironmentFile
```

### High CPU / slow detection
```bash
# Check current CPU usage
htop

# Reduce frame processing rate in ai_engine.py:
# Increase YOLO_CONF_THRESHOLD from 0.45 to 0.55 (faster, slightly less accurate)

# Or switch back to lighter model:
# In .env: YOLO_MODEL=yolov8n.pt
```

### Dashboard blank / not loading
```bash
# 1. Check Nginx
sudo nginx -t
sudo systemctl restart nginx

# 2. Check Flask/Gunicorn
sudo systemctl status tollai-server
curl http://localhost:5002/api/config
```

### Port 5002 already in use
```bash
sudo lsof -i :5002
sudo kill -9 <PID>
sudo systemctl restart tollai-server
```

---

## Quick Reference Card

| Task | Command |
|---|---|
| Start all services | `sudo systemctl start tollai-server tollai-engine-cam1 nginx` |
| Stop all services | `sudo systemctl stop tollai-server tollai-engine-cam1` |
| View dashboard logs | `sudo journalctl -u tollai-server -f` |
| View AI engine logs | `sudo journalctl -u tollai-engine-cam1 -f` |
| Restart Nginx | `sudo systemctl restart nginx` |
| Backup database | `mysqldump -u toll_user -p toll_monitoring > backup.sql` |
| Clear demo data | `mysql -u toll_user -p -e "DELETE FROM vehicle_detections;" toll_monitoring` |
| Check disk space | `df -h` |
| Check RAM usage | `free -h` |
| Dashboard URL | `http://YOUR_SERVER_IP/` or `https://yourdomain.com/` |
| API health check | `curl http://localhost:5002/api/config` |

---

*TollAI Monitor — Built for Bangladesh highway toll operations*  
*YOLOv8s + EasyOCR + Flask + MySQL*
