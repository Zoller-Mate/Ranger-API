import * as firebaseAdmin from 'firebase-admin';
import { db, token } from '../db';
import {eq} from 'drizzle-orm'

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert({
    projectId: process.env.FB_PROJECT_ID as string??'',
    clientEmail: process.env.FB_CLIENT_EMAIL as string??'',
    privateKey: (process.env.FB_PRIVATE_KEY as string??'').replace(/\\n/g, '\n'),
  }),
});

export default async function sendNotification(userId: string, title: string, message: string ) {
  const userTokens = await db.select({token: token.token}).from(token).where(eq(token.userId, userId));
  const tokens = userTokens.map(x=>x.token);
  console.log(tokens);
  const _message = {
   notification: {
     title,
     body: message,
   },
   tokens
  };
  const firebaseRes = await firebaseAdmin.messaging().sendEachForMulticast(_message);
  for (const resp of firebaseRes.responses) {
   const i = firebaseRes.responses.indexOf(resp);
   if (!resp.success) {
     const errorCode = resp.error?.code;
     if (
       errorCode === 'messaging/invalid-registration-token' ||
       errorCode === 'messaging/registration-token-not-registered'
     ) await db.delete(token).where(eq(token.token, _message.tokens[i]??''));
    }
  }
}