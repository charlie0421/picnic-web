/* eslint-disable no-undef */
// Firebase Messaging SW (minimal). The app page must initialize Firebase and call getToken.
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Initialize using values injected at build or .env (replace placeholders)
firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY || 'REPLACE_ME',
  authDomain: self.FIREBASE_AUTH_DOMAIN || 'REPLACE_ME',
  projectId: self.FIREBASE_PROJECT_ID || 'REPLACE_ME',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || 'REPLACE_ME',
  appId: self.FIREBASE_APP_ID || 'REPLACE_ME',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Notification';
  const body = payload.notification?.body || '';
  const options = { body, data: payload.data };
  self.registration.showNotification(title, options);
});


