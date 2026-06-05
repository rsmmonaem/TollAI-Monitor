/**
 * assets/js/webcam.js
 * Frontend module for browser webcam capturing and real-time upload to AI server
 */

const WebcamModule = (() => {
  const activeStreams = {};
  const activeIntervals = {};

  async function startWebcam(cameraId) {
    const btn = document.getElementById(`webcam-btn-${cameraId}`);
    const statusText = document.getElementById(`webcam-status-${cameraId}`);

    if (statusText) {
      statusText.textContent = 'Requesting access...';
      statusText.style.color = '#fbbf24'; // Warning amber
    }

    try {
      // 1. Request camera media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          facingMode: 'user'
        }
      });

      // 2. Cache the stream
      activeStreams[cameraId] = stream;

      // 3. Create a hidden video element to play the stream
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play();

      // 4. Create a hidden canvas for capturing frames
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');

      // 5. Start frame upload loop (~6 frames per second to prevent network choking)
      const uploadInterval = setInterval(() => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) return;

            // Upload the raw frame to Flask backend
            fetch(`/api/camera/${cameraId}/raw_upload`, {
              method: 'POST',
              body: blob,
              headers: { 'Content-Type': 'image/jpeg' }
            }).catch(err => {
              console.error(`[Webcam-${cameraId}] Upload failed:`, err);
            });
          }, 'image/jpeg', 0.7); // 70% quality JPEG is enough for YOLO
        }
      }, 160);

      activeIntervals[cameraId] = uploadInterval;

      // 6. Update UI to Active state
      if (btn) {
        btn.innerHTML = '<i class="bi bi-camera-video-off-fill"></i> Stop Browser Webcam';
        btn.style.background = 'rgba(239, 68, 68, 0.2)'; // Glass red
        btn.style.color = '#f87171';
        btn.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      }

      if (statusText) {
        statusText.textContent = 'Streaming to AI';
        statusText.style.color = '#34d399'; // Success green
      }

      if (window.App && window.App.toast) {
        window.App.toast(`🎥 Browser Webcam active on Camera ${cameraId}`, 'success');
      }

    } catch (error) {
      console.error('[Webcam] Error accessing camera:', error);
      if (statusText) {
        statusText.textContent = 'Permission Denied';
        statusText.style.color = '#f87171'; // Error red
      }
      if (window.App && window.App.toast) {
        window.App.toast('❌ Could not access camera. Ensure HTTPS or localhost is used.', 'error');
      }
    }
  }

  function stopWebcam(cameraId) {
    // 1. Clear interval loop
    if (activeIntervals[cameraId]) {
      clearInterval(activeIntervals[cameraId]);
      delete activeIntervals[cameraId];
    }

    // 2. Stop camera stream tracks
    if (activeStreams[cameraId]) {
      activeStreams[cameraId].getTracks().forEach(track => track.stop());
      delete activeStreams[cameraId];
    }

    // 3. Reset UI
    const btn = document.getElementById(`webcam-btn-${cameraId}`);
    const statusText = document.getElementById(`webcam-status-${cameraId}`);

    if (btn) {
      btn.innerHTML = '<i class="bi bi-camera-video-fill"></i> Start Browser Webcam';
      btn.style.background = 'rgba(59, 130, 246, 0.15)'; // Glass blue
      btn.style.color = '#60a5fa';
      btn.style.borderColor = 'rgba(59, 130, 246, 0.25)';
    }

    if (statusText) {
      statusText.textContent = 'Inactive';
      statusText.style.color = 'var(--text-muted)';
    }

    if (window.App && window.App.toast) {
      window.App.toast(`📴 Browser Webcam stopped on Camera ${cameraId}`, 'info');
    }
  }

  function toggleWebcam(cameraId) {
    if (activeStreams[cameraId]) {
      stopWebcam(cameraId);
    } else {
      startWebcam(cameraId);
    }
  }

  // Ensure cleanup on page unload/navigation
  window.addEventListener('beforeunload', () => {
    Object.keys(activeStreams).forEach(id => stopWebcam(id));
  });

  return {
    toggleWebcam,
    stopWebcam
  };
})();

window.WebcamModule = WebcamModule;
