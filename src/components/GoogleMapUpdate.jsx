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
  const lastTripRef = useRef({});
  const posUnsubRef = useRef({});

  // 🔥 LOCAL force update (MAP ONLY)
  const [, forceUpdate] = useState(0);
  const bump = () => forceUpdate((n) => n + 1);

  useEffect(() => {
    if (!isLoaded) return;

    const unsubTrips = onSnapshot(
      collection(db, "cars_latest_position"),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const doc = change.doc;
          const docId = doc.id;
          const carId = docId.split("_")[0];
          const data = doc.data();

          // ❌ REMOVED CAR
          if (change.type === "removed") {
            posUnsubRef.current[carId]?.();
            delete posUnsubRef.current[carId];

            const existing = carsRef.current[carId];
            if (existing) {
              existing.marker.map = null;
              delete carsRef.current[carId];
              bump(); // 🔥 update map component only
            }
            return;
          }

          // ✅ NEW / MODIFIED TRIP
          if (change.type === "added" || change.type === "modified") {
            if (lastTripRef.current[carId] === docId) return;
            lastTripRef.current[carId] = docId;

            posUnsubRef.current[carId]?.();
            delete posUnsubRef.current[carId];

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

            const unsubPos = onSnapshot(posQuery, (snap) => {
              if (snap.empty) return;

              const pos = snap.docs[0].data();
              if (!pos?.lat || !pos?.lng) return;

              updateCarMarker(carId, {
                lat: pos.lat,
                lng: pos.lng
              });
            });

            posUnsubRef.current[carId] = unsubPos;
          }
        });
      }
    );

    return () => {
      unsubTrips();
      Object.values(posUnsubRef.current).forEach((fn) => fn?.());
      posUnsubRef.current = {};
    };
  }, [isLoaded]);

  const updateCarMarker = (carId, position) => {
    if (!window.google || !mapRef.current) return;

    const existing = carsRef.current[carId];

    // 🆕 CREATE MARKER
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

      bump(); // 🔥 force update map only
      return;
    }

    // 🔁 MOVE MARKER (NO React update)
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
      window.google.maps.geometry.spherical.computeHeading(
        start,
        end
      ) + 90;

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
      onLoad={(map) => (mapRef.current = map)}
    />
  );
}

export default memo(GoogleMapUpdate);
