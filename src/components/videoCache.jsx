// src/components/videoCache.jsx
const DB_NAME = "video-cache-db";
const STORE_NAME = "videos";

export async function getVideoBlob(key, videoUrl) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(key);

      getReq.onsuccess = async (ev) => {
        const blob = ev.target.result;
        if (blob) {
          console.log(`[cache] Hit for ${key}`);
          resolve(blob);
        } else {
          console.log(`[cache] Miss for ${key}, downloading...`);
          const resp = await fetch(videoUrl);
          const newBlob = await resp.blob();

          // Store it
          const tx2 = db.transaction(STORE_NAME, "readwrite");
          tx2.objectStore(STORE_NAME).put(newBlob, key);
          tx2.oncomplete = () => console.log(`[cache] Stored ${key}`);
          resolve(newBlob);
        }
      };
    };

    request.onerror = (err) => reject(err);
  });
}
