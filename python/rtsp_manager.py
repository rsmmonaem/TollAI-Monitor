import cv2
import threading
import time
import logging
import os

logger = logging.getLogger(__name__)

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
        logger.info(f"Starting RTSP stream for Camera {cam_id}: {url}")
        os_env = 'rtsp_transport;tcp|timeout;4000000'
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        if hasattr(cv2, 'CAP_PROP_BUFFERSIZE'):
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        while self.running:
            with self.lock:
                if cam_id not in self.streams or not self.streams[cam_id]['active']:
                    break
            ret, frame = cap.read()
            if ret:
                with self.lock:
                    self.frames[cam_id] = frame
            else:
                time.sleep(1)
                cap.release()
                logger.warning(f"Reconnecting RTSP stream for Camera {cam_id}")
                cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
                if hasattr(cv2, 'CAP_PROP_BUFFERSIZE'):
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.release()
        logger.info(f"Stopped RTSP stream for Camera {cam_id}")

