# Create Demo Accounts Script

This document describes how to create demo accounts for the JustWav3 application.

## Option 1: Manual Creation (Recommended for Quick Demo)

### Using the App Signup Flow

1. Start the development server: `npm run dev`
2. Navigate to the signup page
3. Create accounts for each role:

**Student Account:**
- Email: `demo.student@justwav3.app`
- Password: Choose a simple password (e.g., `demo123`)
- Role: Student
- Password mode: Normal or Icon-based

**Teacher Account:**
- Email: `demo.teacher@justwav3.app`
- Password: Choose a simple password (e.g., `demo123`)
- Role: Teacher
- Password mode: Normal or Icon-based

**Parent Account:**
- Email: `demo.parent@justwav3.app`
- Password: Choose a simple password (e.g., `demo123`)
- Role: Parent
- Password mode: Normal or Icon-based

### Using Firebase Console

1. Go to Firebase Console → Authentication → Users
2. Click "Add user"
3. Enter email and password
4. Go to Firestore → `users` collection
5. Create a document with the user's UID
6. Add the following fields:
   ```json
   {
     "email": "demo.student@justwav3.app",
     "role": "student",
     "createdAt": "2024-01-01T00:00:00.000Z",
     "emailVerified": false
   }
   ```

## Option 2: Automated Script (Future Enhancement)

A script could be created using Firebase Admin SDK to automate account creation:

```typescript
// scripts/create-demo-accounts.ts
import * as admin from 'firebase-admin';
import * as readline from 'readline';

// Initialize Firebase Admin
admin.initializeApp();

async function createDemoAccounts() {
  const accounts = [
    { email: 'demo.student@justwav3.app', password: 'demo123', role: 'student' },
    { email: 'demo.teacher@justwav3.app', password: 'demo123', role: 'teacher' },
    { email: 'demo.parent@justwav3.app', password: 'demo123', role: 'parent' },
  ];

  for (const account of accounts) {
    try {
      // Create user
      const userRecord = await admin.auth().createUser({
        email: account.email,
        password: account.password,
        emailVerified: true, // Set to true for demo accounts
      });

      // Create user document in Firestore
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        email: account.email,
        role: account.role,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        emailVerified: true,
      });

      console.log(`✅ Created ${account.role} account: ${account.email}`);
    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') {
        console.log(`⚠️  Account already exists: ${account.email}`);
      } else {
        console.error(`❌ Error creating ${account.email}:`, error.message);
      }
    }
  }
}

createDemoAccounts().then(() => {
  console.log('Demo accounts creation complete!');
  process.exit(0);
}).catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
```

To use this script, you would need to:
1. Install Firebase Admin SDK in a separate script directory
2. Set up service account credentials
3. Run the script: `ts-node scripts/create-demo-accounts.ts`

## Demo Account Credentials Template

Create a file `DEMO_CREDENTIALS.md` with demo account information:

```markdown
# Demo Account Credentials

## Student Account
- Email: demo.student@justwav3.app
- Password: demo123
- Role: Student

## Teacher Account
- Email: demo.teacher@justwav3.app
- Password: demo123
- Role: Teacher

## Parent Account
- Email: demo.parent@justwav3.app
- Password: demo123
- Role: Parent

**Note:** These are demo accounts for demonstration purposes only.
Change passwords in production!
```

## Security Considerations

⚠️ **Important for Production:**

1. **Never use demo accounts in production**
2. **Change all demo passwords** if deploying to production
3. **Delete demo accounts** after demo is complete (if using temporary demo)
4. **Use environment-specific Firebase projects** (dev vs prod)
5. **Keep demo credentials separate** from production credentials

## Reset Demo Accounts (if needed)

If you need to reset demo accounts:

1. Go to Firebase Console → Authentication
2. Delete the demo user accounts
3. Go to Firestore → `users` collection
4. Delete the corresponding user documents
5. Recreate accounts using one of the methods above


