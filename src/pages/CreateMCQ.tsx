import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { createAssignment, notifyStudentsOfAssignment } from '../utils/assignments';
import type { AssignmentSettings } from '../types/assignments';
import './Home.css';
import './Landing.css';
import './CreateMCQ.css';

interface Connection {
  id: string;
  studentId: string;
  teacherId: string;
  studentEmail: string;
  teacherEmail: string;
}

export type SlideMode = 'audio' | 'icons' | 'gesture' | 'simple';

export interface Slide {
  question: string;
  questionType: 'multipleChoice' | 'multipleCorrect';
  options: string[];
  correctAnswer: string;
  correctAnswers: string[];
  imageData: string | null;
  activeModes: SlideMode[];
  optionImages: (string | null)[];
  simplifiedHint?: string;
  simplifiedQuestion?: string;
}

const DEFAULT_ACTIVE_MODES: SlideMode[] = ['audio', 'gesture'];

interface McqSlidePayload {
  question: string;
  questionType: 'multipleChoice' | 'multipleCorrect';
  options: string[];
  correctAnswer: string;
  correctAnswers: string[];
  imageData: string | null;
  activeModes: SlideMode[];
  optionImages: (string | null)[];
  simplifiedQuestion: string;
  simplifiedHint: string;
}

function createEmptySlide(): Slide {
  return {
    question: '',
    questionType: 'multipleChoice',
    options: ['', '', '', ''],
    correctAnswer: '',
    correctAnswers: [],
    imageData: null,
    activeModes: [...DEFAULT_ACTIVE_MODES],
    optionImages: [null, null, null, null],
    simplifiedHint: '',
    simplifiedQuestion: '',
  };
}

export function CreateMCQ() {
  const navigate = useNavigate();
  const { setNavigating } = useNavigation();
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [slides, setSlides] = useState<Slide[]>([createEmptySlide()]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateOptions, setDuplicateOptions] = useState<number[]>([]);
  
  // Assignment state
  const [showAssignSection, setShowAssignSection] = useState(false);
  const [connectedStudents, setConnectedStudents] = useState<Connection[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [timeLimit, setTimeLimit] = useState<number | undefined>(undefined);
  const [attemptLimit, setAttemptLimit] = useState<number | undefined>(undefined);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [savedMcqSetId, setSavedMcqSetId] = useState<string | null>(null);

  const questionTypes = [
    { value: 'multipleChoice', label: 'Multiple Choice (Single Answer)' },
    { value: 'multipleCorrect', label: 'Multiple Choice (Multiple Answers)' },
  ];

  const MODE_ORDER: SlideMode[] = ['audio', 'icons', 'gesture', 'simple'];

  const currentSlide = slides[currentSlideIndex];

  // Check for duplicate options
  useEffect(() => {
    const optionCounts: Record<string, number[]> = {};
    const duplicates: number[] = [];

    currentSlide.options.forEach((option, index) => {
      if (option.trim() !== '') {
        if (optionCounts[option]) {
          duplicates.push(index);
          optionCounts[option].push(index);
        } else {
          optionCounts[option] = [index];
        }
      }
    });

    const allDuplicates = Object.values(optionCounts)
      .filter((indices) => indices.length > 1)
      .flat();

    setDuplicateOptions(allDuplicates);
  }, [currentSlide.options]);

  // Fetch connected students when assignment section is shown
  useEffect(() => {
    const fetchConnectedStudents = async () => {
      if (!currentUser || !showAssignSection) return;

      try {
        setLoadingStudents(true);
        const connectionsQuery = query(
          collection(db, 'connections'),
          where('teacherId', '==', currentUser.uid)
        );
        const connectionsSnapshot = await getDocs(connectionsQuery);
        const connections = connectionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Connection[];
        setConnectedStudents(connections);
      } catch (error) {
        console.error('Error fetching connected students:', error);
        setError('Failed to load students. Please try again.');
      } finally {
        setLoadingStudents(false);
      }
    };

    fetchConnectedStudents();
  }, [currentUser, showAssignSection]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }

    // Limit to 600KB original file size to account for base64 encoding
    // Base64 encoding increases size by ~33%, so 600KB file becomes ~800KB base64
    // Firestore document limit is 1MB, so we leave room for other data
    if (file.size > 600 * 1024) {
      setError('Image must be smaller than 600KB. Please use a smaller image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const newSlides = [...slides];
      newSlides[currentSlideIndex].imageData = event.target?.result as string;
      setSlides(newSlides);
      setError('');
    };
    reader.onerror = () => {
      setError('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    const newSlides = [...slides];
    newSlides[currentSlideIndex].imageData = null;
    setSlides(newSlides);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleAddSlide = () => {
    setSlides([...slides, createEmptySlide()]);
    setCurrentSlideIndex(slides.length);
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length > 1) {
      const newSlides = slides.filter((_, i) => i !== index);
      setSlides(newSlides);
      setCurrentSlideIndex(Math.min(currentSlideIndex, newSlides.length - 1));
    } else {
      setError('A set must have at least one question');
    }
  };

  const handleQuestionChange = (value: string) => {
    const newSlides = [...slides];
    newSlides[currentSlideIndex].question = value;
    setSlides(newSlides);
  };

  const handleOptionChange = (index: number, value: string) => {
    const newSlides = [...slides];
    newSlides[currentSlideIndex].options[index] = value;
    setSlides(newSlides);
  };

  const handleAddOption = () => {
    const newSlides = [...slides];
    newSlides[currentSlideIndex].options.push('');
    const imgs = [...(newSlides[currentSlideIndex].optionImages || [])];
    imgs.push(null);
    newSlides[currentSlideIndex].optionImages = imgs;
    setSlides(newSlides);
  };

  const handleRemoveOption = (index: number) => {
    const newSlides = [...slides];
    if (newSlides[currentSlideIndex].options.length > 2) {
      newSlides[currentSlideIndex].options.splice(index, 1);
      const imgs = [...(newSlides[currentSlideIndex].optionImages || [])];
      imgs.splice(index, 1);
      newSlides[currentSlideIndex].optionImages = imgs;
      setSlides(newSlides);
    } else {
      setError('At least 2 options are required');
    }
  };

  const handleCorrectAnswerChange = (value: string) => {
    const newSlides = [...slides];
    newSlides[currentSlideIndex].correctAnswer = value;
    setSlides(newSlides);
  };

  const handleQuestionTypeChange = (value: 'multipleChoice' | 'multipleCorrect') => {
    const newSlides = [...slides];
    newSlides[currentSlideIndex].questionType = value;
    newSlides[currentSlideIndex].correctAnswer = '';
    newSlides[currentSlideIndex].correctAnswers = [];
    setSlides(newSlides);
  };

  const handleMultipleCorrectChange = (option: string, isChecked: boolean) => {
    const newSlides = [...slides];
    if (isChecked) {
      newSlides[currentSlideIndex].correctAnswers = [
        ...(newSlides[currentSlideIndex].correctAnswers || []),
        option,
      ];
    } else {
      newSlides[currentSlideIndex].correctAnswers = (
        newSlides[currentSlideIndex].correctAnswers || []
      ).filter((ans) => ans !== option);
    }
    setSlides(newSlides);
  };

  const toggleMode = (mode: SlideMode) => {
    setSlides((prev) => {
      const next = [...prev];
      const slide = { ...next[currentSlideIndex] };
      const cur = [...(slide.activeModes?.length ? slide.activeModes : DEFAULT_ACTIVE_MODES)];
      const pos = cur.indexOf(mode);
      if (pos >= 0) {
        if (cur.length <= 1) return prev;
        cur.splice(pos, 1);
      } else {
        cur.push(mode);
      }
      slide.activeModes = cur;
      next[currentSlideIndex] = slide;
      return next;
    });
  };

  const handleOptionImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }

    if (file.size > 600 * 1024) {
      setError('Option icon image must be smaller than 600KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as string;
      setSlides((prev) => {
        const next = [...prev];
        const slide = { ...next[currentSlideIndex] };
        const imgs = [...(slide.optionImages || [])];
        while (imgs.length < slide.options.length) imgs.push(null);
        imgs[index] = data;
        slide.optionImages = imgs;
        next[currentSlideIndex] = slide;
        return next;
      });
      setError('');
    };
    reader.onerror = () => setError('Failed to read image file');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const clearOptionImage = (index: number) => {
    const newSlides = [...slides];
    const imgs = [...(newSlides[currentSlideIndex].optionImages || [])];
    while (imgs.length < newSlides[currentSlideIndex].options.length) imgs.push(null);
    imgs[index] = null;
    newSlides[currentSlideIndex].optionImages = imgs;
    setSlides(newSlides);
  };

  const convertToCSV = () => {
    if (!title) {
      setError('Please add a title before exporting');
      return null;
    }

    let csv =
      'Question,QuestionType,Option1,Option2,Option3,Option4,CorrectAnswer,CorrectAnswers,ImageData,ActiveModes,SimplifiedQuestion,SimplifiedHint\n';

    slides.forEach((slide) => {
      const imageData = slide.imageData ? slide.imageData.split(',')[1] || slide.imageData : '';
      const modes = (slide.activeModes?.length ? slide.activeModes : DEFAULT_ACTIVE_MODES).join('|');
      const row = [
        `"${(slide.question || '').replace(/"/g, '""')}"`,
        `"${slide.questionType || 'multipleChoice'}"`,
        ...slide.options.map((opt) => `"${(opt || '').replace(/"/g, '""')}"`),
        `"${(slide.correctAnswer || '').replace(/"/g, '""')}"`,
        `"${(slide.correctAnswers || []).join('|').replace(/"/g, '""')}"`,
        imageData ? `"${imageData}"` : '""',
        `"${modes.replace(/"/g, '""')}"`,
        `"${(slide.simplifiedQuestion || '').replace(/"/g, '""')}"`,
        `"${(slide.simplifiedHint || '').replace(/"/g, '""')}"`,
      ].join(',');

      csv += row + '\n';
    });

    return csv;
  };

  const exportToCSV = () => {
    const csv = convertToCSV();
    if (!csv) return;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\s+/g, '_')}_quiz.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSuccessMessage('Set exported as CSV successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const validateForm = (): boolean => {
    if (!title.trim()) {
      setError('Please enter a title for your set');
      return false;
    }

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (!slide.question.trim()) {
        setError(`Please enter a question for question ${i + 1}`);
        return false;
      }

      if (slide.questionType === 'multipleChoice') {
        const validOptions = slide.options.filter((opt) => opt.trim() !== '');
        if (validOptions.length < 2) {
          setError(`Question ${i + 1} needs at least 2 options`);
          return false;
        }

        if (!slide.correctAnswer.trim()) {
          setError(`Please select a correct answer for question ${i + 1}`);
          return false;
        }

        const hasDuplicates = new Set(validOptions).size !== validOptions.length;
        if (hasDuplicates) {
          setError(`Options must be unique in question ${i + 1}`);
          return false;
        }
      } else if (slide.questionType === 'multipleCorrect') {
        const validOptions = slide.options.filter((opt) => opt.trim() !== '');
        if (validOptions.length < 2) {
          setError(`Question ${i + 1} needs at least 2 options`);
          return false;
        }

        if (slide.correctAnswers.length === 0) {
          setError(`Please select at least one correct answer for question ${i + 1}`);
          return false;
        }

        const hasDuplicates = new Set(validOptions).size !== validOptions.length;
        if (hasDuplicates) {
          setError(`Options must be unique in question ${i + 1}`);
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      if (!currentUser) {
        setError('You must be logged in to create an MCQ set.');
        setIsSaving(false);
        return;
      }

      // Validate all images first before processing
      let imageValidationError: string | null = null;
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (slide.imageData) {
          const imageSizeBytes = slide.imageData.length;
          const estimatedSizeKB = (imageSizeBytes * 3) / 4 / 1024;

          if (estimatedSizeKB > 600) {
            imageValidationError = `Image in slide ${i + 1} is too large (${estimatedSizeKB.toFixed(0)}KB). Maximum size is 600KB. Please use a smaller image.`;
            break;
          }
        }
        (slide.optionImages || []).forEach((img, j) => {
          if (img && imageValidationError === null) {
            const kb = (img.length * 3) / 4 / 1024;
            if (kb > 600) {
              imageValidationError = `Option icon ${j + 1} on question ${i + 1} is too large (${kb.toFixed(0)}KB). Maximum is 600KB.`;
            }
          }
        });
      }
      
      if (imageValidationError) {
        setError(imageValidationError);
        setIsSaving(false);
        return;
      }

      // Prepare slides data, ensuring all fields are valid
      const slidesData: McqSlidePayload[] = slides.map((slide, index) => {
        const keptIndices = slide.options
          .map((opt, i) => (opt.trim() !== '' ? i : -1))
          .filter((i) => i >= 0);
        const filteredOptions = keptIndices.map((i) => slide.options[i].trim());
        const filteredOptionImages = keptIndices.map((i) => slide.optionImages?.[i] ?? null);

        const slideData: McqSlidePayload = {
          question: slide.question.trim(),
          questionType: slide.questionType,
          options: filteredOptions,
          correctAnswer: slide.correctAnswer.trim(),
          correctAnswers: (slide.correctAnswers || []).filter((ans) => ans.trim() !== ''),
          imageData: slide.imageData ?? null,
          activeModes:
            slide.activeModes?.length ? slide.activeModes : [...DEFAULT_ACTIVE_MODES],
          optionImages: filteredOptionImages,
          simplifiedQuestion: slide.simplifiedQuestion?.trim() || '',
          simplifiedHint: slide.simplifiedHint?.trim() || '',
        };

        console.log(`🟢 [CreateMCQ] Slide ${index + 1} prepared:`, {
          hasQuestion: !!slideData.question,
          questionLength: slideData.question.length,
          questionType: slideData.questionType,
          optionsCount: slideData.options.length,
          hasCorrectAnswer: !!slideData.correctAnswer,
          hasImageData: !!slideData.imageData,
          activeModes: slideData.activeModes,
        });

        return slideData;
      });

      // Check if error was set (from image validation above)
      if (error) {
        setIsSaving(false);
        return;
      }

      // Log what we're about to save
      console.log('🟢 [CreateMCQ] Preparing to save MCQ set:', {
        title: title.trim(),
        slidesCount: slidesData.length,
        slidesDataStructure: slidesData.map((s, i) => ({
          index: i,
          hasQuestion: !!s.question,
          questionLength: s.question?.length || 0,
          questionType: s.questionType,
          optionsCount: s.options?.length || 0,
          hasCorrectAnswer: !!s.correctAnswer,
          correctAnswersCount: s.correctAnswers?.length || 0,
          hasImageData: !!s.imageData
        })),
        userId: currentUser.uid,
        userEmail: currentUser.email
      });

      const setData = {
        title: title.trim(),
        slides: slidesData,
        createdAt: serverTimestamp(),
        userId: currentUser.uid,
        userEmail: currentUser.email || null,
      };

      console.log('🟢 [CreateMCQ] Data structure being saved to Firestore:', {
        hasTitle: !!setData.title,
        title: setData.title,
        hasSlides: !!setData.slides,
        slidesIsArray: Array.isArray(setData.slides),
        slidesLength: setData.slides?.length || 0,
        slidesType: typeof setData.slides,
        allFields: Object.keys(setData)
      });

      const docRef = await addDoc(collection(db, 'mcqSets'), setData);
      const mcqSetId = docRef.id;
      
      console.log('🟢 [CreateMCQ] MCQ set saved successfully!', {
        mcqSetId: mcqSetId,
        title: setData.title,
        slidesCount: setData.slides.length
      });
      
      // Verify what was actually saved by reading it back
      const verifyDocRef = doc(db, 'mcqSets', mcqSetId);
      const verifyDoc = await getDoc(verifyDocRef);
      if (verifyDoc.exists()) {
        const savedData = verifyDoc.data();
        console.log('🟢 [CreateMCQ] Verification - Data actually saved to Firestore:', {
          id: mcqSetId,
          hasSlides: !!savedData.slides,
          slidesIsArray: Array.isArray(savedData.slides),
          slidesLength: savedData.slides?.length || 0,
          allFields: Object.keys(savedData || {}),
          slidesSample: savedData.slides?.[0] ? {
            hasQuestion: !!savedData.slides[0].question,
            questionPreview: savedData.slides[0].question?.substring(0, 50),
            optionsCount: savedData.slides[0].options?.length || 0
          } : null
        });
      } else {
        console.error('🔴 [CreateMCQ] ERROR: Document was not saved! Document does not exist after addDoc.');
      }
      
      setSavedMcqSetId(mcqSetId);

      setSuccessMessage('MCQ set created successfully!');
      
      // If assignment section is visible, show it instead of redirecting
      if (showAssignSection) {
        // Don't redirect yet, allow assignment creation
      } else {
        setTimeout(() => {
          setNavigating(true);
          navigate('/home');
        }, 2000);
      }
    } catch (error: any) {
      console.error('Error saving set:', error);
      console.error('Error code:', error?.code);
      console.error('Error message:', error?.message);
      
      // Provide more specific error messages
      if (error?.code === 'permission-denied') {
        setError('Permission denied. Only teachers can create MCQ sets.');
      } else if (error?.code === 'unauthenticated') {
        setError('You must be logged in to create an MCQ set.');
      } else {
        setError(`Failed to save the set: ${error?.message || 'Unknown error'}. Please try again.`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    setNavigating(true);
    navigate('/home');
  };

  const handleCreateAssignment = async () => {
    if (!currentUser || !savedMcqSetId) {
      setError('MCQ set must be saved first before assigning.');
      return;
    }

    if (selectedStudentIds.length === 0) {
      setError('Please select at least one student.');
      return;
    }

    if (!dueDate) {
      setError('Please select a due date.');
      return;
    }

    // Verify all selected students are actually connected to this teacher
    const connectedStudentIds = connectedStudents.map(conn => conn.studentId);
    const invalidStudents = selectedStudentIds.filter(id => !connectedStudentIds.includes(id));
    if (invalidStudents.length > 0) {
      setError('Some selected students are not connected to you.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');

      const settings: AssignmentSettings = {
        timeLimit: timeLimit && timeLimit > 0 ? timeLimit : undefined,
        attemptLimit: attemptLimit && attemptLimit > 0 ? attemptLimit : undefined,
        shuffleQuestions,
        shuffleOptions,
      };

      const dueDateObj = new Date(dueDate);

      const assignmentId = await createAssignment({
        mcqSetId: savedMcqSetId,
        teacherId: currentUser.uid,
        assignedStudentIds: selectedStudentIds,
        assignedClassIds: [], // Not implemented yet
        dueDate: dueDateObj,
        settings,
      });

      // Notify students
      await notifyStudentsOfAssignment(selectedStudentIds, assignmentId, title);

      setSuccessMessage('Assignment created and assigned successfully!');
      setTimeout(() => {
        setNavigating(true);
        navigate('/home');
      }, 2000);
    } catch (error: any) {
      console.error('Error creating assignment:', error);
      setError(`Failed to create assignment: ${error?.message || 'Unknown error'}. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const themeBg = '#f8fafc';

  return (
    <motion.div
      className="create-mcq-container landing-wrapper brand-bg-light learn-page-brand"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.nav
        className="glass-nav glass-nav-light learn-top-nav"
        role="navigation"
        aria-label="Create MCQ"
        variants={itemVariants}
      >
        <div className="create-mcq-nav-brand">
          <span className="landing-badge-cyan learn-heading-badge">Teacher Studio</span>
          <span className="create-mcq-nav-title hero-title-dark">Create Assignment</span>
        </div>
        <div className="nav-actions learn-nav-actions create-mcq-nav-actions">
          <motion.button
            type="button"
            onClick={exportToCSV}
            className="btn-outline-dark-lg"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            aria-label="Export to CSV"
          >
            Export CSV
          </motion.button>
          <motion.button
            type="button"
            onClick={handleBack}
            className="btn-ghost-dark"
            aria-label="Go back to home"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Cancel
          </motion.button>
          <motion.button
            type="submit"
            form="create-mcq-form"
            className="btn-cyan-solid-lg"
            disabled={isSaving}
            whileHover={{ scale: isSaving ? 1 : 1.02 }}
            whileTap={{ scale: isSaving ? 1 : 0.98 }}
          >
            {isSaving ? 'Saving…' : 'Save & exit'}
          </motion.button>
        </div>
      </motion.nav>

      <main
        id="main-content"
        className="create-mcq-main learn-main--landing"
        role="main"
        style={{
          background: `linear-gradient(180deg, ${themeBg} 0%, #f1f5f9 45%, #e2e8f0 100%)`,
        }}
      >
        {error && (
          <motion.div
            className="error-message"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.div>
        )}

        {successMessage && (
          <motion.div
            className="success-message"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {successMessage}
          </motion.div>
        )}

        <form id="create-mcq-form" onSubmit={handleSubmit} className="create-mcq-form-outer">
          <div className="create-mcq-grid">
            <section className="editor-column">
              <motion.div className="bento-card bento-card-light" variants={itemVariants}>
                <div className="bento-card-head">
                  <h3 className="bento-heading-dark">Question context</h3>
                  <motion.button
                    type="button"
                    onClick={() => handleDeleteSlide(currentSlideIndex)}
                    className="delete-slide-button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={slides.length === 1}
                  >
                    Delete question
                  </motion.button>
                </div>
                <label className="visually-hidden" htmlFor="mcq-set-title">
                  Assignment title
                </label>
                <input
                  id="mcq-set-title"
                  className="form-input-large"
                  placeholder="Question set title (e.g. Math Quiz 1)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
                <div className="slide-pills" role="tablist" aria-label="Questions">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={currentSlideIndex === i}
                      className={`slide-pill ${currentSlideIndex === i ? 'active' : ''}`}
                      onClick={() => setCurrentSlideIndex(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button type="button" className="slide-pill add" onClick={handleAddSlide}>
                    +
                  </button>
                </div>
                <div className="form-group create-mcq-field">
                  <label htmlFor="question">Question</label>
                  <textarea
                    id="question"
                    value={currentSlide.question}
                    onChange={(e) => handleQuestionChange(e.target.value)}
                    className="form-textarea"
                    placeholder="Enter your question"
                    rows={4}
                    required
                  />
                </div>
                <div className="form-group create-mcq-field">
                  <label htmlFor="question-type">Question type</label>
                  <select
                    id="question-type"
                    value={currentSlide.questionType}
                    onChange={(e) =>
                      handleQuestionTypeChange(
                        e.target.value as 'multipleChoice' | 'multipleCorrect'
                      )
                    }
                    className="form-select"
                  >
                    {questionTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group create-mcq-field">
                  <label htmlFor="image">Image (optional)</label>
                  <label className="image-upload-label">
                    <input
                      id="image"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="image-upload-input"
                    />
                    <span className="image-upload-text">
                      {currentSlide.imageData ? 'Replace image' : 'Upload image'}
                    </span>
                  </label>
                  {currentSlide.imageData && (
                    <div className="create-mcq-thumb-wrap">
                      <img src={currentSlide.imageData} alt="" className="create-mcq-thumb" />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="remove-image-button create-mcq-thumb-remove"
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>

              <motion.div className="bento-card bento-card-main" variants={itemVariants}>
                <h3 className="bento-heading-cyan">Multimodal settings</h3>
                <p className="bento-text-muted">
                  Choose which learning modes students can use for this question.
                </p>
                <div className="mode-toggle-grid">
                  {MODE_ORDER.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => toggleMode(mode)}
                      className={`mode-config-btn ${
                        (currentSlide.activeModes?.length
                          ? currentSlide.activeModes
                          : DEFAULT_ACTIVE_MODES
                        ).includes(mode)
                          ? 'enabled'
                          : ''
                      }`}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
                {currentSlide.activeModes.includes('simple') && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mode-sub-form"
                  >
                    <label className="sub-label" htmlFor="simplified-q">
                      Simplified question text
                    </label>
                    <textarea
                      id="simplified-q"
                      className="form-textarea mode-sub-textarea"
                      placeholder="Shorter or easier-to-read wording…"
                      value={currentSlide.simplifiedQuestion ?? ''}
                      onChange={(e) => {
                        const s = [...slides];
                        s[currentSlideIndex].simplifiedQuestion = e.target.value;
                        setSlides(s);
                      }}
                      rows={3}
                    />
                    <label className="sub-label" htmlFor="simplified-hint">
                      Hint for Buddy assistant
                    </label>
                    <input
                      id="simplified-hint"
                      className="form-input"
                      placeholder="e.g. Try counting the red apples"
                      value={currentSlide.simplifiedHint ?? ''}
                      onChange={(e) => {
                        const s = [...slides];
                        s[currentSlideIndex].simplifiedHint = e.target.value;
                        setSlides(s);
                      }}
                    />
                  </motion.div>
                )}
              </motion.div>
            </section>

            <section className="options-column">
              <motion.div className="bento-card bento-card-light" variants={itemVariants}>
                <h3 className="bento-heading-dark">Answer options</h3>
                <p className="bento-text-muted">
                  Mark the correct answer(s). With Icons mode on, add an optional image per option.
                </p>
                <div className="options-editor-list">
                  {currentSlide.options.map((option, idx) => (
                    <div key={idx} className="option-row-complex">
                      <div className="option-main">
                        {currentSlide.questionType === 'multipleChoice' ? (
                          <input
                            type="radio"
                            name="mcq-correct"
                            checked={currentSlide.correctAnswer === option && option.trim() !== ''}
                            onChange={() => handleCorrectAnswerChange(option)}
                            aria-label={`Correct answer ${idx + 1}`}
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={currentSlide.correctAnswers.includes(option)}
                            onChange={(e) =>
                              handleMultipleCorrectChange(option, e.target.checked)
                            }
                            aria-label={`Mark option ${idx + 1} as correct`}
                          />
                        )}
                        <input
                          className={`option-text-input ${
                            duplicateOptions.includes(idx) ? 'duplicate' : ''
                          }`}
                          value={option}
                          placeholder={`Option ${idx + 1}`}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                        />
                        {currentSlide.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            className="remove-option-button"
                            aria-label="Remove option"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {currentSlide.activeModes.includes('icons') && (
                        <div className="option-icon-upload">
                          <label className="icon-dropzone">
                            {(currentSlide.optionImages?.[idx] ? 'Change icon' : 'Add icon') +
                              ' (Icons mode)'}
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(e) => handleOptionImageUpload(idx, e)}
                            />
                          </label>
                          {currentSlide.optionImages?.[idx] && (
                            <button
                              type="button"
                              className="icon-remove-btn"
                              onClick={() => clearOptionImage(idx)}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={handleAddOption} className="add-option-button">
                  + Add option
                </button>
              </motion.div>
            </section>
          </div>
        </form>

            {/* Assign Assignment Section */}
            {savedMcqSetId && (
              <motion.div
                className="assign-section"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="assign-section-header">
                  <h3>Assign Assignment</h3>
                  <button
                    type="button"
                    onClick={() => setShowAssignSection(!showAssignSection)}
                    className="toggle-assign-button"
                  >
                    {showAssignSection ? '▼ Hide' : '▶ Show'}
                  </button>
                </div>

                {showAssignSection && (
                  <motion.div
                    className="assign-form"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3 }}
                  >
                    {loadingStudents ? (
                      <div className="loading-message">Loading students...</div>
                    ) : connectedStudents.length === 0 ? (
                      <div className="no-students-message">
                        You don't have any connected students yet. Connect with students from your homepage first.
                      </div>
                    ) : (
                      <>
                        {/* Student Selection */}
                        <div className="form-group">
                          <label>Select Students (Multi-select):</label>
                          <div className="students-checkbox-list">
                            {connectedStudents.map((connection) => (
                              <label key={connection.id} className="student-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={selectedStudentIds.includes(connection.studentId)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedStudentIds([...selectedStudentIds, connection.studentId]);
                                    } else {
                                      setSelectedStudentIds(selectedStudentIds.filter(id => id !== connection.studentId));
                                    }
                                  }}
                                  className="checkbox-input"
                                />
                                <span>{connection.studentEmail}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Due Date */}
                        <div className="form-group">
                          <label htmlFor="due-date">Due Date (Required):</label>
                          <input
                            id="due-date"
                            type="datetime-local"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="form-input"
                            min={new Date().toISOString().slice(0, 16)}
                            required
                          />
                        </div>

                        {/* Time Limit */}
                        <div className="form-group">
                          <label htmlFor="time-limit">Time Limit in Minutes (Optional, 0 = no limit):</label>
                          <input
                            id="time-limit"
                            type="number"
                            value={timeLimit ?? ''}
                            onChange={(e) => setTimeLimit(e.target.value ? parseInt(e.target.value) : undefined)}
                            className="form-input"
                            min="0"
                            placeholder="No limit"
                          />
                        </div>

                        {/* Attempt Limit */}
                        <div className="form-group">
                          <label htmlFor="attempt-limit">Attempt Limit (Optional, 0 = unlimited):</label>
                          <input
                            id="attempt-limit"
                            type="number"
                            value={attemptLimit ?? ''}
                            onChange={(e) => setAttemptLimit(e.target.value ? parseInt(e.target.value) : undefined)}
                            className="form-input"
                            min="0"
                            placeholder="Unlimited"
                          />
                        </div>

                        {/* Shuffle Options */}
                        <div className="form-group">
                          <label className="toggle-label">
                            <input
                              type="checkbox"
                              checked={shuffleQuestions}
                              onChange={(e) => setShuffleQuestions(e.target.checked)}
                              className="checkbox-input"
                            />
                            <span>Shuffle Questions</span>
                          </label>
                        </div>

                        <div className="form-group">
                          <label className="toggle-label">
                            <input
                              type="checkbox"
                              checked={shuffleOptions}
                              onChange={(e) => setShuffleOptions(e.target.checked)}
                              className="checkbox-input"
                            />
                            <span>Shuffle Answer Options</span>
                          </label>
                        </div>

                        {/* Assign Button */}
                        <div className="button-group">
                          <motion.button
                            type="button"
                            onClick={handleCreateAssignment}
                            className="btn-cyan-solid-lg"
                            disabled={selectedStudentIds.length === 0 || !dueDate || isSaving}
                            whileHover={{ scale: selectedStudentIds.length === 0 || !dueDate || isSaving ? 1 : 1.02 }}
                            whileTap={{ scale: selectedStudentIds.length === 0 || !dueDate || isSaving ? 1 : 0.98 }}
                          >
                            {isSaving ? 'Creating…' : 'Assign to students'}
                          </motion.button>
                          <motion.button
                            type="button"
                            onClick={() => {
                              setNavigating(true);
                              navigate('/home');
                            }}
                            className="btn-outline-dark-lg"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Skip & go home
                          </motion.button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
      </main>
    </motion.div>
  );
}
