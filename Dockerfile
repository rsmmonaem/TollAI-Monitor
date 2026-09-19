# Use official lightweight Python image
FROM python:3.10-slim

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for OpenCV, EasyOCR, Curl, pkill, and networking
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    procps \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Set writable directories for Ultralytics, PyTorch, and EasyOCR models
ENV YOLO_CONFIG_DIR=/tmp/Ultralytics
ENV TORCH_HOME=/tmp/torch
ENV EASYOCR_MODULE_PATH=/tmp/.EasyOCR
ENV PYTHONPATH=/app/python:/app
RUN mkdir -p /tmp/Ultralytics /tmp/torch /tmp/.EasyOCR && chmod -R 777 /tmp

# Set working directory inside container
WORKDIR /app

# Copy python dependencies list and install them
COPY python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download sample traffic video for AI detection simulation in the cloud
RUN mkdir -p python && \
    curl -L -o python/traffic.mp4 https://raw.githubusercontent.com/imkevinabraham/traffic_analysis/master/traffic.mp4 && \
    cp python/traffic.mp4 traffic.mp4

# Copy all project files into the container
COPY . .

# Ensure demo video is available at root as well
RUN cp python/traffic.mp4 traffic.mp4 2>/dev/null || true

# Ensure entrypoint script is executable
RUN chmod +x entrypoint.sh

# Expose the default Hugging Face Spaces port (7860)
EXPOSE 7860

# Set environment variable for port
ENV PORT=7860

# Run both the server and the AI engine on boot via entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
