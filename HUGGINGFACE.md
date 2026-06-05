# 🚀 Deploying TollAI Monitor to Hugging Face Spaces

This repository is fully configured for hosting on **Hugging Face Spaces** using Docker. 

When deployed, the space will:
1. Automatically run a self-contained **SQLite database** (replacing MySQL for serverless compatibility).
2. Download a sample freeway traffic video (`traffic.mp4`) and run the **YOLOv8 AI Engine** loop in the background.
3. Stream the live vehicle detection camera feed and update the dashboard statistics in real-time.

---

## Step-by-Step Deployment Guide

### Step 1: Create a Hugging Face Space
1. Log in to [Hugging Face](https://huggingface.co/).
2. Click on **Spaces** in the top navigation bar and click **Create new Space**.
3. Fill in the details:
   * **Space Name**: `toll-ai-monitor` (or any name you prefer)
   * **License**: `mit` (optional)
   * **SDK / Environment**: Select **Docker** (⚠️ *Crucial: Do not select Gradio/Streamlit*).
   * **Docker Template**: Select **Blank** (default).
   * **Space Hardware**: **CPU basic** (Free, 2 vCPUs, 16GB RAM) is completely sufficient.
   * **Visibility**: **Public** (or Private if you prefer).
4. Click **Create Space**.

---

### Step 2: Push your code to the Space
Hugging Face will give you a Git repository URL (e.g. `https://huggingface.co/spaces/username/toll-ai-monitor`). 

You can push your local code directly to Hugging Face using Git:

1. **Initialize Git** in your local project folder if you haven't already:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Hugging Face"
   ```

2. **Add Hugging Face as a remote** (replace with your actual HF Space URL):
   ```bash
   git remote add hf https://huggingface.co/spaces/YOUR_HF_USERNAME/YOUR_SPACE_NAME
   ```

3. **Push to Hugging Face**:
   ```bash
   git push -f hf master
   ```
   *(Note: Hugging Face default branch is `main` or `master`. If you get an error, try `git push -f hf main`)*

---

### Step 3: Wait for Build to Complete
Hugging Face will automatically detect the `Dockerfile` and begin building the container:
1. It installs the required graphics packages (`libgl1`, etc.) for OpenCV.
2. It installs all Python dependencies from `requirements.txt`.
3. It downloads the sample traffic video loop (`python/traffic.mp4`).
4. It starts the container using `entrypoint.sh`.

Once the build is complete (typically takes 2-3 minutes), your Space will show **Running**, and the interactive dashboard will load!

---

## How It Works in the Cloud
* **SQLite Fallback**: `db_adapter.py` detects that MySQL is not present in the cloud space and automatically sets up a local `toll_monitoring.db` file.
* **Continuous AI Detection Loop**: The AI Engine processes the video loop, inserts the detections into SQLite, and POSTs the annotated video frames to the Flask server.
* **Universal MJPEG Video**: The server converts the webcam/video frames to a continuous MJPEG stream. Anyone visiting the Space page sees the traffic video flowing live with real-time bounding boxes and the dashboard numbers climbing.
