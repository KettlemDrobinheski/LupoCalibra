import { browserSessionPersistence, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { getAuthentication, getDatabase } from './firebase.ts';
import type { SessionGateway } from './session.ts';
import { registrationEmail } from './registration.ts';

export const authGateway: SessionGateway = {
  watchAuth(receive, fail) {
    return onAuthStateChanged(getAuthentication(), user => receive(user ? { uid: user.uid, email: user.email } : null), fail);
  },
  watchProfile(uid, receive, fail) {
    return onSnapshot(doc(getDatabase(), 'acessos', uid), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) { receive(null); return; }
      receive(snapshot.exists() ? snapshot.data() : null);
    }, fail);
  },
};

export async function login(registration: string, password: string) {
  const email = registrationEmail(registration);
  const auth = getAuthentication();
  await setPersistence(auth, browserSessionPersistence);
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logout() { await signOut(getAuthentication()); }
