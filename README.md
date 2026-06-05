---
title: TollAI Monitor
emoji: 🚘
colorFrom: gray
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# 🚀 TollAI Monitor

An AI-powered Toll & Lease Collection Monitoring System with automated vehicle detection, Bengali/English license plate recognition (YOLOv8 + EasyOCR), and real-time dashboard analytics.

## Features
- **Live Video Feed**: Direct stream of toll lane cameras with real-time AI vehicle bounding boxes and license plate crops.
- **Dynamic Database Fallback**: Automatically sets up and uses a SQLite database in cloud environments, ensuring serverless portability.
- **Real-Time Analytics**: Dashboard stats (revenue, vehicle count, vehicle type distribution) climbing instantly as the AI processes the loop.
- **Audit & Fraud Detection**: Automated discrepancy and fraud recommendation tools.

## How it Runs
This Space builds via **Docker** (port 7860) and executes both the Flask web server and the YOLO detection loop concurrently on container startup.
