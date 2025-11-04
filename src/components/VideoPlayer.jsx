import { useEffect, useRef } from "react";
import { getVideoBlob } from "./videoCache";

const VideoPlayer = ({ carId, src }) => {
  const videoRef = useRef();
   console.log("sourcenya", src);
  useEffect(() => {
    if (!src || !carId) return;

    const key = carId;
    const videoEl = videoRef.current;

    const loadVideo = async () => {
      console.log(`[${carId}] Checking IndexedDB for ${key}`);
      const blob = await getVideoBlob(key, src); // fetch + cache
      videoEl.src = URL.createObjectURL(blob);
     console.log("print blob", blob.size, blob.type);

      videoEl.onloadeddata = () => {
        console.log(`[${carId}] Video loaded`);
        videoEl.muted = true;
        videoEl.loop = false;
        videoEl.play().catch(err => console.warn(err.message));
      };
    };

    loadVideo();
  }, [src, carId]);

  return (
     <div className="video-wrapper">
 <video ref={videoRef} 
         id={`video-${carId}`}
        autoPlay
        playsInline
        className="video-element" />
 <div className="video-overlay">
        <span>{carId}</span>
      </div>
    </div>
  );

};

export default VideoPlayer;
