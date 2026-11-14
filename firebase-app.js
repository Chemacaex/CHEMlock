// Conexión de CHEMlock con Firebase: inicio de sesión y base de datos (Firestore).
// Expone a la app la misma interfaz de base de datos que usaba la versión de Claude.
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const overlay = document.getElementById("login");
const errBox = document.getElementById("lerr");
const showErr = msg => { errBox.textContent = msg; errBox.hidden = !msg; };

if (!firebaseConfig || !firebaseConfig.apiKey) {
  overlay.hidden = false;
  document.getElementById("lform").hidden = true;
  showErr("La app aún no está conectada a Firebase.");
} else {
  start();
}

function start() {
  const app = initializeApp(firebaseConfig);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  let fs;
  try { fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) }); }
  catch { fs = initializeFirestore(app, {}); }

  const ERR = {
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "No hay ninguna cuenta con ese correo. Pulsa «Crear cuenta».",
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Pulsa «Entrar».",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-email": "Ese correo no es válido.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento y vuelve a probar.",
    "auth/network-request-failed": "Sin conexión. Comprueba internet y vuelve a probar."
  };
  const say = e => showErr(ERR[e && e.code] || "No se pudo entrar. Vuelve a probar.");
  const email = () => document.getElementById("lemail").value.trim();
  const pass = () => document.getElementById("lpass").value;

  document.getElementById("lform").addEventListener("submit", e => {
    e.preventDefault(); showErr("");
    signInWithEmailAndPassword(auth, email(), pass()).catch(say);
  });
  document.getElementById("lnew").addEventListener("click", () => {
    showErr("");
    if (!email() || pass().length < 6) { showErr("Escribe tu correo y una contraseña de al menos 6 caracteres."); return; }
    createUserWithEmailAndPassword(auth, email(), pass()).catch(say);
  });
  document.getElementById("lreset").addEventListener("click", () => {
    if (!email()) { showErr("Escribe tu correo arriba y vuelve a pulsar."); return; }
    sendPasswordResetEmail(auth, email()).then(() => showErr("Te hemos enviado un correo para cambiar la contraseña.")).catch(say);
  });

  let resolved = false;
  onAuthStateChanged(auth, user => {
    if (!user) { if (resolved) location.reload(); else overlay.hidden = false; return; }
    overlay.hidden = true;
    if (resolved) return;
    resolved = true;
    const base = ["users", user.uid];
    const wrap = s => ({ docs: s.docs.map(d => ({ id: d.id, data: () => d.data() })) });
    const db = {
      collection: name => ({
        onSnapshot: (cb, err) => onSnapshot(collection(fs, ...base, name), s => cb(wrap(s)), err),
        doc: id => {
          const ref = doc(fs, ...base, name, id);
          return { set: d => setDoc(ref, d), update: d => updateDoc(ref, d), delete: () => deleteDoc(ref) };
        }
      }),
      doc: path => {
        const [c, i] = path.split("/");
        const ref = doc(fs, ...base, c, i);
        return { onSnapshot: (cb, err) => onSnapshot(ref, s => cb({ exists: s.exists(), data: () => s.data() }), err), set: d => setDoc(ref, d) };
      }
    };
    window.chemlock = {
      email: () => user.email,
      logout: () => signOut(auth).then(() => location.reload()),
      importFile: async file => {
        const data = JSON.parse(await file.text());
        const writes = [];
        for (const col of ["games", "config", "log"]) for (const [id, d] of Object.entries(data[col] || {})) writes.push([col, id, d]);
        if (!writes.length) throw new Error("Archivo vacío");
        for (let i = 0; i < writes.length; i += 400) {
          const b = writeBatch(fs);
          writes.slice(i, i + 400).forEach(([c, id, d]) => b.set(doc(fs, ...base, c, id), d));
          await b.commit();
        }
        return writes.filter(w => w[0] === "games").length;
      }
    };
    window.__chemlockResolveDb(db);
  });
}
