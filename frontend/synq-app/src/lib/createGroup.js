// src/lib/createGroup.js
import { db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function createGroup({ createdBy, destination, originPoints, invitees }) {
  try {
    const groupRef = await addDoc(collection(db, "groups"), {
      createdBy,
      destination,
      originPoints: originPoints.map(pt => ({
        lat: parseFloat(pt.lat),
        lng: parseFloat(pt.lng)
      })),
      createdAt: serverTimestamp(),
      invitees: invitees.map(invitee => ({
        phoneNumber: invitee.phoneNumber,
        name: invitee.name || null,
        invitedAt: serverTimestamp(),
        joined: false,
        userId: invitee.userId || null
      })),
      rideStatus: "pending",
    });

    console.log("Group created with ID:", groupRef.id);
    return groupRef.id;
  } catch (e) {
    console.error("Error creating group:", e);
    throw e;
  }
}
