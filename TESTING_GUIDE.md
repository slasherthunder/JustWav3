# Testing Guide for Adaptive Learning Features

This guide will help you test all the new adaptive learning features and explanations.

## Prerequisites

1. **Start the development server:**
   ```bash
   cd ReactNativeApp
   npm run dev
   ```

2. **Access the app:**
   - Open your browser and navigate to `http://localhost:5173` (or the port shown in terminal)
   - Make sure camera permissions are enabled

## 1. Testing "Why am I seeing this?" Tooltips

### Test Auto-Mode Switch Tooltip

1. **Login as a Student:**
   - Sign in or create a student account
   - Navigate to the Learn page

2. **Trigger Auto-Switch:**
   - Switch to **Audio Mode** (🔊 Audio button)
   - Click the **"❓ Please help"** button **2-3 times** quickly
   - The system should automatically switch to Icons or Simple mode
   - A tooltip should appear at the top of the learning pane saying:
     - **"💡 Why am I seeing this?"**
     - **"We switched to Icons Mode because you asked for help 2 times."**

3. **Verify Tooltip Behavior:**
   - Tooltip should auto-dismiss after 10 seconds
   - You can close it manually with the ✕ button
   - Tooltip should not appear again for 30 seconds (cooldown period)

### Test Repeated Wave Gesture Simplification

1. **Enable Gesture Detection:**
   - Make sure camera permissions are granted
   - Click "Start Detecting Gestures" if not already running

2. **Trigger Content Simplification:**
   - Make the **Wave gesture** (👋) **3+ times** within 10 seconds
   - The difficulty should automatically decrease
   - The content text should become simpler (shorter sentences, easier vocabulary)

## 2. Testing Adaptive Difficulty

### Test Difficulty Increase

1. **Start a Learning Session:**
   - Navigate to Learn page
   - Switch to any mode (e.g., Icons mode)

2. **Perform Well:**
   - Click **"✅ I understand"** button multiple times
   - Answer correctly to achieve **≥80% accuracy**
   - Respond quickly (within 3 seconds)

3. **Verify Difficulty Increase:**
   - Check browser console for: `🎯 Increasing difficulty to X`
   - The content text should become more complex
   - Vocabulary and sentence structure should become more advanced

### Test Difficulty Decrease

1. **Struggle with Content:**
   - Click **"❓ Please help"** button multiple times (frustration > 3)
   - Or answer incorrectly to get **<50% accuracy**

2. **Verify Difficulty Decrease:**
   - Check browser console for: `📉 Decreasing difficulty to X`
   - The content text should become simpler
   - Sentences should be shorter and vocabulary easier

### Verify Content Changes

The water cycle content has 5 difficulty levels:
- **Level 1**: "Water moves in a cycle. Sun heats water. Water goes up..."
- **Level 2**: "The water cycle moves water around. The sun heats water..."
- **Level 3**: "The water cycle moves water through evaporation, condensation..."
- **Level 4**: More detailed explanation with complex vocabulary
- **Level 5**: Advanced scientific language

## 3. Testing Explanations in Reports

### As a Student

1. **Complete a Learning Session:**
   - Go through different modes
   - Ask for help a few times (to create frustration data)
   - Answer some questions correctly, some incorrectly
   - Click **"End Session & View Profile"**

2. **View Your Profile:**
   - The profile summary should appear
   - Note the recommendations and best modes

### As a Teacher/Parent

1. **View Student Reports:**
   - Login as a teacher or parent
   - Connect to a student (if not already connected)
   - Click **"View Reports"** for a connected student

2. **Check Report Cards:**
   - Each report card shows:
     - Session date and success rate
     - Attempts, successes, help requests
     - Best modes, strengths, needs, recommendations

3. **Expand Explanations:**
   - Click on **"📊 Why these recommendations? (Click to expand)"**
   - You should see three sections:
   
   **a. Why student struggles in [mode] mode:**
   - Shows frustration count and accuracy for the least effective mode
   - Explains why that mode doesn't work well
   
   **b. Why these recommendations were made:**
   - Explains engagement metrics
   - Shows why certain modes are recommended
   - Includes secondary support mode reasoning
   
   **c. Detailed mode analysis:**
   - Breakdown of each mode's performance
   - Shows frustration events and accuracy for struggling modes
   - Includes guidance for alternative approaches

### Verify Explanations are Saved

1. **Check Firebase Console:**
   - Go to Firebase Console → Firestore Database
   - Navigate to: `users/{studentId}/learningReports/{reportId}`
   - Check the `profile` field
   - Verify `profile.explanations` object exists with:
     - `leastEffectiveReason`
     - `recommendationReason`
     - `modeStruggles`

2. **Check Browser Console:**
   - Open Developer Tools (F12)
   - Look for console logs when saving reports:
     - "Learning report saved successfully to Firebase"
     - "Persistent learning profile updated successfully"

## 4. Testing Persistent Learning Profile

### First Session

1. **New User:**
   - Create a new student account
   - Go to Learn page
   - Difficulty should start at **Level 1** (easiest)

2. **Complete Session:**
   - Perform well or poorly
   - End session and save report

### Subsequent Sessions

1. **Return to Learn Page:**
   - The system should load your persistent profile
   - Check browser console for: "Loading persistent learning profile"
   - Difficulty should adjust based on historical performance:
     - **High performers (≥80% accuracy)**: Difficulty increased
     - **Struggling users (<50% accuracy)**: Difficulty decreased
     - **Others**: Maintain current difficulty level

2. **Verify Profile Updates:**
   - Complete another session
   - Check Firebase: `users/{userId}/learningProfile/current`
   - Verify fields are updated:
     - `totalSessions` increments
     - `averageAccuracy` and `averageDifficulty` are recalculated
     - `learningStyle` is detected (visual/auditory/kinesthetic/mixed)
     - `profileSummary` shows learning style with gesture reinforcement

## 5. Testing Learning Style Detection

### Visual Learner

1. **Spend time in visual modes:**
   - Use **Image Mode** (🖼️ Image) extensively
   - Use **Icons Mode** (🎨 Icons) extensively
   - Minimize time in Audio mode

2. **Check Profile:**
   - After session, profile should show: "visual learner" or "visual learner with gesture reinforcement"

### Auditory Learner

1. **Spend time in audio mode:**
   - Use **Audio Mode** (🔊 Audio) extensively
   - Listen to content multiple times

2. **Check Profile:**
   - Profile should show: "auditory learner"

### Kinesthetic Learner

1. **Use gesture mode:**
   - Use **Gesture Mode** (👋 Gesture) extensively
   - Make gestures frequently (wave, point, fist, open hand)

2. **Check Profile:**
   - If gesture usage > 20%, profile should show: "[style] learner with gesture reinforcement"

## 6. Testing Edge Cases

### No Camera Permissions

1. **Deny camera access:**
   - Refresh page
   - Deny camera permission when prompted
   - Error message should appear with instructions

2. **Gesture detection should be disabled:**
   - "Stop Detecting Gestures" button should still work
   - Can still use other modes

### Empty Reports

1. **Student with no reports:**
   - Login as teacher/parent
   - View a student with no completed sessions
   - Should see: "No learning reports yet for this student."

### Missing Explanation Data

1. **Old reports without explanations:**
   - Reports saved before this update won't have explanations
   - Report card should still display normally
   - Explanations section should not appear (no error)

## 7. Quick Test Checklist

- [ ] Auto-switch tooltip appears when asking for help 2+ times in Audio mode
- [ ] Tooltip auto-dismisses after 10 seconds
- [ ] Difficulty increases when accuracy ≥80% and fast responses
- [ ] Difficulty decreases when accuracy <50% or frustration >3
- [ ] Content text changes based on difficulty level
- [ ] Repeated wave gestures simplify content
- [ ] Reports save with explanations in Firebase
- [ ] Teacher/Parent can expand explanations in report cards
- [ ] Explanations show why student struggles in modes
- [ ] Explanations show why recommendations were made
- [ ] Persistent profile loads on subsequent sessions
- [ ] Learning style is detected correctly
- [ ] Profile summary includes gesture reinforcement when applicable

## Troubleshooting

### Tooltip Not Appearing

- Check browser console for auto-switch logs
- Verify frustration count ≥ 2 and interactions ≥ 3
- Ensure auto-switch cooldown (30 seconds) has passed

### Explanations Not Showing

- Check if report was saved after implementing explanations
- Verify Firebase has `profile.explanations` field
- Check browser console for save errors

### Difficulty Not Changing

- Check minimum attempts (needs 3+ attempts to trigger)
- Verify accuracy/frustration thresholds are met
- Check browser console for difficulty change logs

### Camera Issues

- Check browser settings for camera permissions
- Try refreshing the page
- Check browser console for MediaPipe errors

## Next Steps

After testing, you can:
1. **Deploy to Firebase Hosting:** `npm run deploy`
2. **Share with test users** to gather feedback
3. **Monitor Firebase Console** for saved reports and profiles
4. **Check analytics** for user engagement patterns

