# Firebase Email Verification Setup Guide

If you're not receiving verification emails, please follow these steps:

## 1. Check Firebase Console Settings

### Enable Email/Password Authentication:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `justwave-74759`
3. Go to **Authentication** > **Sign-in method**
4. Make sure **Email/Password** is enabled
5. Click on **Email/Password** and ensure:
   - ✅ **Email link (passwordless sign-in)** is optional (can be disabled)
   - ✅ **Email/Password** provider itself is enabled

### Configure Email Templates:
1. Still in **Authentication** > **Sign-in method**
2. Go to **Templates** tab
3. Click on **Email address verification**
4. Make sure the template is enabled and properly configured
5. The email should have a **{{ .ConfirmationURL }}** variable for the verification link

### Check Email Sending:
1. Go to **Authentication** > **Settings**
2. Check if **Authorized domains** includes your domain:
   - `justwave-74759.firebaseapp.com` (default)
   - Your custom domain if configured
   - `localhost` for development

## 2. Common Issues

### Email in Spam/Junk Folder:
- Check your spam/junk folder
- Mark Firebase emails as "Not Spam" if found there
- Add `noreply@justwave-74759.firebaseapp.com` to your contacts

### Firebase Email Quota:
- Free tier Firebase projects have email sending limits
- Check Firebase Console > Usage for email quota
- If exceeded, upgrade to Blaze plan or wait for quota reset

### Email Already Verified:
- If the email was previously verified, Firebase won't send another email
- Check `currentUser.emailVerified` in the browser console

## 3. Testing Email Verification

1. **Check Browser Console:**
   - Open Developer Tools (F12)
   - Go to Console tab
   - Look for messages like "Sending verification email to: ..."
   - Check for any error messages

2. **Try Resending:**
   - Log in to your account
   - You should see a banner at the top if email is not verified
   - Click "Resend Email" button
   - Check console for any errors

3. **Manual Verification (For Testing):**
   - Go to Firebase Console > Authentication > Users
   - Find your user
   - Click on the user
   - Click "Send email verification" button

## 4. Alternative: Use Firebase Console to Send Email

If emails aren't working, you can manually verify emails:
1. Go to Firebase Console > Authentication > Users
2. Find the user account
3. Click the three dots menu
4. Select "Send email verification"

## 5. Troubleshooting Steps

1. **Clear browser cache and cookies**
2. **Try a different browser**
3. **Check Firebase project billing status** (free tier has limits)
4. **Verify your Firebase project is active** (not deleted/suspended)
5. **Check Firebase status page** for any service outages

## 6. Email Verification Link Format

The verification link should look like:
```
https://justwave-74759.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=...
```

If you receive this link, click it to verify your email.

## Need Help?

If emails still aren't working after these steps:
1. Check Firebase Console > Authentication > Users to see if emails are being sent
2. Check the browser console for error messages
3. Verify your Firebase project configuration
4. Contact Firebase support if needed

## Preventing Emails from Going to Spam

If password reset emails are going to spam, see **[FIREBASE_EMAIL_DELIVERABILITY.md](./FIREBASE_EMAIL_DELIVERABILITY.md)** for comprehensive solutions including:
- Custom SMTP configuration
- Email authentication setup (SPF, DKIM, DMARC)
- Third-party email service integration
- SendGrid setup guide
