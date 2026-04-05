# Preventing Firebase Emails from Going to Spam

Firebase password reset emails can sometimes be marked as spam by email providers. Here are several solutions to improve email deliverability:

## Why Emails Go to Spam

Firebase sends emails from their shared infrastructure (`noreply@justwave-74759.firebaseapp.com`), which can trigger spam filters because:
- Emails come from a third-party service, not your domain
- Lack of proper email authentication (SPF, DKIM, DMARC)
- Shared IP reputation with other Firebase projects

## Solutions (Ranked by Effectiveness)

### 1. **Custom SMTP Configuration** (Most Effective) ⭐

Configure Firebase to send emails through your own SMTP server. This requires:
- **Firebase Blaze Plan** (pay-as-you-go, but free tier still available)
- Your own domain with email hosting
- SMTP server (Gmail, SendGrid, Mailgun, AWS SES, etc.)

#### Steps:
1. **Get SMTP credentials** from your email provider
2. **Go to Firebase Console** → Authentication → Settings → Email Templates
3. **Click "Customize"** on the password reset template
4. **Enable "Custom SMTP"**
5. **Enter your SMTP settings:**
   - SMTP Host (e.g., `smtp.gmail.com`)
   - SMTP Port (usually 587 for TLS)
   - SMTP Username
   - SMTP Password
   - From Email Address (your domain email)

#### Recommended SMTP Providers:
- **SendGrid** (Free tier: 100 emails/day)
- **Mailgun** (Free tier: 5,000 emails/month)
- **AWS SES** (Very affordable, $0.10 per 1,000 emails)
- **Gmail SMTP** (Free, but limited to 500 emails/day)

### 2. **Email Authentication Setup** (Important for Custom Domain)

If you use a custom domain, set up email authentication records:

#### SPF Record (Sender Policy Framework)
Add to your domain's DNS:
```
TXT record: v=spf1 include:_spf.google.com ~all
```

#### DKIM Record (DomainKeys Identified Mail)
Your email provider will give you DKIM keys to add to DNS.

#### DMARC Record (Domain-based Message Authentication)
Add to your domain's DNS:
```
TXT record: v=DMARC1; p=none; rua=mailto:admin@yourdomain.com
```

### 3. **Customize Email Templates** (Quick Win)

Improve email content to avoid spam triggers:

1. **Go to Firebase Console** → Authentication → Templates
2. **Click "Password reset" template**
3. **Customize:**
   - Use a clear, professional subject line
   - Avoid spam trigger words (FREE, CLICK HERE, URGENT, etc.)
   - Include your app name and branding
   - Add a clear call-to-action
   - Include your contact information

### 4. **Use a Custom Domain for Email Sending**

Instead of `noreply@justwave-74759.firebaseapp.com`, use your own domain:
- `noreply@justwave.com` or `support@justwave.com`
- Requires custom SMTP setup (see Solution #1)

### 5. **Third-Party Email Service Integration**

Use a dedicated email service with better deliverability:

#### Option A: SendGrid Extension
1. Install Firebase Extension: "Trigger Email"
2. Configure SendGrid API key
3. Emails sent through SendGrid instead of Firebase

#### Option B: Cloud Functions + Email Service
1. Create a Cloud Function triggered by password reset requests
2. Use SendGrid/Mailgun API to send emails
3. Better control over email content and deliverability

## Quick Implementation: SendGrid Setup

**📖 For detailed step-by-step instructions, see [SENDGRID_SETUP.md](./SENDGRID_SETUP.md)**

### Quick Overview:
1. **Create SendGrid Account** - Free tier available (100 emails/day)
2. **Verify Sender Identity** - Single sender or domain authentication
3. **Create API Key** - Settings → API Keys → Create API Key
4. **Configure Firebase Custom SMTP:**
   - Go to Firebase Console → Authentication → Settings → Email Templates
   - Click "Customize" on "Password reset"
   - Enable "Custom SMTP"
   - Enter SendGrid SMTP settings:
     - **SMTP Host:** `smtp.sendgrid.net`
     - **SMTP Port:** `587`
     - **SMTP Username:** `apikey`
     - **SMTP Password:** (your SendGrid API key)
     - **From Email:** Your verified sender email

## Testing Email Deliverability

After implementing a solution:

1. **Send test emails** to different providers (Gmail, Outlook, Yahoo)
2. **Check spam folders** to see if emails are being filtered
3. **Use email testing tools:**
   - [Mail-Tester.com](https://www.mail-tester.com) - Tests spam score
   - [MXToolbox](https://mxtoolbox.com) - Checks email authentication

## Current Workaround

Until you implement a permanent solution, the app already:
- ✅ Informs users to check spam folder
- ✅ Provides the sender email address to add to contacts
- ✅ Uses clear, professional messaging

## Recommended Next Steps

1. **Short-term:** Customize Firebase email templates (5 minutes)
2. **Medium-term:** Set up SendGrid with custom SMTP (30 minutes)
3. **Long-term:** Authenticate your domain with SPF/DKIM/DMARC (1-2 hours)

## Cost Considerations

- **Firebase Blaze Plan:** Free tier available, pay only for what you use
- **SendGrid:** Free tier (100 emails/day) or paid ($19.95/month for 50,000 emails)
- **Mailgun:** Free tier (5,000 emails/month) or paid ($35/month for 50,000 emails)
- **AWS SES:** $0.10 per 1,000 emails (very affordable)

## Additional Resources

- [Firebase Email Templates Documentation](https://firebase.google.com/docs/auth/custom-email-handler)
- [SendGrid Email Deliverability Guide](https://sendgrid.com/resource/email-deliverability-guide/)
- [Gmail Bulk Sender Guidelines](https://support.google.com/mail/answer/81126)

---

**Note:** The most effective solution is using a custom SMTP server with a verified domain. This typically improves deliverability from ~60-70% to 95%+.
