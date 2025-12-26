import { memo, useEffect, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function VideoComp({ carId, src }) {
  const videoRef = useRef(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!src) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchSignedUrl = async () => {
      try {
        const res = await fetch(
          `${API_URL}/video/url/${encodeURIComponent(src)}`
        );
        const data = await res.json();

        if (!data.url) {
          console.error("❌ No signed URL returned for", src);
          return;
        }

        const videoEl = videoRef.current;
        if (!videoEl) return;

        videoEl.src = data.url;
        videoEl.load();

        videoEl.onloadedmetadata = () => {
          videoEl.currentTime = 0;
          videoEl.play().catch(() => {});
        };

        console.log("🎬 Video attached:", carId);
      } catch (err) {
        console.error("❌ Failed to fetch signed URL:", err);
      }
    };

    fetchSignedUrl();
  }, []); // 🚫 DO NOT add deps

  return (
    <div className="video-wrapper">
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        className="video-element"
      />
      <div className="video-overlay">
        <span>{carId}</span>
      </div>
    </div>
  );
}

export default memo(VideoComp);
