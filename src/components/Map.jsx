import React, { useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import "./Map.css";
import { db, auth } from "../firebaseConfig";
import { collection, getDocs, where, query, orderBy, documentId, limit, onSnapshot } from "firebase/firestore";
import carIcon from "../assets/car.png";
import GoogleMapUpdate from "./GoogleMapUpdate";
import VideoComp from "./VideoComp";


const API_URL = import.meta.env.VITE_API_URL;

const libraries = ["geometry", "marker"];
const containerStyle = { width: "100%", height: "100%" };
const center = { lat: -6.2, lng: 106.816666 };
const MAP_ID = "2b8757efac2172e4321a3e69";

import { signInAnonymously, onAuthStateChanged } from "firebase/auth";

export default function MapWithAdmin() {
const [showAddCarDialog, setShowAddCarDialog] = useState(false);
const [carIdInput, setCarIdInput] = useState("");
const [carIdError, setCarIdError] = useState("");


  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

const refreshCars = async () => {
  try {
    const res = await fetch(`${API_URL}/listcars`);
    const data = await res.json();
    carsLocalRef.current = data.map(c => ({
      id: c.id,
      places: c.places,
      video: c.video,
    }));
    forceRender({});
    console.log("carsLocalRef refreshed", carsLocalRef.current);
  } catch (err) {
    console.error("Error fetching cars:", err);
  }
};


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
   refreshCars();
  doAnonLogin();
  return () => unsub();
}, []);

const carsLocalRef = useRef([]);      // internal session datastore
const tempcarsLocalRef = useRef([]);

  const mapRef = useRef(null);
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


const submitAddCar = async () => {
  const carId = carIdInput.trim();
  if (!carId) {
    setCarIdError("Car ID cannot be empty");
    return;
  }

  setShowAddCarDialog(false);
  setCarIdInput("");
  setCarIdError("");
  forceRender({});

  try {
    const res = await fetch(`${API_URL}/registercar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carId }),
    });

    if (!res.ok) {
      const data = await res.json();
      console.error("registercar rejected:", data.error);
      // ❌ do NOT revert UI here — polling will reconcile
    }

  } catch (err) {
    console.error("registercar failed", err);
  }
    finally {
    refreshCars(); // ✅ immediately update submenu
  }
};


const handleRemoveCar = async (carId) => {
  const carExists = carsLocalRef.current.some(c => c.id === carId);

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
     finally {
    refreshCars(); // ✅ immediately update submenu
  }
  }
  forceRender({});

};

const generateNextCarId = () => {
  const allIds = [
    ...carsLocalRef.current.map(c => c.id),
    ...tempcarsLocalRef.current.map(c => c.id),
  ];

  const nums = allIds
    .map(id => parseInt(id.replace(/^car/, ""), 10))
    .filter(n => !isNaN(n));

  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  return `car${nextNum}`;
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


  } catch (err) {
    console.error("Add places failed:", err);
    alert("Failed to add places. Check console.");
  } finally {
    setWaypointInput("");
    setActiveCarForPlaces(null);
      refreshCars(); // 
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
  
  } catch (err) {
    console.error("Upload error:", err);
    alert("Upload failed. See console for details.");
  } finally {
    setUploading(false);
    // reset input so same file can be selected again later
    if (fileInputRef.current) fileInputRef.current.value = "";
   refreshCars();    
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

const mergedCars = [ ...carsLocalRef.current];

const videoCars = mergedCars.filter(
  c => c.video && c.video.length
);

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
<button
  className="addcar-btn"
  onClick={() => {    setCarIdInput("");
    setCarIdError("");
    setShowAddCarDialog(true);
  }}
>
  Add Car
</button>
</div>

<div className="removecarbtn">
  <button className="removecar-btn">Remove Car</button>
  <div className="submenuremovecar">
     {mergedCars.map(c => (
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
   { mergedCars
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
  { mergedCars
     .filter(c => !c.video || (Array.isArray(c.video) && c.video.length === 0)) // show only cars with no video
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
  {gridItems.map((item) => (
    <div
      key={item.type === "map" ? "MAP_STATIC" : `VIDEO_${item.carId}`}
      className="grid-cell"
    >
      {item.type === "map" ? (
        <GoogleMapUpdate isLoaded={isLoaded} />
      ) : (
        <VideoComp
          carId={item.carId}
          src={item.video[0].filename}
        />
      )}
    </div>
  ))}
</div>

   </div>

{showAddCarDialog && (
  <div className="floating-overlay-video" onClick={() => setShowAddCarDialog(false)}>
    <div
      className="floating-input-video"
      onClick={(e) => e.stopPropagation()}
    >
      <h3>Add Car</h3>

      <input
        type="text"
        className="carid-input"
        placeholder="Enter car ID (e.g. car12, taxiA)"
        value={carIdInput}
        onChange={(e) => {
          setCarIdInput(e.target.value);
          setCarIdError("");
        }}
      />

      {carIdError && (
        <div className="error-text">{carIdError}</div>
      )}

      <div className="dialog-buttons">
        <button
          className="generate-btn"
          onClick={() => {
            setCarIdInput(generateNextCarId());
            setCarIdError("");
          }}
        >
          Generate
        </button>

        <button
          className="submit-btnvideo"
          onClick={submitAddCar}
        >
          Submit
        </button>

        <button
          className="cancel-btnvideo"
          onClick={() => setShowAddCarDialog(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}

   </div>
  );
}

