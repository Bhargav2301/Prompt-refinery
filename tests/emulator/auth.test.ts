import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, sendEmailVerification, applyActionCode, reload, sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset, signInWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut } from 'firebase/auth';

test('verification, one-use reset links, and old-password reauthentication work end to end', async () => {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  assert.ok(host, 'Only run this test in the Auth emulator; never send real email');
  const projectId = 'demo-clarift-auth';
  const app = initializeApp({ apiKey: 'emulator-key', projectId }); const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });
  const email = `test-${Date.now()}@example.test`;
  async function code(type: string) {
    const result = await fetch(`http://${host}/emulator/v1/projects/${projectId}/oobCodes`).then(response => response.json());
    return result.oobCodes.filter((item: { email: string; requestType: string }) => item.email === email && item.requestType === type).at(-1).oobCode;
  }
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, 'Original-Password-123');
    await sendEmailVerification(user); await applyActionCode(auth, await code('VERIFY_EMAIL')); await reload(user); assert.equal(user.emailVerified, true);
    await sendPasswordResetEmail(auth, email); const reset = await code('PASSWORD_RESET'); assert.equal(await verifyPasswordResetCode(auth, reset), email);
    await confirmPasswordReset(auth, reset, 'Reset-Password-456');
    await assert.rejects(confirmPasswordReset(auth, reset, 'Reused-Password-789'));
    await signOut(auth); await assert.rejects(signInWithEmailAndPassword(auth, email, 'Original-Password-123'));
    const current = (await signInWithEmailAndPassword(auth, email, 'Reset-Password-456')).user;
    await assert.rejects(reauthenticateWithCredential(current, EmailAuthProvider.credential(email, 'Wrong-Password-123')));
    await reauthenticateWithCredential(current, EmailAuthProvider.credential(email, 'Reset-Password-456')); await updatePassword(current, 'Changed-Password-789');
    await signOut(auth); await signInWithEmailAndPassword(auth, email, 'Changed-Password-789');
    console.log('PASS verification, single-use reset, old-password rejection and password change (no email sent)');
  } finally { await deleteApp(app); }
});
