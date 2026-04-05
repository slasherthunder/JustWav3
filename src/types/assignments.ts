import { Timestamp } from 'firebase/firestore';

/**
 * Assignment Settings
 * Controls how students interact with the assignment
 */
export interface AssignmentSettings {
  /** Time limit in minutes (0 or undefined = no limit) */
  timeLimit?: number;
  /** Maximum number of attempts allowed (0 or undefined = unlimited) */
  attemptLimit?: number;
  /** Whether to shuffle question order */
  shuffleQuestions: boolean;
  /** Whether to shuffle option order within questions */
  shuffleOptions: boolean;
}

/**
 * Assignment Document Structure
 * Represents an MCQ set assigned to students by a teacher
 */
export interface Assignment {
  /** Firestore document ID (auto-generated) */
  assignmentId: string;
  /** ID of the MCQ set being assigned */
  mcqSetId: string;
  /** ID of the teacher who created the assignment */
  teacherId: string;
  /** Array of student IDs assigned to this assignment */
  assignedStudentIds: string[];
  /** Array of class IDs assigned to this assignment (for future class-based assignments) */
  assignedClassIds: string[];
  /** Due date for the assignment */
  dueDate: Timestamp;
  /** Assignment settings and restrictions */
  settings: AssignmentSettings;
  /** Timestamp when the assignment was created */
  createdAt: Timestamp;
  /** Timestamp when the assignment was last updated (optional) */
  updatedAt?: Timestamp;
}

/**
 * Assignment Input Data
 * Used when creating a new assignment (without auto-generated fields)
 */
export interface AssignmentInput {
  mcqSetId: string;
  teacherId: string;
  assignedStudentIds: string[];
  assignedClassIds?: string[];
  dueDate: Timestamp | Date;
  settings: AssignmentSettings;
}

/**
 * Submission Answer
 * Represents a student's answer to a single question
 */
export interface SubmissionAnswer {
  /** Index of the question in the MCQ set */
  questionIndex: number;
  /** Selected answer(s) - single string for multipleChoice, string[] for multipleCorrect */
  selectedAnswers: string | string[];
  /** Whether the answer is correct */
  isCorrect: boolean;
  /** Time taken to answer (in seconds) */
  timeTaken?: number;
}

/**
 * Submission Document Structure
 * Represents a student's submission of an assignment
 */
export interface Submission {
  /** Firestore document ID (auto-generated) */
  submissionId: string;
  /** ID of the assignment this submission belongs to */
  assignmentId: string;
  /** ID of the MCQ set */
  mcqSetId: string;
  /** ID of the student who submitted */
  studentId: string;
  /** ID of the teacher who created the assignment */
  teacherId: string;
  /** Attempt number (1-based) */
  attemptNumber: number;
  /** Array of answers provided */
  answers: SubmissionAnswer[];
  /** Total score (percentage) */
  score: number;
  /** Number of correct answers */
  correctCount: number;
  /** Total number of questions */
  totalQuestions: number;
  /** Time taken to complete (in seconds) */
  timeTaken?: number;
  /** Timestamp when the submission was started */
  startedAt: Timestamp;
  /** Timestamp when the submission was completed */
  submittedAt: Timestamp;
  /** Whether the submission is graded */
  isGraded: boolean;
  /** Timestamp when the submission was graded (optional) */
  gradedAt?: Timestamp;
}

/**
 * Submission Input Data
 * Used when creating a new submission (without auto-generated fields)
 */
export interface SubmissionInput {
  assignmentId: string;
  mcqSetId: string;
  studentId: string;
  teacherId: string;
  attemptNumber: number;
  answers: SubmissionAnswer[];
  score: number;
  correctCount: number;
  totalQuestions: number;
  timeTaken?: number;
  startedAt: Timestamp | Date;
  submittedAt: Timestamp | Date;
}

/**
 * Notification Type
 */
export type NotificationType = 
  | 'assignment_assigned' 
  | 'assignment_due_soon' 
  | 'assignment_graded'
  | 'submission_received'
  | 'assignment_updated';

/**
 * Notification Document Structure
 * Represents a notification for a user
 */
export interface Notification {
  /** Firestore document ID (auto-generated) */
  notificationId: string;
  /** ID of the user receiving the notification */
  userId: string;
  /** Type of notification */
  type: NotificationType;
  /** Title of the notification */
  title: string;
  /** Body/message of the notification */
  body: string;
  /** Related assignment ID (if applicable) */
  assignmentId?: string;
  /** Related submission ID (if applicable) */
  submissionId?: string;
  /** Whether the notification has been read */
  isRead: boolean;
  /** Timestamp when the notification was created */
  createdAt: Timestamp;
  /** Timestamp when the notification was read (optional) */
  readAt?: Timestamp;
}

/**
 * Notification Input Data
 * Used when creating a new notification (without auto-generated fields)
 */
export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  assignmentId?: string;
  submissionId?: string;
}

/**
 * Assignment with MCQ Set Data
 * Extended assignment interface that includes the MCQ set information
 */
export interface AssignmentWithMCQSet extends Assignment {
  /** The MCQ set data (loaded separately) */
  mcqSet?: {
    id: string;
    title: string;
    slides: Array<{
      question: string;
      questionType: 'multipleChoice' | 'multipleCorrect';
      options: string[];
      correctAnswer: string;
      correctAnswers: string[];
      imageData: string | null;
    }>;
  };
}

/**
 * Submission with Assignment Data
 * Extended submission interface that includes assignment information
 */
export interface SubmissionWithAssignment extends Submission {
  /** The assignment data (loaded separately) */
  assignment?: Assignment;
}
