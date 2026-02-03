import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type {
  Assignment,
  AssignmentInput,
  AssignmentSettings,
  Submission,
  SubmissionInput,
  Notification,
  NotificationInput,
} from '../types/assignments';

/**
 * Collections
 */
export const ASSIGNMENTS_COLLECTION = 'assignments';
export const SUBMISSIONS_COLLECTION = 'submissions';
export const NOTIFICATIONS_COLLECTION = 'notifications';
export const MCQ_SETS_COLLECTION = 'mcqSets';

/**
 * Assignment Helpers
 */

/**
 * Create a new assignment
 */
export async function createAssignment(
  assignmentData: AssignmentInput
): Promise<string> {
  const dueDate =
    assignmentData.dueDate instanceof Date
      ? Timestamp.fromDate(assignmentData.dueDate)
      : assignmentData.dueDate;

  // Clean settings to remove undefined values (Firestore doesn't allow undefined)
  const cleanedSettings: AssignmentSettings = {
    shuffleQuestions: assignmentData.settings.shuffleQuestions ?? false,
    shuffleOptions: assignmentData.settings.shuffleOptions ?? false,
  };
  
  // Only include timeLimit and attemptLimit if they are defined (not undefined)
  if (assignmentData.settings.timeLimit !== undefined && assignmentData.settings.timeLimit !== null) {
    cleanedSettings.timeLimit = assignmentData.settings.timeLimit;
  }
  if (assignmentData.settings.attemptLimit !== undefined && assignmentData.settings.attemptLimit !== null) {
    cleanedSettings.attemptLimit = assignmentData.settings.attemptLimit;
  }

  // Validate mcqSetId before saving
  if (!assignmentData.mcqSetId || typeof assignmentData.mcqSetId !== 'string' || assignmentData.mcqSetId.trim() === '') {
    throw new Error(`Invalid mcqSetId: "${assignmentData.mcqSetId}". MCQ set ID must be a non-empty string.`);
  }
  
  console.log('Creating assignment with mcqSetId:', assignmentData.mcqSetId);
  console.log('Assignment data being saved:', {
    mcqSetId: assignmentData.mcqSetId,
    teacherId: assignmentData.teacherId,
    assignedStudentIds: assignmentData.assignedStudentIds,
    dueDate: dueDate,
    settings: cleanedSettings
  });
  
  const assignmentRef = await addDoc(collection(db, ASSIGNMENTS_COLLECTION), {
    mcqSetId: assignmentData.mcqSetId,
    teacherId: assignmentData.teacherId,
    assignedStudentIds: assignmentData.assignedStudentIds,
    assignedClassIds: assignmentData.assignedClassIds || [],
    dueDate,
    settings: cleanedSettings,
    createdAt: serverTimestamp(),
  });
  
  console.log('Assignment created successfully with ID:', assignmentRef.id);
  console.log('Assignment references MCQ set ID:', assignmentData.mcqSetId);

  return assignmentRef.id;
}

/**
 * Get an assignment by ID
 */
export async function getAssignmentById(
  assignmentId: string
): Promise<Assignment | null> {
  const assignmentDoc = await getDoc(doc(db, ASSIGNMENTS_COLLECTION, assignmentId));

  if (!assignmentDoc.exists()) {
    return null;
  }

  return {
    assignmentId: assignmentDoc.id,
    ...assignmentDoc.data(),
  } as Assignment;
}

/**
 * Get assignments by teacher ID
 */
export async function getAssignmentsByTeacher(
  teacherId: string,
  constraints?: QueryConstraint[]
): Promise<Assignment[]> {
  const queryConstraints: QueryConstraint[] = [
    where('teacherId', '==', teacherId),
    orderBy('createdAt', 'desc'),
    ...(constraints || []),
  ];

  const q = query(collection(db, ASSIGNMENTS_COLLECTION), ...queryConstraints);
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    assignmentId: doc.id,
    ...doc.data(),
  })) as Assignment[];
}

/**
 * Get assignments assigned to a student
 */
export async function getAssignmentsByStudent(
  studentId: string,
  constraints?: QueryConstraint[]
): Promise<Assignment[]> {
  const queryConstraints: QueryConstraint[] = [
    where('assignedStudentIds', 'array-contains', studentId),
    orderBy('createdAt', 'desc'),
    ...(constraints || []),
  ];

  try {
  const q = query(collection(db, ASSIGNMENTS_COLLECTION), ...queryConstraints);
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    assignmentId: doc.id,
    ...doc.data(),
  })) as Assignment[];
  } catch (error: any) {
    // If index doesn't exist, throw error with code so caller can handle fallback
    if (error?.code === 'failed-precondition') {
      throw error; // Re-throw so caller can implement fallback
    }
    throw error; // Re-throw other errors
  }
}

/**
 * Update an assignment
 */
export async function updateAssignment(
  assignmentId: string,
  updates: Partial<Omit<AssignmentInput, 'teacherId' | 'mcqSetId'>>
): Promise<void> {
  const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
  const updateData: any = {
    ...updates,
    updatedAt: serverTimestamp(),
  };

  // Convert dueDate to Timestamp if it's a Date
  if (updates.dueDate) {
    updateData.dueDate =
      updates.dueDate instanceof Date
        ? Timestamp.fromDate(updates.dueDate)
        : updates.dueDate;
  }

  await updateDoc(assignmentRef, updateData);
}

/**
 * Add students to an assignment
 */
export async function addStudentsToAssignment(
  assignmentId: string,
  studentIds: string[]
): Promise<void> {
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error('Assignment not found');
  }

  const updatedStudentIds = [
    ...new Set([...assignment.assignedStudentIds, ...studentIds]),
  ];

  await updateAssignment(assignmentId, {
    assignedStudentIds: updatedStudentIds,
  });
}

/**
 * Remove students from an assignment
 */
export async function removeStudentsFromAssignment(
  assignmentId: string,
  studentIds: string[]
): Promise<void> {
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error('Assignment not found');
  }

  const updatedStudentIds = assignment.assignedStudentIds.filter(
    (id) => !studentIds.includes(id)
  );

  await updateAssignment(assignmentId, {
    assignedStudentIds: updatedStudentIds,
  });
}

/**
 * Submission Helpers
 */

/**
 * Create a new submission
 */
export async function createSubmission(
  submissionData: SubmissionInput
): Promise<string> {
  const startedAt =
    submissionData.startedAt instanceof Date
      ? Timestamp.fromDate(submissionData.startedAt)
      : submissionData.startedAt;

  const submittedAt =
    submissionData.submittedAt instanceof Date
      ? Timestamp.fromDate(submissionData.submittedAt)
      : submissionData.submittedAt;

  const submissionRef = await addDoc(collection(db, SUBMISSIONS_COLLECTION), {
    assignmentId: submissionData.assignmentId,
    mcqSetId: submissionData.mcqSetId,
    studentId: submissionData.studentId,
    teacherId: submissionData.teacherId,
    attemptNumber: submissionData.attemptNumber,
    answers: submissionData.answers,
    score: submissionData.score,
    correctCount: submissionData.correctCount,
    totalQuestions: submissionData.totalQuestions,
    timeTaken: submissionData.timeTaken,
    startedAt,
    submittedAt,
    isGraded: true, // Auto-graded for MCQ
    gradedAt: serverTimestamp(),
  });

  return submissionRef.id;
}

/**
 * Get a submission by ID
 */
export async function getSubmissionById(
  submissionId: string
): Promise<Submission | null> {
  const submissionDoc = await getDoc(doc(db, SUBMISSIONS_COLLECTION, submissionId));

  if (!submissionDoc.exists()) {
    return null;
  }

  return {
    submissionId: submissionDoc.id,
    ...submissionDoc.data(),
  } as Submission;
}

/**
 * Get submissions by assignment ID
 */
export async function getSubmissionsByAssignment(
  assignmentId: string,
  constraints?: QueryConstraint[]
): Promise<Submission[]> {
  const queryConstraints: QueryConstraint[] = [
    where('assignmentId', '==', assignmentId),
    orderBy('submittedAt', 'desc'),
    ...(constraints || []),
  ];

  const q = query(collection(db, SUBMISSIONS_COLLECTION), ...queryConstraints);
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    submissionId: doc.id,
    ...doc.data(),
  })) as Submission[];
}

/**
 * Get submissions by student ID
 */
export async function getSubmissionsByStudent(
  studentId: string,
  constraints?: QueryConstraint[]
): Promise<Submission[]> {
  const queryConstraints: QueryConstraint[] = [
    where('studentId', '==', studentId),
    orderBy('submittedAt', 'desc'),
    ...(constraints || []),
  ];

  const q = query(collection(db, SUBMISSIONS_COLLECTION), ...queryConstraints);
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    submissionId: doc.id,
    ...doc.data(),
  })) as Submission[];
}

/**
 * Get submissions for a specific assignment and student
 */
export async function getStudentSubmissionsForAssignment(
  assignmentId: string,
  studentId: string
): Promise<Submission[]> {
  const q = query(
    collection(db, SUBMISSIONS_COLLECTION),
    where('assignmentId', '==', assignmentId),
    where('studentId', '==', studentId),
    orderBy('attemptNumber', 'asc')
  );

  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    submissionId: doc.id,
    ...doc.data(),
  })) as Submission[];
}

/**
 * Get the next attempt number for a student's submission
 */
export async function getNextAttemptNumber(
  assignmentId: string,
  studentId: string
): Promise<number> {
  const submissions = await getStudentSubmissionsForAssignment(assignmentId, studentId);

  if (submissions.length === 0) {
    return 1;
  }

  const maxAttempt = Math.max(...submissions.map((s) => s.attemptNumber));
  return maxAttempt + 1;
}

/**
 * Notification Helpers
 */

/**
 * Create a new notification
 */
export async function createNotification(
  notificationData: NotificationInput
): Promise<string> {
  const notificationRef = await addDoc(
    collection(db, NOTIFICATIONS_COLLECTION),
    {
      userId: notificationData.userId,
      type: notificationData.type,
      title: notificationData.title,
      body: notificationData.body,
      assignmentId: notificationData.assignmentId,
      submissionId: notificationData.submissionId,
      isRead: false,
      createdAt: serverTimestamp(),
    }
  );

  return notificationRef.id;
}

/**
 * Create notifications for multiple users
 */
export async function createNotificationsForUsers(
  userIds: string[],
  notificationData: Omit<NotificationInput, 'userId'>
): Promise<void> {
  const batch = writeBatch(db);

  userIds.forEach((userId) => {
    const notificationRef = doc(collection(db, NOTIFICATIONS_COLLECTION));
    batch.set(notificationRef, {
      userId,
      ...notificationData,
      isRead: false,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * Get notifications by user ID
 */
export async function getNotificationsByUser(
  userId: string,
  constraints?: QueryConstraint[]
): Promise<Notification[]> {
  const queryConstraints: QueryConstraint[] = [
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    ...(constraints || []),
  ];

  const q = query(collection(db, NOTIFICATIONS_COLLECTION), ...queryConstraints);
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    notificationId: doc.id,
    ...doc.data(),
  })) as Notification[];
}

/**
 * Get unread notifications for a user
 */
export async function getUnreadNotifications(userId: string): Promise<Notification[]> {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('isRead', '==', false),
    orderBy('createdAt', 'desc')
  );

  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    notificationId: doc.id,
    ...doc.data(),
  })) as Notification[];
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const notificationRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
  await updateDoc(notificationRef, {
    isRead: true,
    readAt: serverTimestamp(),
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const unreadNotifications = await getUnreadNotifications(userId);
  const batch = writeBatch(db);

  unreadNotifications.forEach((notification) => {
    const notificationRef = doc(db, NOTIFICATIONS_COLLECTION, notification.notificationId);
    batch.update(notificationRef, {
      isRead: true,
      readAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * Delete a notification
 * Note: Delete functionality should be handled carefully.
 * Consider marking as deleted instead of actual deletion for audit purposes.
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  // Import deleteDoc when needed:
  // import { deleteDoc } from 'firebase/firestore';
  // const notificationRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
  // await deleteDoc(notificationRef);
  
  // For now, we'll mark as read instead (safer for audit trail)
  await markNotificationAsRead(notificationId);
}

/**
 * Utility function to create assignment notifications for students
 */
export async function notifyStudentsOfAssignment(
  studentIds: string[],
  assignmentId: string,
  assignmentTitle: string
): Promise<void> {
  await createNotificationsForUsers(studentIds, {
    type: 'assignment_assigned',
    title: 'New Assignment Assigned',
    body: `You have been assigned: ${assignmentTitle}`,
    assignmentId,
  });
}

/**
 * Utility function to notify teacher of submission
 */
export async function notifyTeacherOfSubmission(
  teacherId: string,
  assignmentId: string,
  submissionId: string,
  studentEmail: string
): Promise<void> {
  await createNotification({
    userId: teacherId,
    type: 'submission_received',
    title: 'New Submission Received',
    body: `${studentEmail} submitted an assignment`,
    assignmentId,
    submissionId,
  });
}
