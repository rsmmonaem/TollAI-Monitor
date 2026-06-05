# Use official lightweight Python image
FROM python:3.10-slim

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for OpenCV, EasyOCR, and Curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside container
WORKDIR /app

# Copy python dependencies list and install them
COPY python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download a short sample traffic video for AI detection simulation in the cloud
RUN mkdir -p python && \
    (curl -L -o python/traffic.mp4 https://github.com/intel-iot-devkit/sample-videos/raw/master/free-way-traffic.mp4 || \
     curl -L -o python/traffic.mp4 https://raw.githubusercontent.com/intel-iot-devkit/sample-videos/master/free-way-traffic.mp4)

# Copy all project files into the container
COPY . .

# Ensure entrypoint script is executable
RUN chmod +x entrypoint.sh

# Expose the default Hugging Face Spaces port (7860)
EXPOSE 7860

# Set environment variable for port
ENV PORT=7860

# Run both the server and the AI engine on boot via entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
