import React, { useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import "./Map.css";
import { db, auth } from "../firebaseConfig";
import { collection, getDocs, where, query, orderBy, documentId, limit, onSnapshot } from "firebase/firestore";
import carIcon from "../assets/car.png";
const API_URL = import.meta.env.VITE_API_URL;

const libraries = ["geometry", "marker"];
const containerStyle = { width: "100%", height: "100%" };
const center = { lat: -6.2, lng: 106.816666 };
const MAP_ID = "2b8757efac2172e4321a3e69";

import { signInAnonymously, onAuthStateChanged } from "firebase/auth";



export default function MapWithAdmin() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

useEffect(() => {
  const doAnonLogin = async () => {
    try {
      const userCredential = await signInAnonymously(auth);
      console.log("Anonymous user ID:", userCredential.user.uid);
    } catch (error) {
      console.error("Error with anonymous login:", error);
    }
  };

  const unsub = onAuthStateChanged(auth, (user) => {
    if (user?.isAnonymous) {
      console.log("User is browsing anonymously.");
    }
  });

  doAnonLogin();
  return () => unsub();
}, []);

const carsLocalRef = useRef([]);      // internal session datastore
const tempcarsLocalRef = useRef([]);

  const mapRef = useRef(null);
  const carsRef = useRef({}); // markers
  const unsubRef = useRef([]);

const [activeCarForPlaces, setActiveCarForPlaces] = useState(null);
  const [waypointInput, setWaypointInput] = useState("");
  const [newCarId, setNewCarId] = useState("");

const fileInputRef = useRef(null);
const [uploadingCarId, setUploadingCarId] = useState(null); // car id currently in overlay
const [selectedFile, setSelectedFile] = useState(null);
const [selectedFileName, setSelectedFileName] = useState("");
const [uploading, setUploading] = useState(false);
const [, forceRender] = useState({});




useEffect(() => {
  let intervalId;

  const fetchCars = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/listcars`);
      const data = await res.json();

      // sort both lists by ID to make sure order doesn’t matter
      const sortedLocal = [...(carsLocalRef.current || [])].sort((a, b) => a.id.localeCompare(b.id));
      const sortedNew = [...data].sort((a, b) => a.id.localeCompare(b.id));

      // simple deep comparison
      const isSame =
        sortedLocal.length === sortedNew.length &&
        sortedLocal.every((oldCar, i) =>
          oldCar.id === sortedNew[i].id &&
          oldCar.video === sortedNew[i].video &&
          JSON.stringify([...oldCar.places].sort()) === JSON.stringify([...sortedNew[i].places].sort())
        );
    
      if (!isSame) {
        carsLocalRef.current = sortedNew.map(c => ({
          id: c.id,
          places: c.places,
          video: c.video,
        }));
        forceRender({});
      }

    } catch (err) {
      console.error("Error fetching cars:", err);
    }
  };

  fetchCars();
  intervalId = setInterval(fetchCars, 5000);

  return () => clearInterval(intervalId);
}, []);


function VideoPlayer({ carId, src }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleLoadedMetadata = () => {
      videoEl.currentDuration = videoEl.duration;
    };

    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  return (
    <div className="video-wrapper">
      <video
        ref={videoRef}
        id={`video-${carId}`}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className="video-element"
        onPlay={() => {
          // mark as actively playing once successfully started
          videoRef.current.dataset.playing = "true";
        }}
      />
      <div className="video-overlay">
        <span>{carId}</span>
      </div>
    </div>
  );
}

const lastTripRef = useRef({});     // <-- new
const posUnsubRef = useRef({});     // <-- new
const videoSyncedRef = useRef({});

useEffect(() => {
  if (!isLoaded) return;

  const unsubTrips = onSnapshot(
    collection(db, "cars_latest_position"),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const doc = change.doc;
        const docId = doc.id; // full trip doc ID, e.g., "car1_20251104120000"
        const carId = docId.split("_")[0];
        const data = doc.data();

        if (change.type === "removed") {
          posUnsubRef.current[carId]?.();
          delete posUnsubRef.current[carId];
          return;
        }

        if (change.type === "added" || change.type === "modified") {
          if (lastTripRef.current[carId] === docId) return;
          lastTripRef.current[carId] = docId;

          posUnsubRef.current[carId]?.();
          delete posUnsubRef.current[carId];
          videoSyncedRef.current[carId] = false;

          const videoEl = document.getElementById(`video-${carId}`);
          if (!videoEl) return;

          const positionsRef = collection(
            db,
            "cars_latest_position",
            docId,
            "positions"
          );
          const posQuery = query(
            positionsRef,
            orderBy("timestamp", "desc"),
            limit(1)
          );

          const unsubscribePosition = onSnapshot(posQuery, (posSnap) => {
            if (posSnap.empty) return;

            const posData = posSnap.docs[0].data();
            if (!posData?.lat || !posData?.lng) return;

            updateCarMarker(carId, { lat: posData.lat, lng: posData.lng });

            const newestTs = new Date(posData.timestamp).getTime();
            const startTs = new Date(data.timestamp).getTime();

            if (!startTs || isNaN(startTs) || isNaN(newestTs)) return;

            // Calculate expected video time based on Firestore timestamps
            const elapsed = (newestTs - startTs) / 1000; // seconds
            const expectedTime = elapsed % videoEl.duration;

            // Jump directly to expected time if not synced
            if (!videoSyncedRef.current[carId]) {
              videoEl.currentTime = expectedTime;
              videoSyncedRef.current[carId] = true;
            }

            posUnsubRef.current[carId] = unsubscribePosition;
          });
        }
      });
    }
  );

  // Cleanup all listeners on unmount
  return () => {
    unsubTrips();
    Object.values(posUnsubRef.current).forEach((fn) => fn?.());
    posUnsubRef.current = {};
  };
}, [isLoaded]);


  const updateCarMarker = (carId, position) => {
    if (!window.google || !mapRef.current) return;

    const existing = carsRef.current[carId];
    if (!existing) {
      const carEl = document.createElement("img");
      carEl.src = carIcon;
      carEl.style.width = "40px";
      carEl.style.transformOrigin = "50% 50%";

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position,
        content: carEl,
        map: mapRef.current,
      });

      carsRef.current[carId] = { marker, carEl, lastPosition: position };
    } else {
      const { marker, carEl, lastPosition } = existing;
      const start = new window.google.maps.LatLng(lastPosition.lat, lastPosition.lng);
      const end = new window.google.maps.LatLng(position.lat, position.lng);
      const heading = window.google.maps.geometry.spherical.computeHeading(start, end) + 90;

      carEl.style.transform = `translate(-50%, -50%) rotate(${heading}deg)`;
      marker.position = position;
      carsRef.current[carId].lastPosition = position;
    }
  };


const handleAddCar = () => {
  // Determine next car ID based on local datastore
  const allIds = [
    ...carsLocalRef.current.map(c => c.id),
    ...tempcarsLocalRef.current.map(c => c.id)
  ];

  // Extract numeric parts of IDs
  const nums = allIds
    .map(id => parseInt(id.replace(/^car/, ""), 10))
    .filter(n => !isNaN(n));

  // Find next available number
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  const newCarId = `car${nextNum}`;


  // Create new car object
  const newCar = {
    id: newCarId,
    places: [],
    video: null
  };

  // Update local datastore
  tempcarsLocalRef.current.push(newCar);
  forceRender({});

};

const handleRemoveCar = async (carId) => {
  const carExists = carsLocalRef.current.some(c => c.id === carId);

  // Remove car from local datastore
  tempcarsLocalRef.current = tempcarsLocalRef.current.filter(c => c.id !== carId);

  // Inform backend only if car existed
  if (carExists) {
    try {
      await fetch(`${API_URL}/removecar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carId }),
      });
    } catch (err) {
      console.error("removecar failed", err);
    }
  }
  forceRender({});

};

const handleAddPlaces = async (carId) => {
  const trimmed = waypointInput.trim();
  if (!trimmed) return;

  // Extract quoted places
  const regex = /"([^"]+)"/gs;
  const places = [];
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    places.push(match[1].trim());
  }

  if (places.length === 0) {
    alert('Please wrap each place name in double quotes.');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/addplaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carId, places }),
    });

    if (!res.ok) throw new Error("Add places request failed");


    if (tempcarsLocalRef.current.some(c => c.id === carId)) {
      tempcarsLocalRef.current = tempcarsLocalRef.current.filter(c => c.id !== carId);
    }

  } catch (err) {
    console.error("Add places failed:", err);
    alert("Failed to add places. Check console.");
  } finally {
    setWaypointInput("");
    setActiveCarForPlaces(null);
    forceRender({});
  }
};

// When user clicks a car in submenu, open overlay for that car:
const openVideoOverlay = (carId) => {
  setUploadingCarId(carId);
  setSelectedFile(null);
  setSelectedFileName("");
};


// Choose file button: trigger hidden input
const handleChooseFile = () => {
  fileInputRef.current && fileInputRef.current.click();
};

// File change handler (only triggered once when user picks file)
const handleFileChange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  setSelectedFile(f);
  setSelectedFileName(f.name);
};

// Submit (upload) handler — sends file + carId to backend
const handleSubmitUpload = async () => {
  if (!selectedFile || !uploadingCarId) return alert("Please choose a file first");

  const formData = new FormData();
  formData.append("carId", uploadingCarId);
  formData.append("video", selectedFile);

  setUploading(true);

  try {
    const res = await fetch(`${API_URL}/video/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Upload failed");
   
  
  // close overlay & cleanup
    setUploadingCarId(null);
    setSelectedFile(null);
    setSelectedFileName("");
     if (tempcarsLocalRef.current.some(c => c.id === uploadingCarId)) {
      tempcarsLocalRef.current = tempcarsLocalRef.current.filter(
        c => c.id !== uploadingCarId
      );
    }

  } catch (err) {
    console.error("Upload error:", err);
    alert("Upload failed. See console for details.");
  } finally {
    setUploading(false);
    // reset input so same file can be selected again later
    if (fileInputRef.current) fileInputRef.current.value = "";
    forceRender({});
  }
};

// Cancel overlay
const closeVideoOverlay = () => {
  setUploadingCarId(null);
  setSelectedFile(null);
  setSelectedFileName("");
  if (fileInputRef.current) fileInputRef.current.value = "";
};


  if (!isLoaded) return <div className="loader">Loading map...</div>;

  const videoCars = carsLocalRef.current.filter((c) => c.video !== null);
  const gridItems = [
    { type: "map" },
    ...videoCars.map((c) => ({ type: "video", carId: c.id, video: c.video })),
  ];

  return (
    <div className="page-container">
      {/* Top-right page menu */}
     <div className="top-container">
      <div className="top-right-page-menu">

        <div className="addcarbtn">
  <button className="addcar-btn" onClick={handleAddCar}>Add Car</button>
</div>

<div className="removecarbtn">
  <button className="removecar-btn">Remove Car</button>
  <div className="submenuremovecar">
    {[
      ...carsLocalRef.current,
      ...(tempcarsLocalRef.current.length ? tempcarsLocalRef.current : [])
    ].map(c => (
      <button
        className="submenu-removecar"
        key={c.id}
        onClick={() => handleRemoveCar(c.id)}
      >
        {c.id}
      </button>
    ))}
  </div>
</div>

<div className="addplacesbtn">
  <button className="addplaces-btn">Add Places</button>
  <div className="submenuaddplaces">
    {[
      ...carsLocalRef.current,
      ...(tempcarsLocalRef.current.length ? tempcarsLocalRef.current : [])
    ]
      .filter(c => !c.places || c.places.length === 0)
      .map(c => (
        <button
          className="submenu-addplaces"
          key={c.id}
          onClick={() => setActiveCarForPlaces(c.id)}
        >
          {c.id}
        </button>
      ))}
  </div>
</div>


{/* Floating textarea overlay */}
{activeCarForPlaces && (
  <div className="floating-overlay-textarea" onClick={() => setActiveCarForPlaces(null)}>
    <div className="floating-input-textarea" onClick={(e) => e.stopPropagation()}>
      <textarea className="textarea"
        value={waypointInput}
        onChange={(e) => setWaypointInput(e.target.value)}
      />
     <div className="submitcancel-btnplaces">
      <button
          className="cancel-btnplaces"
          onClick={() => {
            setActiveCarForPlaces(null);
            setWaypointInput("");
          }}
        >
          Cancel
        </button>
        <button
        className="submit-btnplaces"
        onClick={() => handleAddPlaces(activeCarForPlaces)}
      >
        Submit
      </button>
         
    </div>
    </div>
  </div>
)}

<div className="addvideobtn">
  <button className="addvideo-btn">Add Video</button>
  <div className="submenuaddvideo">
    {[
      ...carsLocalRef.current,
      ...(tempcarsLocalRef.current.length ? tempcarsLocalRef.current : [])
    ]
      .filter(c => !c.video) // show only cars with no video
      .map(c => (
        <button
          className="submenu-addvideo"
          key={c.id}
          onClick={() => openVideoOverlay(c.id)}
        >
          {c.id}
        </button>
      ))}
  </div>
</div>

{/* Floating upload overlay (choose file + submit) */}
{uploadingCarId && (
  <div className="floating-overlay-video" onClick={closeVideoOverlay}>
    <div className="floating-input-video" onClick={(e) => e.stopPropagation()}>
      <div className="choosefilediv">
        <button className="choosefilebutton" onClick={handleChooseFile}>
          Choose file
        </button>

        <div className="selectedfilediv">
          {selectedFileName ? (
            <div className="selectedfilenamediv">
              {selectedFileName}
            </div>
          ) : (
            <div className="nofilechosendiv">No file chosen</div>
          )}
        </div>
       </div>

        <button
          className="submit-btnvideo"
          onClick={handleSubmitUpload}
          disabled={!selectedFile || uploading}
        >
          {uploading ? "Uploading…" : "Submit"}
        </button>

        <button className="cancel-btnvideo" onClick={closeVideoOverlay} >
          Cancel
        </button>
      

      {/* Hidden file input controlled by ref */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/m4v"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  </div>
)}

      </div>
     </div>
    
  {/* Bottom Section (map and videos) */}
    <div className="bottom-container">
  <div className="flexible-grid">
    {gridItems.map((item, idx) => (
      <div key={item.carId} className="grid-cell">
        {item.type === "map" ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={13}
            options={{ mapId: MAP_ID }}
            onLoad={(map) => (mapRef.current = map)}
          />
        ) : (
          <VideoPlayer carId={item.carId} src={`${API_URL}/stream/${item.video}`} />
        )}
      </div>
    ))}
      </div>
    </div>
   </div>
  );
}
