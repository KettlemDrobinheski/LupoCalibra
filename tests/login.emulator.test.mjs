import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { registrationEmail, registrationFromEmail } from '../lib/registration.ts';
import { authenticationMessage } from '../lib/access.ts';

const address = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!address || !/^(127\.0\.0\.1|localhost):\d+$/.test(address)) {
  throw new Error('Start the local Auth emulator for demo-lupocalibra-tests. No production fallback is allowed.');
}

test('registration login authenticates against Firebase Auth, preserves identity and rejects wrong credentials', async () => {
  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-lupocalibra-tests' }, `login-test-${randomUUID()}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${address}`, { disableWarnings: true });
  const registration = `00${Date.now()}`;
  const password = randomUUID();
  try {
    const created = await createUserWithEmailAndPassword(auth, registrationEmail(registration), password);
    const uid = created.user.uid;
    await signOut(auth);
    assert.equal(auth.currentUser, null);
    const signedIn = await signInWithEmailAndPassword(auth, registrationEmail(` ${registration} `), password);
    assert.equal(signedIn.user.uid, uid);
    assert.equal(registrationFromEmail(signedIn.user.email), registration);
    await signOut(auth);
    for (const [identifier, candidate] of [[registration, randomUUID()], [registration.slice(2), password]]) {
      await assert.rejects(signInWithEmailAndPassword(auth, registrationEmail(identifier), candidate), error => {
        assert.equal(authenticationMessage(error), 'Matrícula ou senha inválidos.');
        return true;
      });
      assert.equal(auth.currentUser, null);
    }
  } finally {
    await signOut(auth);
    await deleteApp(app);
  }
});
