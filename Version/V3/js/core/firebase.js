import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from '../config/firebase-config.js';

export const isConfigured = !Object.values(firebaseConfig).some(v => String(v).includes('COLLER_ICI'));
export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app && getAuth(app);
export const db = app && getDatabase(app);
