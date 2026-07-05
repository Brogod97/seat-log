// Firebase 초기화 (기기 간 동기화용)
// apiKey 등은 클라이언트 식별자라 공개돼도 안전 — 실제 접근 제어는 Firestore 보안 규칙이 담당
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyBSGyPUvK_lFtFqDbdv36gl-WRL6koNC0A',
  authDomain: 'seat-log-f8b53.firebaseapp.com',
  projectId: 'seat-log-f8b53',
  storageBucket: 'seat-log-f8b53.firebasestorage.app',
  messagingSenderId: '400695562910',
  appId: '1:400695562910:web:8c078080f4ddb1671d618f',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)
