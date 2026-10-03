import cv2
import threading
import time
import logging
import os
import re
import socket

logger = logging.getLogger(__name__)

# Configure OpenCV FFmpeg RTSP options with short connection timeout (2s)
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|stimeout;2000000|max_delay;500000'

def is_rtsp_reachable(url, timeout=1.5):
    """Fast non-blocking TCP check before calling cv2.VideoCapture to prevent 30-sec OS hangs."""
    try:
        m = re.match(r'rtsp://(?:[^:]+:[^@]+@)?([^:/]+)(?::(\d+))?', str(url))
        if not m:
            return True
        host = m.group(1)
        port = int(m.group(2)) if m.group(2) else 554
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False

class RTSPStreamManager:
    def __init__(self):
        self.streams = {}
        self.frames = {}
        self.lock = threading.Lock()
        self.running = True

    def start_stream(self, cam_id, url):
        with self.lock:
            if cam_id in self.streams:
                return
            self.streams[cam_id] = {'url': url, 'active': True}
            t = threading.Thread(target=self._reader_thread, args=(cam_id, url), daemon=True)
            t.start()

    def stop_stream(self, cam_id):
        with self.lock:
            if cam_id in self.streams:
                self.streams[cam_id]['active'] = False
                del self.streams[cam_id]
            if cam_id in self.frames:
                del self.frames[cam_id]

    def get_latest_frame(self, cam_id):
        with self.lock:
            return self.frames.get(cam_id)

    def _reader_thread(self, cam_id, url):
        while self.running:
            with self.lock:
                if cam_id not in self.streams or not self.streams[cam_id]['active']:
                    break

            # Fast TCP reachability check to prevent 30-sec OpenCV FFmpeg blocking hang
            if not is_rtsp_reachable(url, timeout=1.5):
                time.sleep(15)  # Backoff and re-check after 15 seconds
                continue

            logger.info(f"Opening RTSP stream for Camera {cam_id}: {url}")
            cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            if hasattr(cv2, 'CAP_PROP_BUFFERSIZE'):
                try:
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception:
                    pass

            if not cap.isOpened():
                cap.release()
                time.sleep(10)
                continue

            consecutive_failures = 0
            while self.running:
                with self.lock:
                    if cam_id not in self.streams or not self.streams[cam_id]['active']:
                        break
                ret, frame = cap.read()
                if ret and frame is not None:
                    consecutive_failures = 0
                    with self.lock:
                        self.frames[cam_id] = frame
                else:
                    consecutive_failures += 1
                    if consecutive_failures > 5:
                        break
                    time.sleep(0.1)

            cap.release()
            time.sleep(5)  # Backoff before reconnect

        logger.info(f"Stopped RTSP stream for Camera {cam_id}")


