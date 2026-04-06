import { useState, useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp, getDocs, doc, updateDoc, getDoc, limit, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { speakText as ttsSpeakText, stopSpeaking as ttsStopSpeaking } from '../utils/ttsService';
import { validateMessageInput, validateSearchQuery } from '../utils/validation';
import './Home.css';
import './Landing.css';
import './Messages.css';
import logoImage from '../assets/images/logo.png';
import teacherProfileImage from '../assets/images/teacherprofile.png';
import parentProfileImage from '../assets/images/parentprofile.png';
import studentProfileImage from '../assets/images/studentprofile.png';
import audioIcon from '../assets/images/audioicon.png';
import { SimplifyIcon } from '../components/SimplifyIcon';
import { useAppAccessibility } from '../contexts/AppAccessibilityContext';

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  senderEmail: string;
  receiverEmail: string;
  content: string;
  timestamp: Timestamp | { seconds: number; nanoseconds: number };
  read: boolean;
  reactions?: { [uid: string]: string };
  edited?: boolean;
  editedAt?: Timestamp | { seconds: number; nanoseconds: number };
  audioUrl?: string;
  audioMimeType?: string;
  isVoiceMessage?: boolean;
  transcript?: string;
}

interface MessageRequest {
  id: string;
  requestorId: string;
  requestedId: string;
  requestorEmail: string;
  requestedEmail: string;
  requestorRole: 'student' | 'teacher' | 'parent';
  requestedRole: 'student' | 'teacher' | 'parent';
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
}


interface Conversation {
  otherUserId: string;
  otherUserEmail: string;
  otherUserRole: 'student' | 'teacher' | 'parent';
  lastMessage: string;
  lastMessageTime: Timestamp | { seconds: number; nanoseconds: number };
  unreadCount: number;
  canMessage: boolean;
}

interface ContactUser {
  uid: string;
  email: string;
  role: 'student' | 'teacher' | 'parent';
  canMessage: boolean;
  hasPendingRequest: boolean;
  requestId?: string;
}

export function Messages() {
  const { currentUser, userRole } = useAuth();
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<ContactUser[]>([]);
  const [messageRequests, setMessageRequests] = useState<MessageRequest[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'conversations' | 'contacts' | 'requests'>('conversations');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContactUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showReactionPickerFor, setShowReactionPickerFor] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [typingStatus, setTypingStatus] = useState<{ [userId: string]: boolean }>({});
  const [typingTimeoutRef, setTypingTimeoutRef] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const maxWidth = Math.min(600, window.innerWidth * 0.5);
    return maxWidth;
  });
  const [isResizing, setIsResizing] = useState(false);
  const isCompact = sidebarWidth < 320;
  
  // Text-to-Speech state
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakingMessageIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    speakingMessageIdRef.current = speakingMessageId;
  }, [speakingMessageId]);

  const {
    messagesContainerClassNames: containerClassNames,
    simplificationMode,
    setSimplificationMode,
    showAccessibilitySettings,
    setShowAccessibilitySettings,
    ttsProvider,
    elevenLabsApiKey,
    messageSpacing,
    viewMode,
  } = useAppAccessibility();

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const [speechToTextSupported, setSpeechToTextSupported] = useState(false);
  const finalTranscriptRef = useRef<string>('');
  
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);
  
  useEffect(() => {
    if (isListening) {
      finalTranscriptRef.current = newMessage.replace(/[\[\(].*?[\]\)]/g, '').trim();
      setNewMessage(finalTranscriptRef.current);
    } else {
      setNewMessage(finalTranscriptRef.current.trim());
    }
  }, [isListening]);

  // Voice Message state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playingVoiceMessageId, setPlayingVoiceMessageId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  // Transcription state and refs for Create Transcript feature
  const [transcribingMessageId, setTranscribingMessageId] = useState<string | null>(null);
  const transcriptionRecognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptionTextRef = useRef<string>('');
  const transcriptionAudioRef = useRef<HTMLAudioElement | null>(null);
  // Track which transcripts are closed (hidden but not deleted)
  const [closedTranscripts, setClosedTranscripts] = useState<Set<string>>(new Set());

  // Check for speech recognition support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechToTextSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let latestInterimTranscript = '';
        let allFinalText = '';
        
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          
          if (result.isFinal) {
            allFinalText += transcript + ' ';
          } else if (i === event.results.length - 1) {
            latestInterimTranscript = transcript;
          }
        }
        
        if (allFinalText) {
          finalTranscriptRef.current = allFinalText;
        }
        
        const finalText = finalTranscriptRef.current.trim();
        const displayText = finalText + (latestInterimTranscript ? ' ' + latestInterimTranscript : '');
        setNewMessage(displayText);
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          return;
        }
        setIsListening(false);
        if (recognition) {
          try {
            recognition.stop();
          } catch (e) {
            // whatever
          }
        }
      };
      
      recognition.onend = () => {
        if (recognitionRef.current && isListeningRef.current) {
          try {
            recognition.start();
          } catch (e) {
            setIsListening(false);
          }
        }
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  useEffect(() => {
    if (!recognitionRef.current) return;
    
    if (isListening) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Error starting speech recognition:', e);
        setIsListening(false);
      }
    } else {
      try {
        recognitionRef.current.stop();
        setNewMessage(finalTranscriptRef.current.trim());
      } catch (e) {}
    }
  }, [isListening]);

  useEffect(() => {
    if (!currentUser || !userRole) return;

    const fetchContacts = async () => {
      try {
        setLoading(true);
        const contactsList: ContactUser[] = [];

        if (userRole === 'student') {
          const teacherConnectionsQuery = query(
            collection(db, 'connections'),
            where('studentId', '==', currentUser.uid)
          );
          const teacherConnectionsSnapshot = await getDocs(teacherConnectionsQuery);
          
          teacherConnectionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            contactsList.push({
              uid: data.teacherId,
              email: data.teacherEmail,
              role: 'teacher',
              canMessage: true, // Connected = can message
              hasPendingRequest: false
            });
          });

          // Get connected parents
          const parentConnectionsQuery = query(
            collection(db, 'parentConnections'),
            where('studentId', '==', currentUser.uid)
          );
          const parentConnectionsSnapshot = await getDocs(parentConnectionsQuery);
          
          parentConnectionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            contactsList.push({
              uid: data.parentId,
              email: data.parentEmail,
              role: 'parent',
              canMessage: true, // Connected = can message
              hasPendingRequest: false
            });
          });

        } else if (userRole === 'teacher') {
          // Teachers can message their connected students and other teachers they're connected with
          
          // Get connected students
          const studentConnectionsQuery = query(
            collection(db, 'connections'),
            where('teacherId', '==', currentUser.uid)
          );
          const studentConnectionsSnapshot = await getDocs(studentConnectionsQuery);
          
          studentConnectionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            contactsList.push({
              uid: data.studentId,
              email: data.studentEmail,
              role: 'student',
              canMessage: true, // Connected = can message
              hasPendingRequest: false
            });
          });

          // Get connected parents (through their students)
          // For each connected student, find their connected parents
          const allParentConnections = await getDocs(collection(db, 'parentConnections'));
          const studentIds = new Set(studentConnectionsSnapshot.docs.map(doc => doc.data().studentId));
          
          allParentConnections.docs.forEach(doc => {
            const data = doc.data();
            if (studentIds.has(data.studentId)) {
              // This parent is connected to one of my students
              if (!contactsList.find(c => c.uid === data.parentId)) {
                contactsList.push({
                  uid: data.parentId,
                  email: data.parentEmail,
                  role: 'parent',
                  canMessage: true, // Connected = can message
                  hasPendingRequest: false
                });
              }
            }
          });

        } else if (userRole === 'parent') {
          // Parents can message their connected students and other parents they're connected with (through shared students)
          
          // Get connected students
          const studentConnectionsQuery = query(
            collection(db, 'parentConnections'),
            where('parentId', '==', currentUser.uid)
          );
          const studentConnectionsSnapshot = await getDocs(studentConnectionsQuery);
          
          studentConnectionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            contactsList.push({
              uid: data.studentId,
              email: data.studentEmail,
              role: 'student',
              canMessage: true, // Connected = can message
              hasPendingRequest: false
            });
          });

          // Get other parents connected to the same students
          const studentIds = new Set(studentConnectionsSnapshot.docs.map(doc => doc.data().studentId));
          const allParentConnections = await getDocs(collection(db, 'parentConnections'));
          
          allParentConnections.docs.forEach(doc => {
            const data = doc.data();
            if (studentIds.has(data.studentId) && data.parentId !== currentUser.uid) {
              // This parent is connected to one of my children
              if (!contactsList.find(c => c.uid === data.parentId)) {
                contactsList.push({
                  uid: data.parentId,
                  email: data.parentEmail,
                  role: 'parent',
                  canMessage: true, // Connected = can message
                  hasPendingRequest: false
                });
              }
            }
          });

          // Get teachers connected to my children
          const allTeacherConnections = await getDocs(collection(db, 'connections'));
          allTeacherConnections.docs.forEach(doc => {
            const data = doc.data();
            if (studentIds.has(data.studentId)) {
              // This teacher is connected to one of my children
              if (!contactsList.find(c => c.uid === data.teacherId)) {
                contactsList.push({
                  uid: data.teacherId,
                  email: data.teacherEmail,
                  role: 'teacher',
                  canMessage: true, // Connected = can message
                  hasPendingRequest: false
                });
              }
            }
          });
        }

        const contactsWithStatus = await Promise.all(contactsList.map(async (contact) => {
          const permissionQuery1 = query(
            collection(db, 'messagePermissions'),
            where('userId1', '==', currentUser.uid),
            where('userId2', '==', contact.uid)
          );
          const permissionQuery2 = query(
            collection(db, 'messagePermissions'),
            where('userId1', '==', contact.uid),
            where('userId2', '==', currentUser.uid)
          );

          const [permission1Snapshot, permission2Snapshot] = await Promise.all([
            getDocs(permissionQuery1),
            getDocs(permissionQuery2)
          ]);

          let hasPermission = !permission1Snapshot.empty || !permission2Snapshot.empty;

          if (!hasPermission && contact.canMessage) {
            try {
              await addDoc(collection(db, 'messagePermissions'), {
                userId1: currentUser.uid,
                userId2: contact.uid,
                user1Email: currentUser.email,
                user2Email: contact.email,
                createdAt: serverTimestamp()
              });
              hasPermission = true;
            } catch (error) {
              console.error('Error creating message permission:', error);
            }
          }

          const outgoingRequestQuery = query(
            collection(db, 'messageRequests'),
            where('requestorId', '==', currentUser.uid),
            where('requestedId', '==', contact.uid),
            where('status', '==', 'pending')
          );
          const incomingRequestQuery = query(
            collection(db, 'messageRequests'),
            where('requestorId', '==', contact.uid),
            where('requestedId', '==', currentUser.uid),
            where('status', '==', 'pending')
          );

          const [outgoingSnapshot, incomingSnapshot] = await Promise.all([
            getDocs(outgoingRequestQuery),
            getDocs(incomingRequestQuery)
          ]);

          const hasPendingRequest = !outgoingSnapshot.empty || !incomingSnapshot.empty;

          return {
            ...contact,
            canMessage: hasPermission,
            hasPendingRequest,
            requestId: outgoingSnapshot.empty 
              ? (incomingSnapshot.empty ? undefined : incomingSnapshot.docs[0].id)
              : outgoingSnapshot.docs[0].id
          };
        }));

        setContacts(contactsWithStatus);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching contacts:', error);
        setLoading(false);
      }
    };

    fetchContacts();
  }, [currentUser, userRole]);

  useEffect(() => {
    if (!currentUser) return;

    let incomingRequests: MessageRequest[] = [];
    let outgoingRequests: MessageRequest[] = [];

    const updateRequests = () => {
      const allRequests = [...incomingRequests, ...outgoingRequests];
      console.log('Message requests updated:', {
        incoming: incomingRequests.length,
        outgoing: outgoingRequests.length,
        total: allRequests.length,
        requests: allRequests,
        currentUserUid: currentUser?.uid
      });
      
      // Log incoming requests specifically
      const incoming = allRequests.filter(req => req.requestedId === currentUser?.uid);
      console.log('Incoming requests for current user:', incoming);
      
      setMessageRequests(allRequests);
    };

    const incomingRequestsQueryWithOrder = query(
      collection(db, 'messageRequests'),
      where('requestedId', '==', currentUser.uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const outgoingRequestsQueryWithOrder = query(
      collection(db, 'messageRequests'),
      where('requestorId', '==', currentUser.uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const incomingRequestsQueryNoOrder = query(
      collection(db, 'messageRequests'),
      where('requestedId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );

    const outgoingRequestsQueryNoOrder = query(
      collection(db, 'messageRequests'),
      where('requestorId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );

    let unsubscribeIncoming: (() => void) | null = null;
    let unsubscribeOutgoing: (() => void) | null = null;

    try {
      unsubscribeIncoming = onSnapshot(
        incomingRequestsQueryWithOrder,
        (snapshot) => {
          incomingRequests = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as MessageRequest));
          updateRequests();
        },
        (error) => {
          console.warn('Error with orderBy for incoming requests, trying without orderBy:', error);
          unsubscribeIncoming = onSnapshot(incomingRequestsQueryNoOrder, (snapshot) => {
            incomingRequests = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            } as MessageRequest));
            incomingRequests.sort((a, b) => {
              const aTime = (a.createdAt as Timestamp).seconds;
              const bTime = (b.createdAt as Timestamp).seconds;
              return bTime - aTime;
            });
            updateRequests();
          });
        }
      );

      unsubscribeOutgoing = onSnapshot(
        outgoingRequestsQueryWithOrder,
        (snapshot) => {
          outgoingRequests = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as MessageRequest));
          updateRequests();
        },
        (error) => {
          console.warn('Error with orderBy for outgoing requests, trying without orderBy:', error);
          unsubscribeOutgoing = onSnapshot(outgoingRequestsQueryNoOrder, (snapshot) => {
            outgoingRequests = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            } as MessageRequest));
            outgoingRequests.sort((a, b) => {
              const aTime = (a.createdAt as Timestamp).seconds;
              const bTime = (b.createdAt as Timestamp).seconds;
              return bTime - aTime;
            });
            updateRequests();
          });
        }
      );
    } catch (error) {
      console.error('Error setting up message request listeners:', error);
      // Fallback to getDocs if onSnapshot fails entirely
      const fetchRequests = async () => {
        try {
          const [incomingSnapshot, outgoingSnapshot] = await Promise.all([
            getDocs(incomingRequestsQueryNoOrder).catch(() => ({ docs: [] })),
            getDocs(outgoingRequestsQueryNoOrder).catch(() => ({ docs: [] }))
          ]);

          incomingRequests = incomingSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as MessageRequest));

          outgoingRequests = outgoingSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as MessageRequest));

          updateRequests();
        } catch (fetchError) {
          console.error('Error fetching message requests:', fetchError);
        }
      };

      fetchRequests();
      // Poll every 5 seconds if real-time fails
      const interval = setInterval(fetchRequests, 5000);
      return () => clearInterval(interval);
    }

    return () => {
      if (unsubscribeIncoming) unsubscribeIncoming();
      if (unsubscribeOutgoing) unsubscribeOutgoing();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const conversationMap = new Map<string, Conversation>();
    const userDocCache = new Map<string, { email: string; role: 'student' | 'teacher' | 'parent' }>();
    const messageUnsubscribers = new Map<string, () => void>();

    const updateConversations = () => {
      const sortedConversations = Array.from(conversationMap.values()).sort((a, b) => {
        const aTime = (a.lastMessageTime as Timestamp).seconds;
        const bTime = (b.lastMessageTime as Timestamp).seconds;
        return bTime - aTime;
      });
      setConversations(sortedConversations);
    };

    const setupConversationForUser = async (otherUserId: string) => {
      // Get user info if not cached
      if (!userDocCache.has(otherUserId)) {
        try {
          const otherUserDocRef = doc(db, 'users', otherUserId);
          const otherUserDoc = await getDoc(otherUserDocRef);
          const userData = otherUserDoc.data();
          if (userData) {
            userDocCache.set(otherUserId, {
              email: userData.email || 'Unknown',
              role: userData.role || 'student'
            });
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          userDocCache.set(otherUserId, { email: 'Unknown', role: 'student' });
        }
      }

      const userInfo = userDocCache.get(otherUserId) || { email: 'Unknown', role: 'student' };

      // Listen to all messages for this conversation in real-time
      const sentQuery = query(
        collection(db, 'messages'),
        where('senderId', '==', currentUser.uid),
        where('receiverId', '==', otherUserId),
        orderBy('timestamp', 'desc'),
        limit(1)
      );

      const receivedQuery = query(
        collection(db, 'messages'),
        where('senderId', '==', otherUserId),
        where('receiverId', '==', currentUser.uid),
        orderBy('timestamp', 'desc'),
        limit(1)
      );

      const unreadQuery = query(
        collection(db, 'messages'),
        where('senderId', '==', otherUserId),
        where('receiverId', '==', currentUser.uid),
        where('read', '==', false)
      );

      let sentUnsub: (() => void) | null = null;
      let receivedUnsub: (() => void) | null = null;
      let unreadUnsub: (() => void) | null = null;

      const updateConversation = () => {
        // This will be called from the listeners below
        Promise.all([
          getDocs(sentQuery).catch(() => ({ docs: [] })),
          getDocs(receivedQuery).catch(() => ({ docs: [] })),
          getDocs(unreadQuery).catch(() => ({ docs: [] }))
        ]).then(([sentSnapshot, receivedSnapshot, unreadSnapshot]) => {
          const sentMsg = sentSnapshot.docs[0]?.data();
          const receivedMsg = receivedSnapshot.docs[0]?.data();
          const unreadCount = unreadSnapshot.docs.length;

          let lastMessage = 'Start a conversation';
          let lastMessageTime: Timestamp | { seconds: number; nanoseconds: number } = { 
            seconds: Math.floor(Date.now() / 1000), 
            nanoseconds: 0 
          } as Timestamp;

          if (sentMsg && receivedMsg) {
            if (sentMsg.timestamp.seconds > receivedMsg.timestamp.seconds) {
              lastMessage = sentMsg.content;
              lastMessageTime = sentMsg.timestamp;
            } else {
              lastMessage = receivedMsg.content;
              lastMessageTime = receivedMsg.timestamp;
            }
          } else if (sentMsg) {
            lastMessage = sentMsg.content;
            lastMessageTime = sentMsg.timestamp;
          } else if (receivedMsg) {
            lastMessage = receivedMsg.content;
            lastMessageTime = receivedMsg.timestamp;
          }

          conversationMap.set(otherUserId, {
            otherUserId,
            otherUserEmail: userInfo.email,
            otherUserRole: userInfo.role,
            lastMessage,
            lastMessageTime,
            unreadCount,
            canMessage: true
          });
          updateConversations();
        });
      };

      try {
        sentUnsub = onSnapshot(sentQuery, updateConversation, (error) => {
          console.warn('Error listening to sent messages:', error);
          // Try without orderBy
          const sentQueryNoOrder = query(
            collection(db, 'messages'),
            where('senderId', '==', currentUser.uid),
            where('receiverId', '==', otherUserId)
          );
          sentUnsub = onSnapshot(sentQueryNoOrder, () => updateConversation());
        });

        receivedUnsub = onSnapshot(receivedQuery, updateConversation, (error) => {
          console.warn('Error listening to received messages:', error);
          const receivedQueryNoOrder = query(
            collection(db, 'messages'),
            where('senderId', '==', otherUserId),
            where('receiverId', '==', currentUser.uid)
          );
          receivedUnsub = onSnapshot(receivedQueryNoOrder, () => updateConversation());
        });

        unreadUnsub = onSnapshot(unreadQuery, () => updateConversation());

        messageUnsubscribers.set(otherUserId, () => {
          if (sentUnsub) sentUnsub();
          if (receivedUnsub) receivedUnsub();
          if (unreadUnsub) unreadUnsub();
        });
      } catch (error) {
        console.error('Error setting up conversation listeners:', error);
      }

      updateConversation();
    };

    const permissionsQuery1 = query(
      collection(db, 'messagePermissions'),
      where('userId1', '==', currentUser.uid)
    );
    const permissionsQuery2 = query(
      collection(db, 'messagePermissions'),
      where('userId2', '==', currentUser.uid)
    );

    const unsubscribePerms1 = onSnapshot(permissionsQuery1, (snapshot) => {
      const permittedUserIds = new Set<string>();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        permittedUserIds.add(data.userId2);
      });

      getDocs(permissionsQuery2).then(perms2Snapshot => {
        perms2Snapshot.docs.forEach(doc => {
          const data = doc.data();
          permittedUserIds.add(data.userId1);
        });

        permittedUserIds.forEach(userId => {
          if (!messageUnsubscribers.has(userId)) {
            setupConversationForUser(userId);
          }
        });

        const currentUserIds = Array.from(permittedUserIds);
        conversationMap.forEach((_conv, userId) => {
          if (!currentUserIds.includes(userId)) {
            conversationMap.delete(userId);
            const unsub = messageUnsubscribers.get(userId);
            if (unsub) {
              unsub();
              messageUnsubscribers.delete(userId);
            }
          }
        });
        updateConversations();
      });
    });

    const unsubscribePerms2 = onSnapshot(permissionsQuery2, () => {
      getDocs(permissionsQuery1);
    });

    return () => {
      unsubscribePerms1();
      unsubscribePerms2();
      messageUnsubscribers.forEach(unsub => unsub());
      messageUnsubscribers.clear();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !selectedConversation) {
      setTypingStatus({});
      return;
    }
    
    const conversationId1 = `${currentUser.uid}_${selectedConversation}`;
    const conversationId2 = `${selectedConversation}_${currentUser.uid}`;
    
    const unsubscribeTyping1 = onSnapshot(
      query(
        collection(db, 'typingStatus'),
        where('conversationId', '==', conversationId1),
        where('userId', '==', selectedConversation),
        where('isTyping', '==', true)
      ),
      (snapshot) => {
        if (!snapshot.empty) {
          setTypingStatus(prev => ({ ...prev, [selectedConversation]: true }));
        } else {
          setTypingStatus(prev => {
            const updated = { ...prev };
            delete updated[selectedConversation];
            return updated;
          });
        }
      },
      (error) => {
        console.error('Error listening to typing status:', error);
      }
    );

    const unsubscribeTyping2 = onSnapshot(
      query(
        collection(db, 'typingStatus'),
        where('conversationId', '==', conversationId2),
        where('userId', '==', selectedConversation),
        where('isTyping', '==', true)
      ),
      (snapshot) => {
        if (!snapshot.empty) {
          setTypingStatus(prev => ({ ...prev, [selectedConversation]: true }));
        } else {
          setTypingStatus(prev => {
            const updated = { ...prev };
            delete updated[selectedConversation];
            return updated;
          });
        }
      },
      (error) => {
        console.error('Error listening to typing status (reverse):', error);
      }
    );

    return () => {
      unsubscribeTyping1();
      unsubscribeTyping2();
    };
  }, [currentUser, selectedConversation]);

  // Update typing status when user types
  const updateTypingStatus = async (isTyping: boolean) => {
    if (!currentUser || !selectedConversation) return;

    try {
      const conversationId = `${currentUser.uid}_${selectedConversation}`;
      const typingStatusRef = doc(db, 'typingStatus', `${conversationId}_${currentUser.uid}`);
      
      if (isTyping) {
        await setDoc(typingStatusRef, {
          conversationId,
          userId: currentUser.uid,
          isTyping: true,
          timestamp: serverTimestamp()
        }, { merge: true });
      } else {
        await deleteDoc(typingStatusRef);
      }
    } catch (error) {
      console.error('Error updating typing status:', error);
    }
  };

  // Handle typing with debounce
  const handleTyping = () => {
    if (!currentUser || !selectedConversation) return;

    updateTypingStatus(true);

    // Clear existing timeout
    if (typingTimeoutRef) {
      clearTimeout(typingTimeoutRef);
    }

    // Set new timeout to clear typing status after 3 seconds of inactivity
    const timeout = setTimeout(() => {
      updateTypingStatus(false);
      setTypingTimeoutRef(null);
    }, 3000);

    setTypingTimeoutRef(timeout);
  };

  // Clear typing status when message is sent or input is cleared
  useEffect(() => {
    if (!newMessage.trim() && typingTimeoutRef) {
      clearTimeout(typingTimeoutRef);
      updateTypingStatus(false);
      setTypingTimeoutRef(null);
    }
  }, [newMessage]);

  // Fetch messages for selected conversation
  useEffect(() => {
    if (!currentUser || !selectedConversation) {
      setMessages([]);
      return;
    }

    console.log('Fetching messages for conversation:', selectedConversation);

    let sentMessages: Message[] = [];
    let receivedMessages: Message[] = [];

    const updateMessages = () => {
      const allMessages = [...sentMessages, ...receivedMessages].map(msg => ({
        ...msg,
        reactions: msg.reactions || {}
      })).sort((a, b) => {
        const aTime = (a.timestamp as Timestamp).seconds;
        const bTime = (b.timestamp as Timestamp).seconds;
        return aTime - bTime;
      });
      console.log('Updated messages:', { total: allMessages.length, sent: sentMessages.length, received: receivedMessages.length });
      setMessages(allMessages);

      // Mark received messages as read
      receivedMessages.forEach(msg => {
        if (!msg.read && msg.receiverId === currentUser.uid) {
          updateMessageRead(msg.id);
        }
      });
    };

    // Try with orderBy first, fallback to no orderBy if index is missing
    const sentQueryWithOrder = query(
      collection(db, 'messages'),
      where('senderId', '==', currentUser.uid),
      where('receiverId', '==', selectedConversation),
      orderBy('timestamp', 'asc')
    );

    const receivedQueryWithOrder = query(
      collection(db, 'messages'),
      where('senderId', '==', selectedConversation),
      where('receiverId', '==', currentUser.uid),
      orderBy('timestamp', 'asc')
    );

    const sentQueryNoOrder = query(
      collection(db, 'messages'),
      where('senderId', '==', currentUser.uid),
      where('receiverId', '==', selectedConversation)
    );

    const receivedQueryNoOrder = query(
      collection(db, 'messages'),
      where('senderId', '==', selectedConversation),
      where('receiverId', '==', currentUser.uid)
    );

    let unsubscribeSent: (() => void) | null = null;
    let unsubscribeReceived: (() => void) | null = null;

    // Try with orderBy first
    try {
      unsubscribeSent = onSnapshot(
        sentQueryWithOrder,
        (snapshot) => {
          sentMessages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Message));
          updateMessages();
        },
        (error) => {
          console.warn('Error with orderBy for sent messages, trying without orderBy:', error);
          // Fallback to no orderBy
          unsubscribeSent = onSnapshot(sentQueryNoOrder, (snapshot) => {
            sentMessages = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            } as Message));
            // Sort manually
            sentMessages.sort((a, b) => {
              const aTime = (a.timestamp as Timestamp).seconds;
              const bTime = (b.timestamp as Timestamp).seconds;
              return aTime - bTime;
            });
            updateMessages();
          });
        }
      );

      unsubscribeReceived = onSnapshot(
        receivedQueryWithOrder,
        (snapshot) => {
          receivedMessages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Message));
          updateMessages();
        },
        (error) => {
          console.warn('Error with orderBy for received messages, trying without orderBy:', error);
          // Fallback to no orderBy
          unsubscribeReceived = onSnapshot(receivedQueryNoOrder, (snapshot) => {
            receivedMessages = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            } as Message));
            // Sort manually
            receivedMessages.sort((a, b) => {
              const aTime = (a.timestamp as Timestamp).seconds;
              const bTime = (b.timestamp as Timestamp).seconds;
              return aTime - bTime;
            });
            updateMessages();
          });
        }
      );
    } catch (error) {
      console.error('Error setting up message listeners:', error);
      // Fallback to getDocs if onSnapshot fails
      const fetchMessages = async () => {
        try {
          const [sentSnapshot, receivedSnapshot] = await Promise.all([
            getDocs(sentQueryNoOrder).catch(() => ({ docs: [] })),
            getDocs(receivedQueryNoOrder).catch(() => ({ docs: [] }))
          ]);

          sentMessages = sentSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Message));

          receivedMessages = receivedSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Message));

          updateMessages();
        } catch (fetchError) {
          console.error('Error fetching messages:', fetchError);
        }
      };

      fetchMessages();
      // Poll every 3 seconds if real-time fails
      const interval = setInterval(fetchMessages, 3000);
      return () => {
        clearInterval(interval);
      };
    }

    return () => {
      if (unsubscribeSent) unsubscribeSent();
      if (unsubscribeReceived) unsubscribeReceived();
    };
  }, [currentUser, selectedConversation]);

  const updateMessageRead = async (messageId: string) => {
    try {
      const messageRef = doc(db, 'messages', messageId);
      await updateDoc(messageRef, { read: true });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  // Toggle reaction on a message
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!currentUser) return;

    try {
      const messageRef = doc(db, 'messages', messageId);
      const messageDoc = await getDoc(messageRef);
      
      if (!messageDoc.exists()) {
        console.error('Message not found');
        return;
      }

      const messageData = messageDoc.data();
      const currentReactions = messageData.reactions || {};
      const userReaction = currentReactions[currentUser.uid];

      // If user already has this reaction, remove it; otherwise, add/update it
      const newReactions = { ...currentReactions };
      if (userReaction === emoji) {
        // Remove reaction if it's the same emoji
        delete newReactions[currentUser.uid];
      } else {
        // Add or update reaction
        newReactions[currentUser.uid] = emoji;
      }

      await updateDoc(messageRef, { reactions: newReactions });
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  // Common emoji reactions for quick access
  const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

  // Check if a message can be edited (within 5 minutes)
  const canEditMessage = (message: Message): boolean => {
    if (!currentUser || message.senderId !== currentUser.uid) return false;
    
    try {
      const timestamp = message.timestamp as Timestamp | { seconds: number; nanoseconds: number };
      
      // Handle both Firestore Timestamp and plain object formats
      let messageTime: number;
      if (timestamp && typeof timestamp === 'object') {
        if ('seconds' in timestamp && timestamp.seconds) {
          messageTime = timestamp.seconds * 1000;
          if ('nanoseconds' in timestamp && timestamp.nanoseconds) {
            messageTime += timestamp.nanoseconds / 1000000;
          }
        } else {
          // Fallback: if timestamp is missing or invalid, don't allow editing
          return false;
        }
      } else {
        return false;
      }
      
      const now = Date.now();
      const timeDiff = now - messageTime;
      const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      return timeDiff >= 0 && timeDiff <= fiveMinutes;
    } catch (error) {
      console.error('Error checking if message can be edited:', error);
      return false;
    }
  };

  // Edit a message
  const startEditingMessage = (message: Message) => {
    if (!canEditMessage(message)) return;
    setEditingMessageId(message.id);
    setEditContent(message.content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const saveEditedMessage = async (messageId: string) => {
    if (!editContent.trim() || !currentUser) {
      alert('Message cannot be empty.');
      return;
    }

    try {
      // Verify the message still exists and user can edit it
      const messageRef = doc(db, 'messages', messageId);
      const messageDoc = await getDoc(messageRef);
      
      if (!messageDoc.exists()) {
        alert('Message not found.');
        setEditingMessageId(null);
        setEditContent('');
        return;
      }

      const messageData = messageDoc.data();
      if (messageData.senderId !== currentUser.uid) {
        alert('You can only edit your own messages.');
        setEditingMessageId(null);
        setEditContent('');
        return;
      }

      // Check if still within 5 minute window
      const timestamp = messageData.timestamp as Timestamp | { seconds: number; nanoseconds: number };
      let messageTime: number;
      if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
        messageTime = (timestamp.seconds || 0) * 1000;
        if ('nanoseconds' in timestamp && timestamp.nanoseconds) {
          messageTime += timestamp.nanoseconds / 1000000;
        }
        const now = Date.now();
        const timeDiff = now - messageTime;
        const fiveMinutes = 5 * 60 * 1000;
        
        if (timeDiff < 0 || timeDiff > fiveMinutes) {
          alert('Message can only be edited within 5 minutes of sending.');
          setEditingMessageId(null);
          setEditContent('');
          return;
        }
      } else {
        // If timestamp is missing or invalid, don't allow editing
        alert('Unable to verify message timestamp. Cannot edit.');
        setEditingMessageId(null);
        setEditContent('');
        return;
      }

      await updateDoc(messageRef, {
        content: editContent.trim(),
        edited: true,
        editedAt: serverTimestamp()
      });
      
      setEditingMessageId(null);
      setEditContent('');
    } catch (error: any) {
      console.error('Error editing message:', error);
      if (error.code === 'permission-denied') {
        alert('You do not have permission to edit this message.');
      } else {
        alert(`Failed to edit message: ${error.message || 'Please try again.'}`);
      }
      setEditingMessageId(null);
      setEditContent('');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!currentUser) return;
    try {
      setDeletingMessageId(messageId);
      const messageRef = doc(db, 'messages', messageId);
      const messageDoc = await getDoc(messageRef);
      if (!messageDoc.exists()) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return;
      }
      if (messageDoc.data().senderId !== currentUser.uid) {
        alert('You can only delete messages you sent.');
        return;
      }
      await deleteDoc(messageRef);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (playingVoiceMessageId === messageId && audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current = null;
        setPlayingVoiceMessageId(null);
      }
      if (transcribingMessageId === messageId) {
        setTranscribingMessageId(null);
      }
      setClosedTranscripts((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      if (editingMessageId === messageId) {
        cancelEditing();
      }
      setShowReactionPickerFor((prev) => (prev === messageId ? null : prev));
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Could not delete message. Please try again.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  // Start/stop voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      
      // Check available MIME types and use the most compatible one
      // Safari compatibility: Safari can record webm but can't play it back
      // We need formats that Safari can both record AND play
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      
      let mimeType = 'audio/webm';
      let codec = 'codecs=opus';
      
      // For Safari, prioritize formats it can actually play back
      if (isSafari) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
          codec = '';
        } else if (MediaRecorder.isTypeSupported('audio/m4a')) {
          mimeType = 'audio/m4a';
          codec = '';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
          codec = '';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          // Safari can record webm but might not play it - will need conversion
          mimeType = 'audio/webm';
          codec = '';
        }
      } else {
        // For other browsers, prefer webm with opus (best quality)
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm';
          codec = 'codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
          codec = '';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg';
          codec = 'codecs=opus';
        }
      }
      
      const fullMimeType = codec ? `${mimeType};${codec}` : mimeType;
      console.log('Using MIME type for recording:', fullMimeType);
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: fullMimeType
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      // Store MIME type for later use
      (mediaRecorder as any).recordedMimeType = fullMimeType;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Use the same MIME type that was used for recording
        const recordedMimeType = (mediaRecorder as any).recordedMimeType || fullMimeType;
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedMimeType });
        setAudioBlob(audioBlob);
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        setRecordingDuration(0);
        stream.getTracks().forEach(track => track.stop());
        console.log('Recording stopped, blob created:', {
          size: audioBlob.size,
          type: audioBlob.type,
          mimeType: recordedMimeType
        });
      };

      mediaRecorder.start(100); // Collect data every 100ms for better quality
      setIsRecording(true);
      setRecordingDuration(0);

      // Update duration every second
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  // Convert audio blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        console.log('Converted blob to base64:', {
          originalType: blob.type,
          dataUrlLength: base64String.length,
          dataUrlPreview: base64String.substring(0, 50)
        });
        resolve(base64String);
      };
      reader.onerror = (error) => {
        console.error('Error converting blob to base64:', error);
        reject(error);
      };
      reader.readAsDataURL(blob);
    });
  };

  // Send voice message
  const sendVoiceMessage = async () => {
    if (!audioBlob || !selectedConversation || !currentUser) {
      return;
    }

    try {
      const base64Audio = await blobToBase64(audioBlob);
      
      // Get receiver email
      let receiverEmail = '';
      const conversation = conversations.find(c => c.otherUserId === selectedConversation);
      const contact = contacts.find(c => c.uid === selectedConversation);
      
      if (conversation) {
        receiverEmail = conversation.otherUserEmail;
      } else if (contact) {
        receiverEmail = contact.email;
      } else {
        const userDoc = await getDoc(doc(db, 'users', selectedConversation));
        receiverEmail = userDoc.data()?.email || 'Unknown';
      }

      // Check permissions
      const permissionQuery1 = query(
        collection(db, 'messagePermissions'),
        where('userId1', '==', currentUser.uid),
        where('userId2', '==', selectedConversation)
      );
      const permissionQuery2 = query(
        collection(db, 'messagePermissions'),
        where('userId1', '==', selectedConversation),
        where('userId2', '==', currentUser.uid)
      );

      const [permission1Snapshot, permission2Snapshot] = await Promise.all([
        getDocs(permissionQuery1),
        getDocs(permissionQuery2)
      ]);

      const hasPermission = !permission1Snapshot.empty || !permission2Snapshot.empty;
      
      if (!hasPermission) {
        alert('You do not have permission to message this user.');
        return;
      }

      // Extract MIME type from the audio blob
      const audioMimeType = audioBlob.type || 'audio/webm';
      
      await addDoc(collection(db, 'messages'), {
        senderId: currentUser.uid,
        receiverId: selectedConversation,
        senderEmail: currentUser.email,
        receiverEmail: receiverEmail,
        content: '🎤 Voice message',
        audioUrl: base64Audio,
        audioMimeType: audioMimeType,
        isVoiceMessage: true,
        timestamp: serverTimestamp(),
        read: false,
        reactions: {}
      });
      
      // Note: Auto-transcription removed - users can click "Create Transcript" button to transcribe

      // Update conversations
      setConversations(prev => {
        const existingIndex = prev.findIndex(c => c.otherUserId === selectedConversation);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            lastMessage: '🎤 Voice message',
            lastMessageTime: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as Timestamp
          };
          const [moved] = updated.splice(existingIndex, 1);
          return [moved, ...updated];
        }
        return prev;
      });

      // Clean up
      setAudioBlob(null);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
    } catch (error: any) {
      console.error('Error sending voice message:', error);
      alert(`Error sending voice message: ${error.message || 'Unknown error'}`);
    }
  };

  // Close/hide transcript (doesn't delete from Firestore, just hides in UI)
  const closeTranscript = (messageId: string) => {
    setClosedTranscripts(prev => new Set(prev).add(messageId));
  };

  // Reopen/show transcript
  const reopenTranscript = (messageId: string) => {
    setClosedTranscripts(prev => {
      const newSet = new Set(prev);
      newSet.delete(messageId);
      return newSet;
    });
  };

  // Create transcript for voice message - ONLY when user clicks button
  const createTranscript = async (messageId: string, audioDataUrl: string) => {
    // ❌ STRICT SPEC: Do NOT auto-transcribe - only when user clicks button
    if (!speechToTextSupported) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    // Check if already transcribing this message
    if (transcribingMessageId === messageId) {
      return;
    }

    // Stop any ongoing transcription
    if (transcriptionRecognitionRef.current) {
      try {
        transcriptionRecognitionRef.current.stop();
      } catch (e) {
        // Ignore errors
      }
    }
    if (transcriptionAudioRef.current) {
      transcriptionAudioRef.current.pause();
      transcriptionAudioRef.current.currentTime = 0;
      transcriptionAudioRef.current = null;
    }

    // Check if transcript already exists
    try {
      const messageRef = doc(db, 'messages', messageId);
      const messageDoc = await getDoc(messageRef);
      if (messageDoc.exists() && messageDoc.data().transcript) {
        alert('This voice message already has a transcript.');
        return;
      }
    } catch (error) {
      console.error('Error checking existing transcript:', error);
    }

    // Set loading state - button will be disabled
    setTranscribingMessageId(messageId);
    transcriptionTextRef.current = '';

    try {
      // Create SpeechRecognition instance
      const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('Speech recognition is not available in your browser.');
        setTranscribingMessageId(null);
        return;
      }
      
      const recognition = new SpeechRecognition();
      transcriptionRecognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true; // Enable interim results to capture all text
      recognition.lang = 'en-US';
      
      const audio = new Audio(audioDataUrl);
      transcriptionAudioRef.current = audio;
      audio.volume = 0.3; // Play at low volume so user knows it's processing
      
      // Store all transcripts (both interim and final) to ensure we capture everything
      const allTranscripts: string[] = [];
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentTranscript = '';
        let hasNewFinal = false;
        
        // Process all results to capture both interim and final transcripts
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          
          if (result.isFinal) {
            // Final result - add to our collection
            allTranscripts[i] = transcript;
            currentTranscript += transcript + ' ';
            hasNewFinal = true;
            console.log(`Final transcript segment ${i}:`, transcript);
          } else {
            // Interim result - store temporarily
            allTranscripts[i] = transcript;
            console.log(`Interim transcript segment ${i}:`, transcript);
          }
        }
        
        // Update the ref with all accumulated transcripts
        if (hasNewFinal || currentTranscript) {
          // Combine all final transcripts
          const finalText = allTranscripts
            .filter((t, idx) => t && event.results[idx]?.isFinal)
            .join(' ');
          
          // Also include the latest interim result if available
          const latestInterim = allTranscripts
            .map((t, idx) => event.results[idx]?.isFinal ? null : t)
            .filter(t => t)
            .slice(-1)[0];
          
          if (latestInterim) {
            transcriptionTextRef.current = finalText + ' ' + latestInterim;
          } else {
            transcriptionTextRef.current = finalText;
          }
          
          console.log('Current accumulated transcript:', transcriptionTextRef.current);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Transcription error:', event.error);
        // STRICT SPEC: Error handling - show error, re-enable button, do NOT delete audio
        alert('Transcription failed. Try again.');
        
        setTranscribingMessageId(null);
        if (transcriptionRecognitionRef.current) {
          transcriptionRecognitionRef.current = null;
        }
        if (transcriptionAudioRef.current) {
          transcriptionAudioRef.current.pause();
          transcriptionAudioRef.current = null;
        }
        transcriptionTextRef.current = '';
      };
      
      recognition.onend = async () => {
        // Wait a moment to ensure all final results are processed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get the final transcript from the ref
        let finalTranscript = transcriptionTextRef.current.trim();
        
        console.log('Final transcript to save:', finalTranscript);
        console.log('Transcript length:', finalTranscript.length);
        
        // STRICT SPEC: Save transcript as plain text (no markdown, no formatting)
        if (finalTranscript && currentUser) {
          try {
            const messageRef = doc(db, 'messages', messageId);
            await updateDoc(messageRef, {
              transcript: finalTranscript // Plain text only
            });
            console.log('Full transcript saved successfully');
            // STRICT SPEC: Transcript persists after refresh (saved to Firestore)
            // UI will automatically update via onSnapshot listener
          } catch (error: any) {
            console.error('Error saving transcript:', error);
            // STRICT SPEC: Error handling - show error, re-enable button
            alert('Transcription failed. Try again.');
            setTranscribingMessageId(null);
          }
        } else if (!finalTranscript) {
          // STRICT SPEC: Error handling - show error, re-enable button
          alert('Transcription failed. Try again.');
          setTranscribingMessageId(null);
        } else {
          setTranscribingMessageId(null);
        }
        
        // Cleanup
        transcriptionRecognitionRef.current = null;
        if (transcriptionAudioRef.current) {
          transcriptionAudioRef.current.pause();
          transcriptionAudioRef.current = null;
        }
        transcriptionTextRef.current = '';
      };
      
      // Ensure audio is fully loaded before starting
      audio.onloadeddata = () => {
        console.log('Audio loaded, starting transcription');
        // Start recognition first
        try {
          recognition.start();
          console.log('Speech recognition started');
        } catch (err: any) {
          console.error('Error starting recognition:', err);
          alert('Error starting transcription. Please try again.');
          setTranscribingMessageId(null);
          return;
        }
        
        // Then play the audio after a short delay
        setTimeout(() => {
          audio.play().catch(err => {
            console.error('Error playing audio for transcription:', err);
            setTranscribingMessageId(null);
            if (transcriptionRecognitionRef.current) {
              try {
                transcriptionRecognitionRef.current.stop();
              } catch (e) {
                // Ignore
              }
              transcriptionRecognitionRef.current = null;
            }
            alert('Error playing voice message for transcription. Please try again.');
          });
        }, 300);
      };
      
      // Handle audio loading errors
      audio.onerror = (err) => {
        console.error('Audio loading error:', err);
        alert('Error loading audio for transcription. Please try again.');
        setTranscribingMessageId(null);
        if (transcriptionRecognitionRef.current) {
          try {
            transcriptionRecognitionRef.current.stop();
          } catch (e) {
            // Ignore
          }
          transcriptionRecognitionRef.current = null;
        }
      };
      
      // Stop recognition when audio ends - wait longer to capture all text
      audio.onended = () => {
        console.log('Audio playback ended, waiting for final transcript...');
        // Wait longer to ensure all final results are captured
        setTimeout(() => {
          if (transcriptionRecognitionRef.current) {
            try {
              console.log('Stopping recognition after audio ended');
              transcriptionRecognitionRef.current.stop();
            } catch (e) {
              // Recognition might have already ended, which is fine
              console.log('Recognition already ended or error stopping:', e);
            }
          }
        }, 2000); // Give more time to process final results
      };
      
      // Load the audio to trigger onloadeddata
      audio.load();
      
    } catch (error: any) {
      console.error('Error setting up transcription:', error);
      alert(`Error starting transcription: ${error.message}`);
      setTranscribingMessageId(null);
    }
  };

  // Play voice message
  const playVoiceMessage = async (messageId: string, audioDataUrl: string, storedMimeType?: string) => {
    if (playingVoiceMessageId === messageId) {
      // Stop if already playing
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current = null;
      }
      setPlayingVoiceMessageId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
    
    try {
      // Validate and normalize the audio URL
      if (!audioDataUrl || typeof audioDataUrl !== 'string') {
        console.error('Invalid audio URL:', audioDataUrl);
        alert('Error: Invalid voice message data.');
        return;
      }

      let validAudioUrl = audioDataUrl.trim();
      
      // If it's already a data URL, use it directly
      if (validAudioUrl.startsWith('data:')) {
        // Check if it's a valid audio data URL
        if (!validAudioUrl.match(/^data:audio\//)) {
          console.error('Invalid audio MIME type in data URL:', validAudioUrl.substring(0, 50));
          alert('Error: Invalid audio format in voice message.');
          return;
        }
        
        // If we have a stored MIME type, prefer it if different (for Safari compatibility)
        if (storedMimeType) {
          const currentMimeMatch = validAudioUrl.match(/^data:([^,]+)/);
          const currentMime = currentMimeMatch ? currentMimeMatch[1] : '';
          
          // If stored type is different, try using it (especially for Safari which can't play webm)
          if (currentMime !== storedMimeType && currentMime.includes('webm') && !storedMimeType.includes('webm')) {
            const base64Match = validAudioUrl.match(/,([^,]+)$/);
            if (base64Match && base64Match[1]) {
              console.log(`Trying stored MIME type '${storedMimeType}' instead of '${currentMime}' for better compatibility`);
              validAudioUrl = `data:${storedMimeType};base64,${base64Match[1]}`;
            }
          }
        }
        
        // Log the MIME type we're trying to use
        const mimeMatch = validAudioUrl.match(/^data:([^,]+)/);
        if (mimeMatch) {
          console.log('Using audio MIME type for playback:', mimeMatch[1]);
        }
      } else {
        // Assume it's raw base64 - use stored MIME type if available, otherwise default to webm
        const mimeType = storedMimeType || 'audio/webm;codecs=opus';
        console.log('Audio URL is not a data URL, using stored/default MIME type:', mimeType);
        validAudioUrl = `data:${mimeType};base64,${validAudioUrl}`;
      }
      
      console.log('Attempting to play audio with URL type:', validAudioUrl.match(/^data:([^,]+)/)?.[1]);
      
      // Create audio element
      const audio = new Audio(validAudioUrl);
      audioPlayerRef.current = audio;
      setPlayingVoiceMessageId(messageId);
      
      // Set up event handlers before loading
      const handleError = (errorType: string, errorDetails?: any) => {
        console.error(`Audio ${errorType}:`, errorDetails, {
          url: validAudioUrl.substring(0, 100) + '...',
          code: audio.error?.code,
          message: audio.error?.message
        });
        
        // Try alternative MIME types if webm fails
        if (validAudioUrl.includes('audio/webm') && errorType === 'load error') {
          // Extract just the base64 data
          const base64Match = validAudioUrl.match(/,([^,]+)$/);
          if (!base64Match || !base64Match[1]) {
            console.error('Could not extract base64 data from audio URL');
            setPlayingVoiceMessageId(null);
            audioPlayerRef.current = null;
            alert('Error: Invalid audio data format.');
            return;
          }
          
          const base64Data = base64Match[1];
          
          // Try different formats in order of compatibility
          const alternativeFormats = [
            { mime: 'audio/webm', desc: 'webm (no codec)' },
            { mime: 'audio/ogg;codecs=opus', desc: 'ogg opus' },
            { mime: 'audio/ogg', desc: 'ogg' },
          ];
          
          let formatIndex = 0;
          
          const tryNextFormat = () => {
            if (formatIndex >= alternativeFormats.length) {
              // All formats failed
              setPlayingVoiceMessageId(null);
              audioPlayerRef.current = null;
              alert('Error playing voice message. The audio format is not supported by your browser. Please try using Chrome or Firefox.');
              return;
            }
            
            const format = alternativeFormats[formatIndex];
            const alternativeUrl = `data:${format.mime};base64,${base64Data}`;
            console.log(`Trying alternative format ${formatIndex + 1}/${alternativeFormats.length}: ${format.desc}`);
            
            const altAudio = new Audio(alternativeUrl);
            
            altAudio.onloadeddata = () => {
              console.log(`Alternative audio format (${format.desc}) loaded successfully`);
              altAudio.play().catch(playErr => {
                console.error(`Error playing ${format.desc} format:`, playErr);
                formatIndex++;
                tryNextFormat(); // Try next format
              });
            };
            
            altAudio.onerror = () => {
              console.error(`Error loading ${format.desc} format`);
              formatIndex++;
              tryNextFormat(); // Try next format
            };
            
            altAudio.onended = () => {
              console.log(`Audio playback ended (${format.desc})`);
              setPlayingVoiceMessageId(null);
              audioPlayerRef.current = null;
            };
            
            audioPlayerRef.current = altAudio;
          };
          
          tryNextFormat();
          return;
        }
        
        setPlayingVoiceMessageId(null);
        audioPlayerRef.current = null;
        
        if (errorType === 'load error') {
          alert('Error loading voice message. The audio may be corrupted or in an unsupported format.');
        } else {
          alert('Error playing voice message. Please ensure your browser allows audio playback.');
        }
      };
      
      audio.onloadeddata = () => {
        console.log('Audio loaded successfully, starting playback');
        // Audio is ready, try to play
        audio.play().catch(playErr => {
          handleError('playback error', playErr);
        });
      };
      
      audio.oncanplay = () => {
        console.log('Audio can play');
      };
      
      audio.onerror = (e) => {
        handleError('load error', e);
      };
      
      audio.onended = () => {
        console.log('Audio playback ended');
        setPlayingVoiceMessageId(null);
        audioPlayerRef.current = null;
      };
      
      // Preload the audio (this will trigger onloadeddata when ready)
      audio.preload = 'auto';
      audio.load();
      
    } catch (error) {
      console.error('Error creating audio element:', error);
      alert('Error playing voice message. Please try again.');
      setPlayingVoiceMessageId(null);
      audioPlayerRef.current = null;
    }
  };

  const sendMessage = async () => {
    // If there's a voice message to send, send it instead
    if (audioBlob && audioUrl) {
      await sendVoiceMessage();
      return;
    }

    if (!newMessage.trim() || !selectedConversation || !currentUser) {
      console.log('Cannot send message:', { 
        hasMessage: !!newMessage.trim(), 
        hasConversation: !!selectedConversation, 
        hasUser: !!currentUser 
      });
      return;
    }

    try {
      // Get receiver email from conversations, contacts, or fetch from Firestore
      let receiverEmail = '';
      const conversation = conversations.find(c => c.otherUserId === selectedConversation);
      const contact = contacts.find(c => c.uid === selectedConversation);
      
      if (conversation) {
        receiverEmail = conversation.otherUserEmail;
      } else if (contact) {
        receiverEmail = contact.email;
      } else {
        // Fetch user data if not in state
        try {
          const userDoc = await getDoc(doc(db, 'users', selectedConversation));
          receiverEmail = userDoc.data()?.email || 'Unknown';
        } catch (fetchError) {
          console.error('Error fetching receiver email:', fetchError);
          alert('Error: Could not find recipient. Please try again.');
          return;
        }
      }

      // Check if user has permission to message (check if they're connected or have message permission)
      const permissionQuery1 = query(
        collection(db, 'messagePermissions'),
        where('userId1', '==', currentUser.uid),
        where('userId2', '==', selectedConversation)
      );
      const permissionQuery2 = query(
        collection(db, 'messagePermissions'),
        where('userId1', '==', selectedConversation),
        where('userId2', '==', currentUser.uid)
      );

      const [permission1Snapshot, permission2Snapshot] = await Promise.all([
        getDocs(permissionQuery1),
        getDocs(permissionQuery2)
      ]);

      const hasPermission = !permission1Snapshot.empty || !permission2Snapshot.empty;
      
      if (!hasPermission) {
        alert('You do not have permission to message this user. Please send a message request first.');
        return;
      }

      // Validate message input
      const messageContent = newMessage.trim().replace(/\s*\[Listening...\]\s*$/, '').trim();
      const validation = validateMessageInput({
        content: messageContent,
        receiverId: selectedConversation,
      });

      if (!validation.success) {
        const errorMessage = validation.errorMessages?.join('. ') || 'Invalid message. Please check your input.';
        alert(errorMessage);
        return;
      }

      if (!validation.data) {
        alert('Validation failed. Please try again.');
        return;
      }

      const validatedContent = validation.data.content;

      console.log('Sending message:', {
        senderId: currentUser.uid,
        receiverId: selectedConversation,
        receiverEmail,
        content: validatedContent
      });
      
      await addDoc(collection(db, 'messages'), {
        senderId: currentUser.uid,
        receiverId: selectedConversation,
        senderEmail: currentUser.email,
        receiverEmail: receiverEmail,
        content: validatedContent,
        timestamp: serverTimestamp(),
        read: false,
        reactions: {}
      });

      // Immediately update conversations list with the new message
      setConversations(prev => {
        const existingIndex = prev.findIndex(c => c.otherUserId === selectedConversation);
        
        if (existingIndex >= 0) {
          // Update existing conversation
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            lastMessage: validatedContent,
            lastMessageTime: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as Timestamp
          };
          // Move to top
          const [moved] = updated.splice(existingIndex, 1);
          return [moved, ...updated];
        } else {
          // Add new conversation
          return [{
            otherUserId: selectedConversation,
            otherUserEmail: receiverEmail,
            otherUserRole: contacts.find(c => c.uid === selectedConversation)?.role || 'student',
            lastMessage: validatedContent,
            lastMessageTime: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as Timestamp,
            unreadCount: 0,
            canMessage: true
          }, ...prev];
        }
      });

      setNewMessage('');
      setIsListening(false);
      console.log('Message sent successfully');
    } catch (error: any) {
      console.error('Error sending message:', error);
      if (error.code === 'permission-denied') {
        alert('Permission denied: You may not have permission to send messages to this user.');
      } else if (error.code === 'unavailable') {
        alert('Service unavailable. Please check your internet connection and try again.');
      } else {
        alert(`Error sending message: ${error.message || 'Unknown error'}`);
      }
    }
  };

  const sendMessageRequest = async (contactId: string, contactEmail: string, contactRole: 'student' | 'teacher' | 'parent') => {
    if (!currentUser || !userRole) return;

    try {
      // Check if request already exists
      const existingRequestQuery = query(
        collection(db, 'messageRequests'),
        where('requestorId', '==', currentUser.uid),
        where('requestedId', '==', contactId),
        where('status', '==', 'pending')
      );
      const existingSnapshot = await getDocs(existingRequestQuery);
      
      if (!existingSnapshot.empty) {
        alert('A message request has already been sent to this user.');
        return;
      }

      await addDoc(collection(db, 'messageRequests'), {
        requestorId: currentUser.uid,
        requestedId: contactId,
        requestorEmail: currentUser.email,
        requestedEmail: contactEmail,
        requestorRole: userRole,
        requestedRole: contactRole,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // Update contact to reflect pending request
      setContacts(prev => prev.map(contact => 
        contact.uid === contactId 
          ? { ...contact, hasPendingRequest: true }
          : contact
      ));
    } catch (error) {
      console.error('Error sending message request:', error);
    }
  };

  const acceptMessageRequest = async (requestId: string, requestorId: string, requestorEmail: string, requestorRole: 'student' | 'teacher' | 'parent') => {
    if (!currentUser) return;

    try {
      // Update request status
      const requestRef = doc(db, 'messageRequests', requestId);
      await updateDoc(requestRef, { status: 'accepted' });

      // Create message permission (bidirectional)
      const permissionData = {
        userId1: currentUser.uid,
        userId2: requestorId,
        user1Email: currentUser.email,
        user2Email: requestorEmail,
        createdAt: serverTimestamp()
      };

      // Create permission in both directions to make querying easier
      await addDoc(collection(db, 'messagePermissions'), permissionData);

      // Remove from message requests list
      setMessageRequests(prev => prev.filter(req => req.id !== requestId));

      // Update contacts to reflect permission
      setContacts(prev => prev.map(contact => 
        contact.uid === requestorId 
          ? { ...contact, canMessage: true, hasPendingRequest: false }
          : contact
      ));

      // Add to conversations immediately
      const newConversation: Conversation = {
        otherUserId: requestorId,
        otherUserEmail: requestorEmail,
        otherUserRole: requestorRole,
        lastMessage: 'Conversation started',
        lastMessageTime: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as Timestamp,
        unreadCount: 0,
        canMessage: true
      };
      
      setConversations(prev => {
        const exists = prev.find(c => c.otherUserId === requestorId);
        if (exists) return prev;
        return [newConversation, ...prev];
      });

      // Switch to conversations tab and open the conversation
      setActiveTab('conversations');
      setSelectedConversation(requestorId);
    } catch (error) {
      console.error('Error accepting message request:', error);
    }
  };

  const rejectMessageRequest = async (requestId: string) => {
    try {
      const requestRef = doc(db, 'messageRequests', requestId);
      await updateDoc(requestRef, { status: 'rejected' });

      setMessageRequests(prev => prev.filter(req => req.id !== requestId));
    } catch (error) {
      console.error('Error rejecting message request:', error);
    }
  };

  const cancelOutgoingMessageRequest = async (requestId: string) => {
    try {
      await deleteDoc(doc(db, 'messageRequests', requestId));
      setMessageRequests((prev) => prev.filter((req) => req.id !== requestId));
    } catch (error) {
      console.error('Error canceling message request:', error);
    }
  };

  const goBack = () => {
    setNavigating(true);
    navigate('/home');
  };

  const formatTime = (timestamp: Timestamp | { seconds: number; nanoseconds: number }) => {
    const date = new Date((timestamp as Timestamp).seconds * 1000);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const handleUserSearch = async () => {
    if (!currentUser || !userRole) return;

    // Validate search query
    const searchValidation = validateSearchQuery(searchQuery);
    if (!searchValidation.success || !searchValidation.data || !searchValidation.data.trim()) {
      if (searchValidation.error) {
        alert(searchValidation.error);
      }
      return;
    }

    try {
      setIsSearching(true);
      const searchTerm = searchValidation.data.toLowerCase();

      // Search for users by email
      const allUsersQuery = query(collection(db, 'users'), limit(100));
      const allUsersSnapshot = await getDocs(allUsersQuery);

      const filteredUsers: ContactUser[] = [];

      allUsersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const userId = doc.id;
        const userEmail = userData.email?.toLowerCase() || '';
        const searchedUserRole = userData.role;

        // Skip current user
        if (userId === currentUser.uid) return;

        // Filter based on role-based messaging rules
        let canContact = false;
        if (userRole === 'student') {
          // Students can only contact teachers and parents
          canContact = searchedUserRole === 'teacher' || searchedUserRole === 'parent';
        } else if (userRole === 'teacher' || userRole === 'parent') {
          // Teachers and parents can contact anyone except themselves
          canContact = true;
        }

        // Filter by email search term
        if (canContact && userEmail.includes(searchTerm)) {
          // Check message permission
          filteredUsers.push({
            uid: userId,
            email: userData.email,
            role: searchedUserRole,
            canMessage: false,
            hasPendingRequest: false
          });
        }
      });

      // Check permissions and pending requests for each result
      const usersWithStatus = await Promise.all(filteredUsers.map(async (user) => {
        const permissionQuery1 = query(
          collection(db, 'messagePermissions'),
          where('userId1', '==', currentUser.uid),
          where('userId2', '==', user.uid)
        );
        const permissionQuery2 = query(
          collection(db, 'messagePermissions'),
          where('userId1', '==', user.uid),
          where('userId2', '==', currentUser.uid)
        );

        const [permission1Snapshot, permission2Snapshot] = await Promise.all([
          getDocs(permissionQuery1),
          getDocs(permissionQuery2)
        ]);

        const hasPermission = !permission1Snapshot.empty || !permission2Snapshot.empty;

        const outgoingRequestQuery = query(
          collection(db, 'messageRequests'),
          where('requestorId', '==', currentUser.uid),
          where('requestedId', '==', user.uid),
          where('status', '==', 'pending')
        );
        const incomingRequestQuery = query(
          collection(db, 'messageRequests'),
          where('requestorId', '==', user.uid),
          where('requestedId', '==', currentUser.uid),
          where('status', '==', 'pending')
        );

        const [outgoingSnapshot, incomingSnapshot] = await Promise.all([
          getDocs(outgoingRequestQuery),
          getDocs(incomingRequestQuery)
        ]);

        const hasPendingRequest = !outgoingSnapshot.empty || !incomingSnapshot.empty;

        return {
          ...user,
          canMessage: hasPermission,
          hasPendingRequest
        };
      }));

      setSearchResults(usersWithStatus);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const getRoleIcon = (role: 'student' | 'teacher' | 'parent'): ReactNode => {
    switch (role) {
      case 'student':
        return (
          <img
            src={studentProfileImage}
            alt=""
            className="role-icon-student-img"
            width={22}
            height={22}
          />
        );
      case 'teacher':
        return (
          <img
            src={teacherProfileImage}
            alt=""
            className="role-icon-teacher-img"
            width={22}
            height={22}
          />
        );
      case 'parent':
        return (
          <img
            src={parentProfileImage}
            alt=""
            className="role-icon-parent-img"
            width={22}
            height={22}
          />
        );
      default:
        return '👤';
    }
  };

  // Text-to-Speech functionality
  const speakMessage = async (messageId: string, content: string) => {
    // If clicking the same message that's speaking, stop it and return
    if (speakingMessageIdRef.current === messageId && speechSynthesisRef.current) {
      ttsStopSpeaking();
      speechSynthesisRef.current = null;
      setSpeakingMessageId(null);
      return;
    }

    // Stop any currently speaking message
    ttsStopSpeaking();
    speechSynthesisRef.current = null;

    setSpeakingMessageId(messageId);

    const result = await ttsSpeakText(content, {
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      lang: 'en-US'
    });

    if (result) {
      speechSynthesisRef.current = result as any;

      if (result instanceof SpeechSynthesisUtterance) {
        result.onend = () => {
          setSpeakingMessageId(null);
          speechSynthesisRef.current = null;
        };

        result.onerror = (error) => {
          console.error('Speech synthesis error:', error);
          setSpeakingMessageId(null);
          speechSynthesisRef.current = null;
          if (error.error !== 'interrupted' && error.error !== 'canceled') {
            alert('An error occurred while reading the message. Please try again.');
          }
        };
      } else if (result instanceof HTMLAudioElement) {
        result.onended = () => {
          setSpeakingMessageId(null);
          speechSynthesisRef.current = null;
        };

        result.onerror = () => {
          console.error('ElevenLabs audio error');
          setSpeakingMessageId(null);
          speechSynthesisRef.current = null;
          alert('An error occurred while reading the message. Please try again.');
        };
      }
    } else {
      setSpeakingMessageId(null);
      if (ttsProvider === 'elevenlabs' && !elevenLabsApiKey) {
        alert('ElevenLabs API key is required. Please add your API key in settings.');
      } else if (!window.speechSynthesis) {
        alert('Text-to-speech is not supported in your browser.');
      }
    }
  };

  const simplifyMessage = (content: string): string => {
    let simplified = content.trim();

    simplified = simplified.replace(/[!]{3,}/g, '!!');
    simplified = simplified.replace(/[?]{3,}/g, '??');
    simplified = simplified.replace(/[.]{4,}/g, '...');
    
    simplified = simplified.replace(/([!?])\1{2,}/g, '$1$1');
    simplified = simplified.replace(/([!?])([!?])\1+/g, '$1$2');
    if (/\b(although|while|even though|even if)\s+.*\s+(may|can)\s+(seem|feel|be)\s+overwhelming/i.test(simplified) &&
        /\b(breaking|prioritizing|revisiting|doing|trying|using)\s+.*\s+can\s+(significantly\s+)?(improve|help)/i.test(simplified)) {
      
      // Extract problem statement
      const problemMatch = simplified.match(/^(although|while|even though|even if)\s+(the\s+\w+)\s+(may|can)\s+(seem|feel|be)\s+([^,]+?)(?:,\s|\.|$)/i);
      if (problemMatch) {
        const subject = problemMatch[2];
        let feeling = problemMatch[5].replace(/\s+at\s+first/gi, '').trim();
        let result = subject.charAt(0).toUpperCase() + subject.slice(1) + ' may feel ' + feeling + '.\n\n';
        
        let actions: string[] = [];
        const gerundPattern = /\b(breaking|prioritizing|revisiting|focusing|checking)\s+([^,]+?)(?=,\s+(?:and\s+)?(?:breaking|prioritizing|revisiting|focusing|checking)|,\s+and\s+(?:breaking|prioritizing|revisiting|focusing|checking)|,\s+and|\.|can|$)/gi;
        let match;
        const originalText = simplified; // Keep original for matching
        while ((match = gerundPattern.exec(originalText)) !== null) {
          const verb = match[1];
          let action = match[2].trim();
          
          let imperative = verb;
          if (verb === 'breaking') imperative = 'Break';
          else if (verb === 'prioritizing') imperative = 'Focus on';
          else if (verb === 'revisiting') imperative = 'Check';
          else if (verb === 'focusing') imperative = 'Focus on';
          else if (verb === 'checking') imperative = 'Check';
          
          if (action.includes('into smaller steps') || action.includes('the task into')) {
            action = 'the task into small steps';
          } else if (action.includes('the most important information') || action.includes('most important')) {
            action = 'the most important information';
          } else if (action.includes('the guidelines as needed') || action.includes('the guidelines')) {
            action = 'the guidelines again if needed';
          } else {
            action = action.trim();
          }
          
          actions.push(imperative + ' ' + action);
        }
        
        if (actions.length > 0) {
          result += 'Try this:\n\n';
          actions.forEach(action => {
            result += '• ' + action + '\n\n';
          });
        }
        
        const benefitMatch = simplified.match(/can\s+(significantly\s+)?improve\s+([^.!?]+)/i);
        if (benefitMatch) {
          const benefit = benefitMatch[2].trim();
          result += 'This can improve ' + benefit + '.';
        } else {
          const helpMatch = simplified.match(/can\s+help\s+([^.!?]+)/i);
          if (helpMatch) {
            result += 'This can help ' + helpMatch[1].trim() + '.';
          }
        }
        
        return result.trim();
      }
    }

    // Detect step-by-step patterns
    const sequenceMatches = simplified.match(/\b(then|next|finally|after that|before)\s+/gi);
    const hasClearSequence = /\b(first|begin by|start by|then|next|finally|after that|before)\s+/i.test(simplified) &&
                             (sequenceMatches?.length ?? 0) >= 1;
    
    if (hasClearSequence) {
      if (/\b(begin by|start by|first)\s+([^.!?,]+?)(?:,?\s+then|\.|$)/i.test(simplified)) {
        simplified = simplified.replace(/\b(begin by|start by|first)\s+([^.!?,]+?)(?=,?\s+then|\.|$)/gi, 
          (match, _prefix, action) => {
            const trimmed = action.trim();
            if (trimmed.length > 3) {
              return '\n\n1. ' + trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
            }
            return match;
          });
        
        simplified = simplified.replace(/,\s*then\s+([^.!?,]+?)(?=,?\s+(?:then|before|finally)|\.|$)/gi,
          (match, action) => {
            const trimmed = action.trim();
            if (trimmed.length > 3 && !trimmed.match(/^\d+\./)) {
              return '\n\n2. ' + trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
            }
            return match;
          });
        
        simplified = simplified.replace(/\s+before\s+([^.!?]+?)(?=\.|$)/gi,
          (match, action) => {
            const trimmed = action.trim();
            if (trimmed.length > 3 && !trimmed.match(/^\d+\./)) {
              return '\n\n3. ' + trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
            }
            return match;
          });
      }
    }

    if (/\b(before starting|before you start|before beginning|before you begin)\s+/i.test(simplified)) {
      const hasMultipleActions = (simplified.match(/,\s+(organize|check|make sure|understand|read|review|take|decide)/gi) || []).length >= 1 ||
                                 /,\s+(organize|review|take).*,\s+(organize|check|make sure|decide)/i.test(simplified);
      
      if (hasMultipleActions) {
        simplified = simplified.replace(/^(what to do|steps?|instructions?):\s*/i, '');
        
        simplified = simplified.replace(/\btake\s+a\s+moment\s+to\s+/gi, '');
        simplified = simplified.replace(/\btake\s+some\s+time\s+to\s+/gi, '');
        
        simplified = simplified.replace(/\s+so\s+you\s+(don't|won't)\s+(feel|get)\s+\w+.*$/i, '');
        simplified = simplified.replace(/\s+so\s+\w+\s+(don't|won't|can)\s+\w+.*$/i, '');
        simplified = simplified.replace(/\s+so\s+the\s+\w+\s+\w+.*$/i, ''); // Remove "so the task feels" type clauses
        simplified = simplified.replace(/\s+so\s+[^.!?]*$/i, '');
        
        simplified = simplified.replace(/^before\s+starting\s+(the\s+\w+),?\s*/i, 'Before you start:\n\n');
        simplified = simplified.replace(/^before\s+you\s+start\s+(the\s+\w+),?\s*/i, 'Before you start:\n\n');
        simplified = simplified.replace(/^before\s+beginning\s+(the\s+\w+),?\s*/i, 'Before you start:\n\n');
        simplified = simplified.replace(/^before\s+you\s+begin\s+(the\s+\w+),?\s*/i, 'Before you start:\n\n');
        
        if (!/^before\s+(you\s+)?(start|begin):/i.test(simplified)) {
          simplified = simplified.replace(/^before\s+starting\s+/i, 'Before you start:\n\n');
          simplified = simplified.replace(/^before\s+you\s+start\s+/i, 'Before you start:\n\n');
          simplified = simplified.replace(/^before\s+beginning\s+/i, 'Before you start:\n\n');
          simplified = simplified.replace(/^before\s+you\s+begin\s+/i, 'Before you start:\n\n');
        }
        
        simplified = simplified.replace(/\btake\s+a\s+moment\s+to\s+/gi, '');
        
        simplified = simplified.replace(/\b(check|review)\s+([^,]+?)\s+one\s+more\s+time/gi, (_match, _verb, item) => {
          const trimmed = item.trim();
          return trimmed ? '\n\n• Read ' + trimmed + ' again' : '';
        });
        
        if (!/•\s+Read\s+.*instructions.*again/i.test(simplified)) {
          simplified = simplified.replace(/\bcheck\s+(the\s+instructions?)(?=,|and|$)/gi, (_match, item) => {
            return '\n\n• Read ' + item.trim() + ' again';
          });
        }
        
        // Handle "review the instructions carefully"
        simplified = simplified.replace(/\breview\s+([^,]+?)(?=,|and|so|$)/gi, (_match, item) => {
          const trimmed = item.trim();
          // Remove trailing "so" clauses from the item itself
          const cleaned = trimmed.replace(/\s+so\s+.*$/i, '').trim();
          return cleaned ? '\n\n• Review ' + cleaned : '';
        });
        
        // Handle "organize your materials/thoughts"
        simplified = simplified.replace(/\borganize\s+([^,]+?)(?=,|and|so|$)/gi, (_match, item) => {
          const trimmed = item.trim();
          // Remove trailing "so" clauses from the item itself
          const cleaned = trimmed.replace(/\s+so\s+.*$/i, '').trim();
          return cleaned ? '\n\n• Organize ' + cleaned : '';
        });
        
        // Handle "decide on a clear plan"
        simplified = simplified.replace(/\bdecide\s+on\s+([^,]+?)(?=,|and|so|$)/gi, (_match, item) => {
          const trimmed = item.trim();
          // Remove trailing "so" clauses from the item itself
          const cleaned = trimmed.replace(/\s+so\s+.*$/i, '').trim();
          return cleaned ? '\n\n• Decide on ' + cleaned : '';
        });
        
        // Handle "make sure you understand what the goal is" → "Know the goal"
        simplified = simplified.replace(/\bmake\s+sure\s+you\s+understand\s+what\s+the\s+(\w+)\s+is/gi, (_match, noun) => {
          return '\n\n• Know the ' + noun;
        });
        
        // Handle "understand what the goal is" → "Know the goal" (before "so" clauses)
        simplified = simplified.replace(/\bunderstand\s+what\s+the\s+(\w+)\s+is(?=\s+so|,|and|$)/gi, (_match, noun) => {
          return '\n\n• Know the ' + noun;
        });
        
        // Clean up: remove any leftover "the activity," fragments
        simplified = simplified.replace(/\n\n(the\s+\w+),?\s*(\n\n•)/i, '$2');
        simplified = simplified.replace(/^(before\s+you\s+start):\s*(the\s+\w+),?\s*/i, '$1:\n\n');
        
        // Clean up commas and "and" between bullet points
        simplified = simplified.replace(/,\s*(\n\n•)/g, '$1');
        simplified = simplified.replace(/\s+and\s+(\n\n•)/gi, '$1');
        simplified = simplified.replace(/,\s*$/gm, ''); // Remove trailing commas on each line
        
        // Final pass: remove any trailing "so" clauses from bullet points
        simplified = simplified.replace(/(•\s+[^\n]+?)\s+so\s+you\s+(don't|won't)\s+\w+.*/gi, '$1');
        simplified = simplified.replace(/(•\s+[^\n]+?)\s+so\s+\w+\s+(don't|won't|can)\s+\w+.*/gi, '$1');
        simplified = simplified.replace(/(•\s+[^\n]+?)\s+so\s+the\s+\w+\s+\w+.*/gi, '$1'); // Remove "so the task feels" type clauses
        simplified = simplified.replace(/(•\s+[^\n]+?)\s+so\s+[^.!?\n]*$/gm, '$1'); // Remove "so X" from each bullet point
      }
    }

    // Detect task reminders and format them
    // Pattern: "Don't forget to X, and make sure Y, and Z"
    if (/\b(don't forget|remember to|make sure|submit|due|upload)\s+/i.test(simplified) && 
        /(and|,)\s+(make sure|don't forget|submit|upload|due)/i.test(simplified)) {
      // Add "Reminder:" header if not present
      if (!/^(reminder|note|to do):/i.test(simplified)) {
        simplified = 'Reminder:\n\n' + simplified;
      }
      
      // Convert to bullet points
      simplified = simplified.replace(/\b(don't forget to|remember to|make sure to|submit|upload)\s+([^.!?]+?)(?=,?\s+(?:and|or|,)|\.|$)/gi,
        (match, verb, task) => {
          const trimmed = task.trim();
          if (trimmed.length > 3) {
            // Capitalize task based on verb
            let taskText = trimmed;
            if (verb.match(/submit/i)) taskText = 'Submit ' + trimmed;
            else if (verb.match(/upload/i)) taskText = 'Upload ' + trimmed;
            else if (verb.match(/due/i)) taskText = 'Due ' + trimmed;
            return '• ' + taskText;
          }
          return match;
        });
      
      // Split on "and" or commas for multiple tasks
      simplified = simplified.replace(/,\s*(and\s+)?(make sure|don't forget|submit|upload|due)/gi, '\n• ');
    }

    // Detect and format lists after colons
    // Pattern: "Plants use: sunlight, water, carbon dioxide"
    if (/:[\s]*(using|including|with|for|like|such as|use|have)/i.test(simplified)) {
      simplified = simplified.replace(/:\s*([^.!?]+)/g, (match: string, listText: string) => {
        // Check if it's a comma-separated list
        const items = listText.split(',').map((item: string) => item.trim()).filter((item: string) => item.length > 0);
        if (items.length >= 2) {
          return ':\n\n' + items.map((item: string) => '• ' + item.charAt(0).toUpperCase() + item.slice(1)).join('\n');
        }
        return match;
      });
    }

    // Detect "you'll want to" with numbered steps
    // Pattern: "you'll want to 1. Isolating... 2. you distribute..."
    if (/\byou'll\s+want\s+to\s+\d+\./i.test(simplified) || 
        (/\byou'll\s+want\s+to/i.test(simplified) && /\d+\.\s+[A-Z]/i.test(simplified))) {
      // Add context header
      if (!/^(for\s+today|today's|steps?|instructions?):/i.test(simplified)) {
        // Extract the context (e.g., "For today's problem")
        const contextMatch = simplified.match(/^(hi!?\s*)?(for\s+today'?s?\s+\w+[^,]*),?\s*/i);
        if (contextMatch) {
          const context = contextMatch[0].trim();
          simplified = simplified.replace(/^(hi!?\s*)?(for\s+today'?s?\s+\w+[^,]*),?\s*/i, '');
          simplified = context.charAt(0).toUpperCase() + context.slice(1) + ':\n\n' + simplified;
        } else {
          simplified = simplified.replace(/^hi!?\s*/i, 'Hi!\n\n');
        }
      }
      
      // Fix grammar: "Isolating" → "Isolate", "Moving on to" → remove
      simplified = simplified.replace(/\b(isolating|distributing|combining|checking)\s+/gi, (_match) => {
        const base = _match.trim().replace(/ing$/i, '');
        return base.charAt(0).toUpperCase() + base.slice(1) + ' ';
      });
      
      // Remove "you'll want to" prefix
      simplified = simplified.replace(/\byou'll\s+want\s+to\s*/gi, '');
      
      // Extract and format numbered steps
      // Pattern: "1. Isolate... 2. you distribute... 3. Moving on to..."
      simplified = simplified.replace(/(\d+)\.\s+([A-Z][^.!?]*?)(?=\s+\d+\.|$)/gi, (_match, num, content) => {
        const trimmed = content.trim();
        // Remove "Moving on to the X. step" patterns
        if (trimmed.match(/moving\s+on\s+to\s+the\s+\d+\.?\s+step/i)) {
          return '';
        }
        // Remove "you" at start if present
        let cleaned = trimmed.replace(/^you\s+/i, '');
        // Capitalize first letter
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        // Break up compound steps (comma-separated actions)
        if (cleaned.includes(',') && cleaned.match(/\b(and|,)\s+(distribute|combine|double-check)/i)) {
          // Split into multiple steps
          const actions = cleaned.split(/,\s+(?:and\s+)?/).filter((a: string) => a.trim().length > 0);
          let result = '';
          let stepNum = parseInt(num);
          actions.forEach((action: string, _idx: number) => {
            const trimmedAction = action.trim();
            if (trimmedAction.length > 3) {
              result += `\n\n${stepNum}. ${trimmedAction.charAt(0).toUpperCase() + trimmedAction.slice(1)}`;
              stepNum++;
            }
          });
          return result || `\n\n${num}. ${cleaned}`;
        }
        return `\n\n${num}. ${cleaned}`;
      });
      
      // Clean up: remove redundant step references
      simplified = simplified.replace(/\s+moving\s+on\s+to\s+the\s+\d+\.?\s+step\.?\s*/gi, '');
    }

    // Detect "What to do:" or multi-step problem solving
    // Pattern: "First, read... Then identify... set up... solve..."
    // BUT only if "Before you start:" is not already present
    if (!/^before\s+you\s+start:/i.test(simplified) &&
        /\b(first,?\s+)?(read|identify|find|set up|solve|understand)\s+.*\s+(then|next|after that|and)\s+/i.test(simplified) && 
        simplified.length > 80) {
      // Add header if not present
      if (!/^(what to do|steps?|instructions?):/i.test(simplified)) {
        simplified = 'What to do:\n\n' + simplified;
      }
      
      // Extract sequential steps
      let stepNum = 1;
      simplified = simplified.replace(/\b(first,?\s+)?(read|identify|find|set up|solve|understand)\s+([^.!?,]+?)(?=,?\s+(?:then|next|and|after|\.)|$)/gi,
        (match, _firstMarker, verb, action) => {
          const trimmed = action.trim();
          if (trimmed.length > 5 && stepNum <= 5) {
            // Simplify the action text
            let simplifiedAction = trimmed;
            if (simplifiedAction.match(/carefully|entire|important/i)) {
              simplifiedAction = simplifiedAction.replace(/\s+carefully/gi, '').replace(/\s+entire/gi, '').replace(/\s+important\s+info/gi, 'important info');
            }
            const step = `\n\n${stepNum}. ${verb.charAt(0).toUpperCase() + verb.slice(1)} ${simplifiedAction}`;
            stepNum++;
            return step;
          }
          return match;
        });
    }

    // Detect encouragement/emotional support messages
    // Pattern: "I know this can... but you're... Take your time..."
    if (/\b(I know|this can|feel|overwhelming|you're|making progress|take your time|keep trying|keep going)\s+/i.test(simplified) &&
        !/\b(step|first|then|next)\s+/i.test(simplified) &&
        !/^try\s+this:/i.test(simplified)) {
      // Split into shorter sentences
      simplified = simplified.replace(/\s+but\s+/gi, '.\n\n');
      simplified = simplified.replace(/\s+Take\s+your\s+time/gi, '\n\nTake your time');
      simplified = simplified.replace(/\s+Keep\s+(trying|going)/gi, '\n\nKeep $1');
      simplified = simplified.replace(/\s+You\s+are\s+making\s+progress/gi, '\n\nYou are making progress');
    }

    // Detect social/casual messages and simplify
    // Pattern: "Hey! I won't... because... but I'll... Thanks!"
    if (/\b(hey|hi|hello|won't|can't|because|but I'll|I'll get back|thanks|thank you)\s+/i.test(simplified) &&
        simplified.length < 200 && !/\b(step|instructions?|reminder)\s+/i.test(simplified)) {
      simplified = simplified.replace(/\s+because\s+/gi, '.\n\n');
      simplified = simplified.replace(/\s+but\s+I'll/gi, '\n\nI\'ll');
      simplified = simplified.replace(/\s+Thanks?\s+for\s+/gi, '\n\nThanks for ');
    }

    // Detect feedback messages with "but you may want to..."
    // Pattern: "Your X has Y, but you may want to work on..."
    if (/\b(Your|your)\s+\w+\s+(has|is)\s+\w+.*but\s+you\s+may\s+want\s+to\s+work\s+on/i.test(simplified)) {
      // Add "Try to:" section
      simplified = simplified.replace(/\s+but\s+you\s+may\s+want\s+to\s+work\s+on\s+/gi, '\n\nTry to:\n\n• ');
      simplified = simplified.replace(/improving\s+([^.!?]+?)\s+and\s+reducing\s+/gi, 'Improve $1\n• Reduce ');
      simplified = simplified.replace(/,\s+(make|remove|improve|reduce)/gi, '\n• $1');
    }

    // Only apply step-by-step formatting if message is clearly instructional
    // Check for clear sequential patterns at the start of sentences
    const isInstructional = /\b(step|first|second|third|fourth|fifth|then|next|finally|start by|begin by|you'll want to|you should)\s+/i.test(simplified);
    const hasMultipleActions = (simplified.match(/\b(make sure|remember to|don't forget|try to|you should|you may want)/gi) || []).length >= 2;
    
    // Only format if it's clearly instructional AND has multiple distinct actions
    if (isInstructional && (hasMultipleActions || simplified.length > 150)) {
      // Very specific pattern matching - only convert if we have clear sequential structure
      // Pattern: "First [action]. Then [action]. Finally [action]."
      const sequentialPattern = /\b(first|step 1|1\.)\s+([^.!?]+?)(?=\s*[.!?]|\s+(then|next|second|finally|step 2))/i;
      if (sequentialPattern.test(simplified)) {
        // Convert "First/Then/Next/Finally" to numbered list only if clear sequence exists
        simplified = simplified.replace(/\b(first|step 1|1\.)\s+([^.!?]+?)(?=\s*[.!?]|\s+(then|next|second|finally|step 2))/gi, '\n\n1. $2');
        simplified = simplified.replace(/\b(then|next|step 2|2\.|second)\s+([^.!?]+?)(?=\s*[.!?]|\s+(third|next|finally|step 3))/gi, '\n\n2. $2');
        simplified = simplified.replace(/\b(third|step 3|3\.)\s+([^.!?]+?)(?=\s*[.!?]|\s+(fourth|finally|step 4))/gi, '\n\n3. $2');
        simplified = simplified.replace(/\b(fourth|step 4|4\.)\s+([^.!?]+?)(?=\s*[.!?]|\s+(fifth|finally|step 5))/gi, '\n\n4. $2');
        simplified = simplified.replace(/\b(finally|last|step 5|5\.)\s+([^.!?]+?)(?=\s*[.!?]|$)/gi, '\n\n5. $2');
      }
    }

    // Detect instruction-type messages (step-by-step guidance)
    // Pattern: "you'll want to start by... Make sure... before moving on to..."
    if (/\b(you'll want to|you should|start by|begin by|first|then|next|make sure|before moving|before going)/i.test(simplified)) {
      // Detect sequential actions and convert to numbered steps
      const stepPatterns = [
        { pattern: /\b(start by|begin by|first)\s+(.+?)(?=\s*[.,]|\s+[Mm]ake|\s+[Bb]efore|\s*$)/gi, replacement: '1. $2' },
        { pattern: /\b(make sure|then|next|after that)\s+(.+?)(?=\s*[.,]|\s+[Bb]efore|\s*$)/gi, replacement: '\n2. $2' },
        { pattern: /\b(before moving|before going|before continuing|finally)\s+(.+?)(?=\s*[.,]|\s*$)/gi, replacement: '\n3. $2' },
      ];
      
      stepPatterns.forEach(({ pattern, replacement }) => {
        simplified = simplified.replace(pattern, replacement);
      });
      
      // Clean up awkward breaks
      simplified = simplified.replace(/\s+([.,])\s*(\d+\.)/g, '.\n\n$2');
    }

    // Only split compound instructions if they're clearly separate actions
    // Be more conservative - only split if there are clear action verbs
    const actionPattern = /\b(don't forget to|make sure to|remember to|try to|you should|you may want to)\s+/i;
    if (actionPattern.test(simplified)) {
      // Only split if we have multiple distinct action phrases
      const actionMatches = simplified.match(actionPattern);
      if (actionMatches && actionMatches.length >= 2) {
        // Split on conjunctions that clearly separate actions
        simplified = simplified.replace(/\s+,\s*(and|or)\s+(make sure|remember|try|don't forget|you should|you may want)/gi, '\n\n• ');
        // Don't split every "and" - only if it's clearly separating actions
        simplified = simplified.replace(/\s+and\s+(make sure|remember to|try to|don't forget|you should|you may want)/gi, '\n\n• ');
      }
    }

    // Detect explanations with lists (colon followed by items)
    if (/:[\s]*(using|including|with|for|like|such as|steps?|ways?|things?)/i.test(simplified)) {
      // Convert comma-separated lists after colons to bullet points
      simplified = simplified.replace(/:\s*([^.!?]+)/g, (match: string, listText: string) => {
        if (listText.length > 50) {
          // Convert commas to bullet points for longer lists
          const items = listText.split(',').map((item: string) => item.trim()).filter((item: string) => item.length > 0);
          if (items.length >= 2) {
            return ':\n\n' + items.map((item: string) => '• ' + item).join('\n');
          }
        }
        return match;
      });
    }

    // Split into sentences more intelligently
    // First, check if we already have structured formatting
    const hasStructuredList = /\n\s*(\d+\.|•)/.test(simplified);
    
    if (!hasStructuredList) {
      // Simple sentence splitting - preserve sentence boundaries
      // Split on sentence-ending punctuation followed by space and capital letter
      simplified = simplified.replace(/([.!?])\s+([A-Z])/g, '$1\n\n$2');
      
      // For very long sentences (over 120 chars), try to break at natural points
      const sentences = simplified.split('\n\n');
      const processedSentences = sentences.map(sentence => {
        sentence = sentence.trim();
        
        // If sentence is already reasonably short, leave it alone
        if (sentence.length <= 120) {
          return sentence;
        }
        
        // Only split very long sentences at clear conjunction breaks
        if (sentence.length > 120) {
          // Look for comma + conjunction patterns that indicate separate clauses
          const clauseBreak = /,\s+(and|but|or|so|because|when|if|then)\s+([A-Z][a-z]+)/i;
          if (clauseBreak.test(sentence)) {
            // Split at the conjunction, keeping it with the second part
            const parts = sentence.split(/(,\s+(?:and|but|or|so|because|when|if|then)\s+)/i);
            if (parts.length >= 3) {
              let result = parts[0].trim();
              for (let i = 1; i < parts.length; i += 2) {
                const conj = parts[i];
                const part = parts[i + 1];
                if (part && part.trim().length > 10) {
                  result += '\n\n' + conj.trim() + part.trim();
                } else {
                  result += conj + (part || '');
                }
              }
              return result;
            }
          }
        }
        
        return sentence;
      });

      simplified = processedSentences
        .filter(s => s.trim().length > 0)
        .join('\n\n');
    }

    // Clean up: ensure numbered lists are properly formatted
    // Only if we have actual numbered steps (not just random numbers in text)
    if (/\b\d+\.\s+[A-Z]/.test(simplified)) {
      // Ensure numbered steps start on new lines
      simplified = simplified.replace(/([.!?\n])\s*(\d+)\.\s+([A-Z])/g, '\n\n$2. $3');
    }
    
    // Remove any accidental numbering that doesn't make sense
    // If we see patterns like "3. The" or "2. step" without context, remove the numbering
    simplified = simplified.replace(/\n\n(\d+)\.\s+(The|the|A|a|An|an|This|this|That|that|step|Step|You|you)\s+/g, '\n\n$2 ');
    
    // Clean up any orphaned numbers that don't form proper steps
    // Pattern: number followed by very short fragments
    simplified = simplified.replace(/\n\n(\d+)\.\s+([a-z]{1,3})\s+/gi, '\n\n$2 ');
    
    // Remove numbering from fragments that are clearly part of a sentence
    simplified = simplified.replace(/\n\n(\d+)\.\s+([^.!?]{1,20})\s*([.!?])/g, (match, _num, text, punct) => {
      // If the fragment is very short and ends with punctuation, it's probably not a real step
      if (text.length < 15 && punct) {
        return '\n\n' + text + punct;
      }
      return match;
    });

    // Clean up and format bullet points consistently
    simplified = simplified.replace(/•\s*/g, '• ');

    // Handle "What to do:" or "Reminder:" patterns
    simplified = simplified.replace(/\b(what to do|reminder|note|tip|warning):\s*/gi, (match) => {
      return '\n\n' + match.charAt(0).toUpperCase() + match.slice(1).toLowerCase() + '\n\n';
    });

    // If message is still very long (over 400 characters), truncate intelligently
    if (simplified.length > 400) {
      // Try to break at a sentence or list item boundary
      const truncated = simplified.substring(0, 400);
      const lastBreak = Math.max(
        truncated.lastIndexOf('\n\n'),
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?'),
        truncated.lastIndexOf('\n•')
      );
      
      if (lastBreak > 200) {
        simplified = simplified.substring(0, lastBreak + 1) + '\n\n...';
      } else {
        simplified = truncated + '...';
      }
    }

    // Clean up multiple consecutive line breaks (more than 2)
    simplified = simplified.replace(/\n{3,}/g, '\n\n');

    // Remove leading/trailing line breaks from the entire message
    simplified = simplified.replace(/^\n+|\n+$/g, '');

    // Ensure numbered/bulleted lists have proper spacing
    simplified = simplified.replace(/(\n)(\d+\.|•)\s/g, '\n\n$2 ');

    // Final cleanup: trim each line but preserve structure
    simplified = simplified.split('\n').map(line => line.trim()).join('\n');

    // Remove empty lines between content
    simplified = simplified.replace(/\n\n\n+/g, '\n\n');

    // UNIVERSAL SIMPLIFICATION MODE - Apply general rules to any remaining text
    // Only apply if text hasn't been heavily structured already (has existing lists/headers)
    const hasExistingStructure = /\n\n(•|\d+\.|Try this:|Reminder:|What to do:|Before you start:)/.test(simplified);
    
    if (!hasExistingStructure && simplified.length > 100) {
      // 1. Shorten long sentences (over 80 characters) by breaking at natural points
      const sentences = simplified.split(/([.!?])\s+/);
      const processedSentences: string[] = [];
      let currentSentence = '';
      
      for (let i = 0; i < sentences.length; i++) {
        if (sentences[i].match(/^[.!?]$/)) {
          currentSentence += sentences[i];
        } else {
          if (currentSentence) {
            processedSentences.push(currentSentence.trim());
            currentSentence = '';
          }
          currentSentence = sentences[i].trim();
        }
      }
      if (currentSentence) {
        processedSentences.push(currentSentence.trim());
      }
      
      // Process each sentence
      const finalSentences = processedSentences.map(sentence => {
        // If sentence is already short, keep it
        if (sentence.length <= 80) {
          return sentence;
        }
        
        // Break long sentences at natural points
        // Look for conjunctions, commas, or transition words
        if (sentence.length > 80) {
          // Try to split at commas with conjunctions
          const commaSplit = /,\s+(and|but|or|so|because|while|when|if|since|although)\s+/i;
          if (commaSplit.test(sentence)) {
            const parts = sentence.split(commaSplit);
            let result = parts[0].trim();
            for (let i = 1; i < parts.length; i += 2) {
              const conj = parts[i];
              const part = parts[i + 1];
              if (part && part.trim().length > 10) {
                result += '\n\n' + conj.trim() + ' ' + part.trim();
              } else {
                result += ', ' + conj + (part || '');
              }
            }
            return result;
          }
          
          // Split at commas if sentence is very long (over 100 chars)
          if (sentence.length > 100 && sentence.includes(',')) {
            const commaParts = sentence.split(',').map(p => p.trim());
            if (commaParts.length >= 3) {
              // Break into smaller chunks
              return commaParts[0] + ',\n\n' + commaParts.slice(1).join(',\n\n');
            }
          }
        }
        
        return sentence;
      });
      
      // Join with double line breaks for spacing
      simplified = finalSentences
        .filter(s => s.length > 0)
        .join('\n\n');
      
      // 2. Convert comma-separated lists (3+ items) to bullet points when appropriate
      // Pattern: "A, B, and C" or "A, B, C"
      simplified = simplified.replace(/([^.!?\n]+,\s+[^.!?\n]+,\s+(?:and\s+)?[^.!?\n]+)/g, (match) => {
        // Only convert if it looks like a list (has at least 3 comma-separated items)
        const items = match.split(',').map((item: string) => item.trim().replace(/^\s*and\s+/i, ''));
        if (items.length >= 3 && match.length < 150) {
          return '\n\n' + items.map((item: string) => '• ' + item).join('\n');
        }
        return match;
      });
      
      // 3. Add spacing around transition words/phrases
      const transitions = /\b(however|therefore|furthermore|moreover|additionally|also|meanwhile|finally|in conclusion|in summary)\s+/gi;
      simplified = simplified.replace(transitions, (match) => {
        return '\n\n' + match.trim() + ' ';
      });
    }

    // Final cleanup: ensure proper spacing
    simplified = simplified.replace(/\n{4,}/g, '\n\n\n'); // Max 3 line breaks
    simplified = simplified.replace(/\n\n\n+/g, '\n\n'); // Reduce to double line breaks
    
    // Trim each line but preserve structure
    simplified = simplified.split('\n').map(line => line.trim()).join('\n');

    return simplified.trim();
  };

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (speechSynthesisRef.current) {
        window.speechSynthesis.cancel();
        speechSynthesisRef.current = null;
      }
    };
  }, []);

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      // Constrain sidebar width between 280px and 600px
      if (newWidth >= 280 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const [announcement, setAnnouncement] = useState('');
  const announcementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0 && selectedConversation) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.senderId !== currentUser?.uid && !lastMessage.read) {
        setAnnouncement(`New message from ${lastMessage.senderEmail}: ${lastMessage.content || 'Voice message'}`);
      }
    }
  }, [messages, selectedConversation, currentUser]);

  // Show loading state while initializing or if userRole is not available yet
  if (loading || !currentUser || !userRole) {
    return (
      <div className="landing-wrapper brand-bg-light landing-loading-screen landing-loading-light">
        Loading messages…
      </div>
    );
  }

  return (
    <motion.div
      className={containerClassNames}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      role="application"
      aria-label="Messaging interface"
    >
      {/* ARIA live region for screen reader announcements */}
      <div
        ref={announcementRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden'
        }}
      >
        {announcement}
      </div>

      <nav className="glass-nav glass-nav-light messages-top-nav" aria-label="Messages" role="banner">
        <div className="messages-nav-left">
          <motion.button
            type="button"
            onClick={goBack}
            className="btn-ghost-dark"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            aria-label="Go back to home"
          >
            ← Back
          </motion.button>
          <img src={logoImage} alt="JustWav3" className="nav-logo messages-nav-logo" width={160} height={48} />
          <div className="messages-nav-titles">
            <span className="messages-nav-title">Messages</span>
            <span className="messages-nav-sub">Chat with your learning circle</span>
          </div>
        </div>
      </nav>

      <div
        className="messages-content messages-content--grid messages-layout"
        style={{ ['--sidebar-width' as string]: `${sidebarWidth}px` } as CSSProperties}
      >
        <nav
          className="messages-sidebar messages-sidebar--modern"
          role="navigation"
          aria-label="Conversations and contacts"
        >
            <div className={`search-container ${isCompact ? 'compact' : ''}`}>
              {isCompact ? (
                <button
                  onClick={() => {
                    // Expand sidebar when clicking search icon in compact mode
                    setSidebarWidth(420);
                  }}
                  className="search-icon-button"
                  title="Search for users"
                >
                  🔍
                </button>
              ) : (
                <>
                  <div className="search-input-wrapper">
              <input
                type="text"
                placeholder="Search for users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleUserSearch();
                  }
                }}
                className="search-input"
              />
              <button
                onClick={handleUserSearch}
                className="search-button"
                disabled={isSearching || !searchQuery.trim()}
                aria-label="Search for users"
              >
                {isSearching ? '...' : '🔍'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((user) => (
                  <div key={user.uid} className="search-result-item">
                    <div className="search-result-info">
                      <span className="role-icon">{getRoleIcon(user.role)}</span>
                      <span className="search-result-email" title={user.email}>{user.email}</span>
                    </div>
                    {!user.canMessage && !user.hasPendingRequest && (
                      <button
                        className="message-them-button"
                        onClick={() => {
                          sendMessageRequest(user.uid, user.email, user.role);
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                      >
                        Connect
                      </button>
                    )}
                    {user.canMessage && (
                      <button
                        className="message-them-button active"
                        onClick={() => {
                          setSelectedConversation(user.uid);
                          setActiveTab('conversations');
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                      >
                        Open Chat
                      </button>
                    )}
                    {user.hasPendingRequest && (
                      <span className="search-status pending">Request Pending</span>
                    )}
                  </div>
                ))}
              </div>
            )}
                </>
              )}
            </div>

          <div className={`messages-tabs sidebar-tab-group ${isCompact ? 'compact' : ''}`} role="tablist" aria-label="Message sections">
            <button
              type="button"
              className={`tab-button tab-btn ${activeTab === 'conversations' ? 'active' : ''}`}
              onClick={() => setActiveTab('conversations')}
              role="tab"
              aria-selected={activeTab === 'conversations'}
              aria-controls="conversations-panel"
              id="conversations-tab"
              title={isCompact ? 'Conversations' : ''}
            >
              {isCompact ? '💬' : 'Conversations'}
              {conversations.length > 0 && <span className="tab-badge">{conversations.length}</span>}
            </button>
            <button
              type="button"
              className={`tab-button tab-btn ${activeTab === 'contacts' ? 'active' : ''}`}
              onClick={() => setActiveTab('contacts')}
              role="tab"
              aria-selected={activeTab === 'contacts'}
              aria-controls="contacts-panel"
              id="contacts-tab"
              title={isCompact ? 'Contacts' : ''}
            >
              {isCompact ? '👥' : 'Contacts'}
            </button>
            <button
              type="button"
              className={`tab-button tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => setActiveTab('requests')}
              title={isCompact ? 'Requests' : ''}
            >
              {isCompact ? '🔔' : 'Requests'}
              {messageRequests.filter(req => req.requestedId === currentUser?.uid).length > 0 && (
                <span className="tab-badge">{messageRequests.filter(req => req.requestedId === currentUser?.uid).length}</span>
              )}
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'conversations' && (
              <div 
                id="conversations-panel"
                role="tabpanel"
                aria-labelledby="conversations-tab"
                className="conversations-list"
              >
                {loading ? (
                  <div className="loading">Loading conversations...</div>
                ) : conversations.length === 0 ? (
                  <div className="empty-state">No active conversations. Start messaging with your connections!</div>
                ) : (
                  conversations.map((conv) => (
                    <motion.div
                      key={conv.otherUserId}
                      className={`conversation-item convo-item ${selectedConversation === conv.otherUserId ? 'selected' : ''} ${isCompact ? 'compact' : ''}`}
                      onClick={() => {
                        setSelectedConversation(conv.otherUserId);
                        setActiveTab('conversations');
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      title={isCompact ? conv.otherUserEmail : ''}
                    >
                      <div className="conversation-info">
                        <div className="conversation-header">
                          <span className="role-icon avatar-container">{getRoleIcon(conv.otherUserRole)}</span>
                          <span className="conversation-email">{conv.otherUserEmail}</span>
                        </div>
                      </div>
                      {isCompact && conv.unreadCount > 0 && (
                        <div className="unread-badge compact-badge">{conv.unreadCount}</div>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'contacts' && (
              <div
                id="contacts-panel"
                role="tabpanel"
                aria-labelledby="contacts-tab"
                className="contacts-list"
              >
                {loading ? (
                  <div className="loading">Loading contacts...</div>
                ) : contacts.length === 0 ? (
                  <div className="empty-state">No contacts available.</div>
                ) : (
                  contacts.map((contact) => (
                    <motion.div
                      key={contact.uid}
                      className={`contact-item convo-item ${selectedContact === contact.uid ? 'selected' : ''}`}
                      onClick={() => {
                        if (contact.canMessage) {
                          setSelectedConversation(contact.uid);
                          setActiveTab('conversations');
                        }
                        setSelectedContact(contact.uid);
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="contact-info">
                        <div className="contact-header">
                          <span className="role-icon avatar-container">{getRoleIcon(contact.role)}</span>
                          <span className="contact-email">{contact.email}</span>
                        </div>
                        <div className="contact-status">
                          {contact.canMessage ? (
                            <span className="status-badge can-message">Can Message</span>
                          ) : contact.hasPendingRequest ? (
                            <span className="status-badge pending">Request Pending</span>
                          ) : (
                            <span className="status-badge no-permission">Request Required</span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'requests' && (
              <div
                id="requests-panel"
                role="tabpanel"
                aria-labelledby="requests-tab"
                className="requests-list"
              >
                {(() => {
                  const incomingReqs = messageRequests.filter(req => req.requestedId === currentUser?.uid);
                  const outgoingReqs = messageRequests.filter(req => req.requestorId === currentUser?.uid);
                  console.log('Rendering requests tab:', {
                    totalRequests: messageRequests.length,
                    incomingReqs: incomingReqs.length,
                    outgoingReqs: outgoingReqs.length,
                    currentUserUid: currentUser?.uid,
                    allRequests: messageRequests
                  });
                  
                  if (messageRequests.length === 0) {
                    return <div className="empty-state">No message requests. Use the search bar to find users and send message requests.</div>;
                  }
                  
                  return (
                    <>
                      {/* Incoming Requests */}
                      {incomingReqs.length > 0 && (
                        <>
                          <h3 className="requests-section-title">Incoming Requests ({incomingReqs.length})</h3>
                          {incomingReqs.map((request) => (
                            <motion.div
                              key={request.id}
                              className="request-item"
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                            >
                              <div className="request-info">
                                <div className="request-header">
                                  <span className="role-icon">{getRoleIcon(request.requestorRole)}</span>
                                  <span className="request-email">{request.requestorEmail}</span>
                                </div>
                                <div className="request-meta">
                                  {formatTime(request.createdAt)}
                                </div>
                              </div>
                              <div className="request-actions">
                                <button
                                  className="accept-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Accept button clicked:', request);
                                    acceptMessageRequest(request.id, request.requestorId, request.requestorEmail, request.requestorRole);
                                  }}
                                  type="button"
                                >
                                  Accept & Start Chat
                                </button>
                                <button
                                  className="reject-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Reject button clicked:', request.id);
                                    rejectMessageRequest(request.id);
                                  }}
                                  type="button"
                                >
                                  Reject
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </>
                      )}

                      {/* Outgoing Requests */}
                      {outgoingReqs.length > 0 && (
                        <>
                          <h3 className="requests-section-title">Outgoing Requests ({outgoingReqs.length})</h3>
                          {outgoingReqs.map((request) => (
                            <motion.div
                              key={request.id}
                              className="request-item outgoing"
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                            >
                              <div className="request-info">
                                <div className="request-header">
                                  <span className="role-icon">{getRoleIcon(request.requestedRole)}</span>
                                  <span className="request-email">{request.requestedEmail}</span>
                                </div>
                                <div className="request-meta">
                                  {formatTime(request.createdAt)}
                                </div>
                              </div>
                              <div className="request-actions request-actions--outgoing">
                                <span className="status-badge pending">Pending</span>
                                <button
                                  type="button"
                                  className="cancel-outgoing-request-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelOutgoingMessageRequest(request.id);
                                  }}
                                  aria-label={`Cancel message request to ${request.requestedEmail}`}
                                >
                                  Cancel request
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </nav>

        <div 
          className="resize-handle"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />
        <main
          id="messages-main-content"
          className="messages-view messages-view--modern chat-main"
          role="main"
          aria-label="Conversation area"
        >
          {selectedConversation ? (
            <>
              <div className="messages-header-bar chat-header">
                <h3>
                  {conversations.find(c => c.otherUserId === selectedConversation)?.otherUserEmail || 
                   contacts.find(c => c.uid === selectedConversation)?.email}
                </h3>
                <button
                  className={`simplification-toggle ${simplificationMode ? 'active' : ''}`}
                  onClick={() => setSimplificationMode(!simplificationMode)}
                  title={simplificationMode ? 'Disable simplification mode' : 'Enable simplification mode (makes messages easier to read)'}
                  aria-label={simplificationMode ? 'Disable simplification mode' : 'Enable simplification mode'}
                >
                  <span className="toggle-icon">
                    <SimplifyIcon size={16} />
                  </span>
                  <span className="toggle-label">{simplificationMode ? 'Simplified' : 'Simplify'}</span>
                </button>
              </div>
              <div 
                className={`messages-list spacing-${messageSpacing} view-${viewMode}`}
                role="log"
                aria-label="Message history"
                aria-live="polite"
                aria-atomic="false"
              >
                {messages.length === 0 ? (
                  <div className="empty-state" style={{ margin: 'auto', textAlign: 'center' }}>
                    <p style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', margin: 0 }}>
                      No connections yet. Start the conversation!
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const reactions = msg.reactions || {};
                    const reactionEntries = Object.entries(reactions);
                    const reactionGroups: { [emoji: string]: string[] } = {};
                    
                    // Group reactions by emoji
                    reactionEntries.forEach(([uid, emoji]) => {
                      if (!reactionGroups[emoji]) {
                        reactionGroups[emoji] = [];
                      }
                      reactionGroups[emoji].push(uid);
                    });

                    const isEditing = editingMessageId === msg.id;
                    const canEdit = canEditMessage(msg);

                    return (
                      <motion.div
                        key={msg.id}
                        className="message-wrapper"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      >
                        {isEditing ? (
                          <div className="message-edit-container">
                            <input
                              type="text"
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  saveEditedMessage(msg.id);
                                } else if (e.key === 'Escape') {
                                  cancelEditing();
                                }
                              }}
                              className="message-edit-input"
                              autoFocus
                            />
                            <div className="message-edit-actions">
                              <button
                                className="save-edit-button"
                                onClick={() => saveEditedMessage(msg.id)}
                              >
                                Save
                              </button>
                              <button
                                className="cancel-edit-button"
                                onClick={cancelEditing}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`message message-bubble ${msg.senderId === currentUser?.uid ? 'sent msg-sent' : 'received msg-received'} ${showReactionPickerFor === msg.id ? 'picker-open' : ''}`}
                            onClick={() => setShowReactionPickerFor(showReactionPickerFor === msg.id ? null : msg.id)}
                            style={{ cursor: 'pointer' }}
                            onDoubleClick={() => {
                              if (canEdit) {
                                startEditingMessage(msg);
                              }
                            }}
                            title={canEdit ? 'Double-click to edit' : ''}
                          >
                            <div className="message-header">
                              {msg.isVoiceMessage && msg.audioUrl ? (
                                <div className="voice-message-container">
                                  <div className="voice-message-controls">
                                    <button
                                      className={`voice-play-button ${playingVoiceMessageId === msg.id ? 'playing' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        console.log('Playing voice message:', {
                                          messageId: msg.id,
                                          audioUrlLength: msg.audioUrl?.length,
                                          audioUrlPreview: msg.audioUrl?.substring(0, 50),
                                          audioMimeType: msg.audioMimeType,
                                          isVoiceMessage: msg.isVoiceMessage
                                        });
                                        playVoiceMessage(msg.id, msg.audioUrl!, msg.audioMimeType);
                                      }}
                                      title={playingVoiceMessageId === msg.id ? 'Stop playback' : 'Play voice message'}
                                      aria-label={playingVoiceMessageId === msg.id ? 'Stop playback' : 'Play voice message'}
                                    >
                                      {playingVoiceMessageId === msg.id ? '⏸️' : '▶️'}
                                    </button>
                                  </div>
                                  <span className="voice-message-label">🎤 Voice message</span>
                                  {/* Transcript action buttons - appears below "Voice message" label */}
                                  <div className="transcript-actions">
                                    {!msg.transcript ? (
                                      <>
                                        {speechToTextSupported && (
                                          <button
                                            className={`transcript-button-below ${transcribingMessageId === msg.id ? 'transcribing' : ''}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const audioDataUrl = msg.audioUrl?.startsWith('data:') 
                                                ? msg.audioUrl 
                                                : `data:${msg.audioMimeType || 'audio/webm;codecs=opus'};base64,${msg.audioUrl}`;
                                              createTranscript(msg.id, audioDataUrl);
                                            }}
                                            title="Create Transcript"
                                            aria-label="Create transcript for voice message"
                                            disabled={transcribingMessageId === msg.id}
                                          >
                                            {transcribingMessageId === msg.id ? '⏳ Transcribing…' : '📝 Create Transcript'}
                                          </button>
                                        )}
                                      </>
                                    ) : closedTranscripts.has(msg.id) ? (
                                      <button
                                        className="transcript-button-below reopen-transcript"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          reopenTranscript(msg.id);
                                        }}
                                        title="Show Transcript"
                                        aria-label="Show transcript"
                                      >
                                        📄 Show Transcript
                                      </button>
                                    ) : null}
                                  </div>
                                  {transcribingMessageId === msg.id && (
                                    <div className="voice-transcript-transcribing" onClick={(e) => e.stopPropagation()}>
                                      <span className="transcribing-icon">⏳</span>
                                      <span>Transcribing…</span>
                                    </div>
                                  )}
                                  {/* STRICT SPEC: Transcript appears below audio player, text wraps naturally, plain text only */}
                                  {msg.transcript && !closedTranscripts.has(msg.id) && (
                                    <div className="voice-transcript" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        className="close-transcript-button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          closeTranscript(msg.id);
                                        }}
                                        title="Close Transcript"
                                        aria-label="Close transcript"
                                      >
                                        ✕
                                      </button>
                                      <div className="transcript-header">
                                        <strong>Transcript:</strong>
                                      </div>
                                      <div className="transcript-content">
                                        {msg.transcript}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <div 
                                    className={`message-content ${simplificationMode ? 'simplified' : ''}`}
                                    style={simplificationMode ? { whiteSpace: 'pre-line', lineHeight: '1.8' } : {}}
                                  >
                                    {simplificationMode ? simplifyMessage(msg.content) : msg.content}
                                  </div>
                                  <button
                                    className={`tts-button ${speakingMessageId === msg.id ? 'speaking' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const contentToSpeak = simplificationMode ? simplifyMessage(msg.content) : msg.content;
                                      speakMessage(msg.id, contentToSpeak);
                                    }}
                                    title={speakingMessageId === msg.id ? 'Stop reading' : 'Read message aloud'}
                                    aria-label={speakingMessageId === msg.id ? 'Stop reading' : 'Read message aloud'}
                                  >
                                    <img
                                      src={audioIcon}
                                      alt=""
                                      className={speakingMessageId === msg.id ? 'tts-button-icon tts-button-icon--active' : 'tts-button-icon'}
                                      width={18}
                                      height={18}
                                    />
                                  </button>
                                </>
                              )}
                            </div>
                            
                            {/* Reactions */}
                            {reactionEntries.length > 0 && (
                              <div className="message-reactions" onClick={(e) => e.stopPropagation()}>
                                {Object.entries(reactionGroups).map(([emoji, userIds]) => (
                                  <button
                                    key={emoji}
                                    className={`reaction-button ${userIds.includes(currentUser?.uid || '') ? 'user-reacted' : ''}`}
                                    onClick={() => toggleReaction(msg.id, emoji)}
                                    title={`${userIds.length} ${userIds.length === 1 ? 'reaction' : 'reactions'}`}
                                  >
                                    <span className="reaction-emoji">{emoji}</span>
                                    <span className="reaction-count">{userIds.length}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="message-time">
                              {formatTime(msg.timestamp)}
                              {msg.edited && (
                                <span className="edited-label"> • edited</span>
                              )}
                              {canEdit && (
                                <button
                                  className="edit-message-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditingMessage(msg);
                                  }}
                                  title="Edit message"
                                >
                                  ✏️
                                </button>
                              )}
                              {msg.senderId === currentUser?.uid && (
                                <button
                                  type="button"
                                  className="delete-message-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      window.confirm(
                                        'Delete this message? The other person will no longer see it. This cannot be undone.'
                                      )
                                    ) {
                                      void handleDeleteMessage(msg.id);
                                    }
                                  }}
                                  disabled={deletingMessageId === msg.id}
                                  title="Delete message"
                                  aria-label="Delete message"
                                >
                                  {deletingMessageId === msg.id ? '…' : '🗑️'}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Reaction picker appears below message when clicked */}
                        {showReactionPickerFor === msg.id && (
                          <div className="reaction-picker" onClick={(e) => e.stopPropagation()}>
                            {quickReactions.map((emoji) => (
                              <button
                                key={emoji}
                                className={`quick-reaction ${reactions[currentUser?.uid || ''] === emoji ? 'active' : ''}`}
                                onClick={() => {
                                  toggleReaction(msg.id, emoji);
                                  setShowReactionPickerFor(null);
                                }}
                                title={`React with ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                            <button
                              className="quick-reaction add-reaction"
                              onClick={() => {
                                const emoji = prompt('Enter an emoji to react:');
                                if (emoji && emoji.trim()) {
                                  toggleReaction(msg.id, emoji.trim());
                                  setShowReactionPickerFor(null);
                                }
                              }}
                              title="Add custom reaction"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </div>
              <div className="message-input-container message-input-container--floating">
                {/* Typing indicator */}
                {typingStatus[selectedConversation] && (
                  <div className="typing-indicator">
                    <span className="typing-text">
                      {conversations.find(c => c.otherUserId === selectedConversation)?.otherUserEmail || 
                       contacts.find(c => c.uid === selectedConversation)?.email} is typing...
                    </span>
                    <span className="typing-dots">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </span>
                  </div>
                )}
                <div className="message-input-floating-card">
                <div className="message-input-wrapper">
                  {audioBlob && audioUrl ? (
                    <div className="voice-recording-preview">
                      <audio src={audioUrl} controls style={{ width: '100%', maxWidth: '300px' }} />
                      <div className="recording-actions">
                        <button
                          onClick={sendVoiceMessage}
                          className="send-voice-button"
                          title="Send voice message"
                        >
                          ✓ Send
                        </button>
                        <button
                          onClick={cancelRecording}
                          className="cancel-voice-button"
                          title="Cancel"
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    </div>
                  ) : isRecording ? (
                    <div className="recording-indicator">
                      <div className="recording-pulse"></div>
                      <span>Recording... {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
                      <button
                        onClick={stopRecording}
                        className="stop-recording-button"
                        title="Stop recording"
                      >
                        ⏹️ Stop
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => {
                          setNewMessage(e.target.value);
                          handleTyping();
                        }}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        onKeyDown={(e) => {
                          // Escape key to close accessibility panel or clear input
                          if (e.key === 'Escape') {
                            if (showAccessibilitySettings) {
                              setShowAccessibilitySettings(false);
                            } else if (editingMessageId) {
                              setEditingMessageId(null);
                              setEditContent('');
                            } else if (showReactionPickerFor) {
                              setShowReactionPickerFor(null);
                            } else {
                              setNewMessage('');
                            }
                          }
                        }}
                        aria-label="Message input"
                        aria-required="false"
                        onBlur={() => {
                          if (typingTimeoutRef) {
                            clearTimeout(typingTimeoutRef);
                            setTypingTimeoutRef(null);
                          }
                          updateTypingStatus(false);
                          setIsListening(false);
                        }}
                        placeholder={isListening ? "Listening..." : "Type a message..."}
                        className="message-input"
                      />
                      {speechToTextSupported && (
                        <button
                          onClick={() => setIsListening(!isListening)}
                          className={`speech-to-text-button ${isListening ? 'listening' : ''}`}
                          title={isListening ? 'Stop listening' : 'Start speech-to-text'}
                          aria-label={isListening ? 'Stop listening' : 'Start speech-to-text'}
                        >
                          {isListening ? '🛑' : '🎤'}
                        </button>
                      )}
                      <button
                        onClick={startRecording}
                        className="voice-record-button"
                        title="Record voice message"
                        aria-label="Record voice message"
                      >
                        🎙️
                      </button>
                      <button
                        type="button"
                        onClick={sendMessage}
                        className="send-button btn-cyan-solid"
                        disabled={!newMessage.trim() && !audioBlob}
                        aria-label="Send message"
                      >
                        Send
                      </button>
                    </>
                  )}
                </div>
                </div>
              </div>
            </>
          ) : (
            <div className="no-conversation-selected no-conversation-selected--modern" role="status" aria-live="polite">
              <img src={logoImage} alt="" className="no-conversation-selected__logo" width={120} height={36} />
              <p>Select a connection to start the wave</p>
            </div>
          )}
        </main>
      </div>
    </motion.div>
  );
}
