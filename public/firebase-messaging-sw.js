/* eslint-disable no-undef */ 
// Firebase Messaging SW (minimal). The app page must initialize Firebase and call getToken.
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Initialize using values injected at build or .env (replace placeholders)
firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY || 'AIzaSyA9pi60hMi0yxA9KnA-zM3aTsYE1wINbOE',
  authDomain: self.FIREBASE_AUTH_DOMAIN || 'picnic-423500.firebaseapp.com',
  projectId: self.FIREBASE_PROJECT_ID || 'picnic-423500',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || '853406219989',
  appId: self.FIREBASE_APP_ID || '1:853406219989:web:9e6f90b09b314be2bcac5c',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Notification';
  const body = payload.notification?.body || '';
  const options = { body, data: payload.data };
  self.registration.showNotification(title, options);
});


