import { memo, useEffect, useRef, useState } from "react";
import { GoogleMap } from "@react-google-maps/api";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit
} from "firebase/firestore";
import carIcon from "../assets/car.png";

const containerStyle = { width: "100%", height: "100%" };
const center = { lat: -6.2, lng: 106.816666 };
const MAP_ID = "2b8757efac2172e4321a3e69";

function GoogleMapUpdate({ isLoaded }) {
  const mapRef = useRef(null);

  const carsRef = useRef({});
  const activeTripRef = useRef({});
  const posUnsubRef = useRef({});

  const [, forceUpdate] = useState(0);
  const bump = () => forceUpdate(n => n + 1);

  useEffect(() => {
    if (!isLoaded) return;

    const unsubTrips = onSnapshot(
      collection(db, "cars_latest_position"),
      snapshot => {
        snapshot.docChanges().forEach(change => {
          const doc = change.doc;
          const docId = doc.id;

          // 🔴 STABLE carId (DO NOT PARSE RANDOMLY)
          const carId = docId.split("_")[0];

          // ❌ CAR REMOVED
          if (change.type === "removed") {
            posUnsubRef.current[docId]?.();
            delete posUnsubRef.current[docId];

            const existing = carsRef.current[carId];
            if (existing) {
              existing.marker.map = null;
              delete carsRef.current[carId];
              bump();
            }
            return;
          }

          // ✅ ONLY ACCEPT NEW TRIP FOR SAME CAR
          if (
            (change.type === "added" || change.type === "modified") &&
            activeTripRef.current[carId] === docId
          ) {
            return;
          }

          // 🔁 SWITCH ACTIVE TRIP FOR THIS CAR
          activeTripRef.current[carId] = docId;

          // 🔥 STOP OLD POSITION LISTENER FOR SAME CAR
          posUnsubRef.current[carId]?.();

          const posQuery = query(
            collection(db, "cars_latest_position", docId, "positions"),
            orderBy("timestamp", "desc"),
            limit(1)
          );

          posUnsubRef.current[carId] = onSnapshot(posQuery, snap => {
            if (snap.empty) return;
            const { lat, lng } = snap.docs[0].data();
            if (!lat || !lng) return;
            updateCarMarker(carId, { lat, lng });
          });
        });
      }
    );

    return () => {
      unsubTrips();
      Object.values(posUnsubRef.current).forEach(fn => fn?.());
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

      const marker =
        new window.google.maps.marker.AdvancedMarkerElement({
          position,
          content: carEl,
          map: mapRef.current
        });

      carsRef.current[carId] = {
        marker,
        carEl,
        lastPosition: position
      };

      bump();
      return;
    }

    const { marker, carEl, lastPosition } = existing;

    const start = new window.google.maps.LatLng(
      lastPosition.lat,
      lastPosition.lng
    );
    const end = new window.google.maps.LatLng(
      position.lat,
      position.lng
    );

    const heading =
      window.google.maps.geometry.spherical.computeHeading(start, end) + 90;

    carEl.style.transform = `translate(-50%, -50%) rotate(${heading}deg)`;
    marker.position = position;
    existing.lastPosition = position;
  };

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={13}
      options={{ mapId: MAP_ID }}
      onLoad={map => (mapRef.current = map)}
    />
  );
}

export default memo(GoogleMapUpdate);
