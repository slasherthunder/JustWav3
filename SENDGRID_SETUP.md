# SendGrid Setup Guide for Firebase Password Reset Emails

This guide will help you configure SendGrid to send password reset emails through Firebase, preventing them from going to spam.

## Step 1: Create SendGrid Account

1. Go to [https://sendgrid.com](https://sendgrid.com)
2. Click **"Start for Free"** or **"Sign Up"**
3. Fill out the signup form:
   - Email address
   - Password
   - Company name (can be your app name: "JustWav3")
4. Verify your email address (check your inbox)
5. Complete the account setup

## Step 2: Verify Your Sender Identity

### Option A: Single Sender Verification (Quickest - 5 minutes)

1. In SendGrid dashboard, go to **Settings** → **Sender Authentication**
2. Click **"Verify a Single Sender"**
3. Fill out the form:
   - **From Email Address:** `noreply@justwave-74759.firebaseapp.com` (or use your domain email)
   - **From Name:** `JustWav3` (or your app name)
   - **Reply To:** Your support email (optional)
   - **Company Address:** Your address
   - **City, State, Zip, Country:** Your location
4. Click **"Create"**
5. Check your email and click the verification link
6. ✅ **Status should show "Verified"**

### Option B: Domain Authentication (Better deliverability - 30 minutes)

If you have your own domain (e.g., `justwave.com`):

1. Go to **Settings** → **Sender Authentication** → **Authenticate Your Domain**
2. Select your DNS provider (or "Other")
3. Add the DNS records SendGrid provides to your domain's DNS settings
4. Wait for verification (can take up to 48 hours, usually much faster)

## Step 3: Create SendGrid API Key

1. In SendGrid dashboard, go to **Settings** → **API Keys**
2. Click **"Create API Key"**
3. Choose **"Full Access"** (or "Restricted Access" with Mail Send permissions)
4. Give it a name: `Firebase Password Reset`
5. Click **"Create & View"**
6. **⚠️ IMPORTANT:** Copy the API key immediately - you won't be able to see it again!
   - It will look like: `SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
7. Save it securely (we'll use it in the next step)

## Step 4: Configure Firebase Custom SMTP

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `justwave-74759`
3. Go to **Authentication** → **Settings** (gear icon in top right)
4. Scroll down to **"Email Templates"** section
5. Find **"Password reset"** template
6. Click **"Customize"** (or the edit icon)
7. Scroll down and find **"Custom SMTP"** section
8. Toggle **"Enable Custom SMTP"** to ON
9. Fill in the SMTP settings:

   ```
   SMTP Host: smtp.sendgrid.net
   SMTP Port: 587
   SMTP Username: apikey
   SMTP Password: [Paste your SendGrid API key here]
   From Email Address: noreply@justwave-74759.firebaseapp.com
   From Display Name: JustWav3
   ```

10. Click **"Save"**

## Step 5: Customize Email Template (Optional but Recommended)

While in the Password reset template editor:

1. **Subject Line:** Customize to something like:
   - `Reset your JustWav3 password`
   - `JustWav3 Password Reset Request`

2. **Email Body:** You can customize the message, but keep these variables:
   - `{{ .ConfirmationURL }}` - The password reset link (REQUIRED)
   - `{{ .Email }}` - User's email address
   - `{{ .SiteURL }}` - Your site URL

3. **Example Template:**
   ```
   Hello,

   You requested to reset your password for your JustWav3 account.

   Click the link below to reset your password:
   {{ .ConfirmationURL }}

   If you didn't request this, you can safely ignore this email.

   Best regards,
   The JustWav3 Team
   ```

4. Click **"Save"**

## Step 6: Test the Setup

1. Go to your app's login page
2. Click **"Forgot Password? 🔑"**
3. Enter a test email address
4. Click **"Send Reset Link"**
5. Check the email inbox (and spam folder initially)
6. The email should come from your SendGrid verified sender

## Troubleshooting

### Email Still Going to Spam?

1. **Check SendGrid Activity:**
   - Go to SendGrid dashboard → **Activity**
   - See if emails are being delivered
   - Check bounce/spam reports

2. **Verify Sender Identity:**
   - Make sure your sender is verified in SendGrid
   - Domain authentication is better than single sender

3. **Check Email Content:**
   - Avoid spam trigger words
   - Keep it professional
   - Include your app name

4. **Warm Up Your IP (if using dedicated IP):**
   - Start with low volume
   - Gradually increase
   - SendGrid handles this automatically on shared IP

### API Key Not Working?

1. Make sure you copied the full API key (starts with `SG.`)
2. Check that the API key has "Mail Send" permissions
3. Try creating a new API key if needed

### Firebase SMTP Settings Not Saving?

1. Make sure you're on Firebase Blaze plan (free tier available)
2. Check that all fields are filled correctly
3. Try refreshing the page and re-entering

## Monitoring Email Deliverability

### SendGrid Dashboard:
- **Activity Feed:** See all sent emails
- **Stats:** Delivery rates, opens, clicks
- **Suppressions:** Bounced/spam emails

### Key Metrics to Watch:
- **Delivered Rate:** Should be 95%+
- **Bounce Rate:** Should be < 5%
- **Spam Reports:** Should be < 0.1%

## Free Tier Limits

- **100 emails per day** on free tier
- If you exceed this, you'll need to upgrade to a paid plan
- Monitor usage in SendGrid dashboard → **Stats**

## Next Steps

1. ✅ Test password reset emails
2. ✅ Monitor deliverability in SendGrid dashboard
3. ✅ Consider domain authentication for better results
4. ✅ Update email templates to match your brand

## Support Resources

- [SendGrid Documentation](https://docs.sendgrid.com/)
- [SendGrid Support](https://support.sendgrid.com/)
- [Firebase Email Templates](https://firebase.google.com/docs/auth/custom-email-handler)

---

**Note:** The free tier (100 emails/day) should be sufficient for most apps. Monitor your usage and upgrade if needed.
