import admin from "firebase-admin";

// Note: docker-compose.yml pulls in the .env file when run in a container; this is only needed for local dev
require("dotenv").config();

console.log("Establishing connection to Firebase ...");

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : ""
    }),
    databaseURL: process.env.FIREBASE_DATABASE
});

export default admin.database();