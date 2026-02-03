import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { createAssignment, notifyStudentsOfAssignment } from '../utils/assignments';
import type { AssignmentSettings } from '../types/assignments';
import './CreateMCQ.css';

interface Connection {
  id: string;
  studentId: string;
  teacherId: string;
  studentEmail: string;
  teacherEmail: string;
}

interface Slide {
  question: string;
  questionType: 'multipleChoice' | 'multipleCorrect';
  options: string[];
  correctAnswer: string;
  correctAnswers: string[];
  imageData: string | null;
}

export function CreateMCQ() {
  const navigate = useNavigate();
  const { setNavigating } = useNavigation();
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [slides, setSlides] = useState<Slide[]>([
    {
      question: '',
      questionType: 'multipleChoice',
      options: ['', '', '', ''],
      correctAnswer: '',
      correctAnswers: [],
      imageData: null,
    },
  ]);
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
    setSlides([
      ...slides,
      {
        question: '',
        questionType: 'multipleChoice',
        options: ['', '', '', ''],
        correctAnswer: '',
        correctAnswers: [],
        imageData: null,
      },
    ]);
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
    setSlides(newSlides);
  };

  const handleRemoveOption = (index: number) => {
    const newSlides = [...slides];
    if (newSlides[currentSlideIndex].options.length > 2) {
      newSlides[currentSlideIndex].options.splice(index, 1);
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

  const convertToCSV = () => {
    if (!title) {
      setError('Please add a title before exporting');
      return null;
    }

    let csv = 'Question,QuestionType,Option1,Option2,Option3,Option4,CorrectAnswer,CorrectAnswers,ImageData\n';

    slides.forEach((slide) => {
      const imageData = slide.imageData ? slide.imageData.split(',')[1] || slide.imageData : '';
      const row = [
        `"${(slide.question || '').replace(/"/g, '""')}"`,
        `"${slide.questionType || 'multipleChoice'}"`,
        ...slide.options.map((opt) => `"${(opt || '').replace(/"/g, '""')}"`),
        `"${(slide.correctAnswer || '').replace(/"/g, '""')}"`,
        `"${(slide.correctAnswers || []).join('|').replace(/"/g, '""')}"`,
        imageData ? `"${imageData}"` : '""',
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
      }
      
      if (imageValidationError) {
        setError(imageValidationError);
        setIsSaving(false);
        return;
      }

      // Prepare slides data, ensuring all fields are valid
      const slidesData = slides.map((slide, index) => {
        const slideData: any = {
          question: slide.question.trim(),
          questionType: slide.questionType,
          options: slide.options.filter(opt => opt.trim() !== ''), // Remove empty options
          correctAnswer: slide.correctAnswer.trim(),
          correctAnswers: (slide.correctAnswers || []).filter(ans => ans.trim() !== ''), // Remove empty answers
        };

        // Only include imageData if it exists and is valid
        // Note: Base64 images can be large. Consider using Firebase Storage for images in production
        if (slide.imageData) {
          slideData.imageData = slide.imageData;
        } else {
          slideData.imageData = null;
        }

        console.log(`🟢 [CreateMCQ] Slide ${index + 1} prepared:`, {
          hasQuestion: !!slideData.question,
          questionLength: slideData.question.length,
          questionType: slideData.questionType,
          optionsCount: slideData.options.length,
          hasCorrectAnswer: !!slideData.correctAnswer,
          hasImageData: !!slideData.imageData
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

  return (
    <motion.div
      className="create-mcq-container"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.header className="create-mcq-header" variants={itemVariants}>
        <motion.h1
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
        >
          Create MCQ Practice 📝
        </motion.h1>
        <div className="header-actions">
          <motion.button
            onClick={exportToCSV}
            className="export-button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Export to CSV"
          >
            📥 Export CSV
          </motion.button>
          <motion.button
            onClick={handleBack}
            className="back-button"
            aria-label="Go back to home"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Back to Home
          </motion.button>
        </div>
      </motion.header>

      <main className="create-mcq-main">
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

        <div className="create-mcq-content">
          {/* Preview Section */}
          <motion.div className="preview-section" variants={itemVariants}>
            <div className="preview-header">
              <h2>Preview</h2>
              <motion.button
                onClick={() => handleDeleteSlide(currentSlideIndex)}
                className="delete-slide-button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={slides.length === 1}
              >
                🗑️ Delete
              </motion.button>
            </div>

            <div className="preview-card">
              <div className="preview-title">{title || 'Set Title'}</div>
              <div className="preview-question">{currentSlide.question || 'Question:'}</div>

              {currentSlide.imageData && (
                <div className="preview-image-container">
                  <img src={currentSlide.imageData} alt="Question" className="preview-image" />
                  <button
                    onClick={handleRemoveImage}
                    className="remove-image-button"
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="preview-answers">
                {currentSlide.questionType === 'multipleChoice' &&
                  currentSlide.options.map((option, index) => (
                    <div
                      key={index}
                      className={`preview-option ${
                        duplicateOptions.includes(index) ? 'duplicate' : ''
                      } ${option === currentSlide.correctAnswer ? 'correct' : ''}`}
                    >
                      <input
                        type="radio"
                        checked={option === currentSlide.correctAnswer}
                        readOnly
                        className="preview-radio"
                      />
                      <span>{option || `Option ${index + 1}`}</span>
                    </div>
                  ))}

                {currentSlide.questionType === 'multipleCorrect' &&
                  currentSlide.options.map((option, index) => (
                    <div
                      key={index}
                      className={`preview-option ${
                        duplicateOptions.includes(index) ? 'duplicate' : ''
                      } ${currentSlide.correctAnswers.includes(option) ? 'correct' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={currentSlide.correctAnswers.includes(option)}
                        readOnly
                        className="preview-checkbox"
                      />
                      <span>{option || `Option ${index + 1}`}</span>
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>

          {/* Edit Section */}
          <motion.div className="edit-section" variants={itemVariants}>
            <h2>Edit Set</h2>
            <form onSubmit={handleSubmit} className="edit-form">
              {/* Set Title */}
              <div className="form-group">
                <label htmlFor="title">Title:</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="form-input"
                  placeholder="Enter set title"
                  required
                />
              </div>

              {/* Slide Navigation */}
              <div className="form-group">
                <label>Questions:</label>
                <div className="slide-navigation">
                  {slides.map((_, index) => (
                    <motion.button
                      key={index}
                      type="button"
                      onClick={() => setCurrentSlideIndex(index)}
                      className={`slide-button ${
                        currentSlideIndex === index ? 'active' : ''
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {index + 1}
                    </motion.button>
                  ))}
                  <motion.button
                    type="button"
                    onClick={handleAddSlide}
                    className="add-slide-button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    + Add
                  </motion.button>
                </div>
              </div>

              {/* Question */}
              <div className="form-group">
                <label htmlFor="question">Question:</label>
                <textarea
                  id="question"
                  value={currentSlide.question}
                  onChange={(e) => handleQuestionChange(e.target.value)}
                  className="form-textarea"
                  placeholder="Enter your question"
                  rows={3}
                  required
                />
              </div>

              {/* Question Type */}
              <div className="form-group">
                <label htmlFor="question-type">Question Type:</label>
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

              {/* Image Upload */}
              <div className="form-group">
                <label htmlFor="image">Image (Optional):</label>
                <label className="image-upload-label">
                  <input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="image-upload-input"
                  />
                  <span className="image-upload-text">
                    {currentSlide.imageData ? 'Replace Image' : '📷 Upload Image'}
                  </span>
                </label>
              </div>

              {/* Options - Multiple Choice */}
              {(currentSlide.questionType === 'multipleChoice' ||
                currentSlide.questionType === 'multipleCorrect') && (
                <div className="form-group">
                  <label>Options:</label>
                  <div className="options-list">
                    {currentSlide.options.map((option, index) => (
                      <div key={index} className="option-input-group">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => handleOptionChange(index, e.target.value)}
                          className={`option-input ${
                            duplicateOptions.includes(index) ? 'duplicate' : ''
                          }`}
                          placeholder={`Option ${index + 1}`}
                        />
                        {currentSlide.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(index)}
                            className="remove-option-button"
                            aria-label="Remove option"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="add-option-button"
                    >
                      + Add Option
                    </button>
                  </div>
                </div>
              )}

              {/* Correct Answer - Single Choice */}
              {currentSlide.questionType === 'multipleChoice' && (
                <div className="form-group">
                  <label htmlFor="correct-answer">Correct Answer:</label>
                  <select
                    id="correct-answer"
                    value={currentSlide.correctAnswer}
                    onChange={(e) => handleCorrectAnswerChange(e.target.value)}
                    className="form-select"
                    required
                  >
                    <option value="">Select correct answer</option>
                    {currentSlide.options.map((option, index) => (
                      <option key={index} value={option}>
                        {option || `Option ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Multiple Correct Answers */}
              {currentSlide.questionType === 'multipleCorrect' && (
                <div className="form-group">
                  <label>Correct Answers:</label>
                  <div className="correct-answers-list">
                    {currentSlide.options.map((option, index) => (
                      <label key={index} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={currentSlide.correctAnswers.includes(option)}
                          onChange={(e) =>
                            handleMultipleCorrectChange(option, e.target.checked)
                          }
                          className="checkbox-input"
                        />
                        <span>{option || `Option ${index + 1}`}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="button-group">
                <motion.button
                  type="submit"
                  className="submit-button"
                  disabled={isSaving}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isSaving ? 'Saving...' : '💾 Save Set'}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={handleBack}
                  className="cancel-button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel
                </motion.button>
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
                            className="submit-button"
                            disabled={selectedStudentIds.length === 0 || !dueDate || isSaving}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {isSaving ? 'Creating...' : '📤 Assign Assignment'}
                          </motion.button>
                          <motion.button
                            type="button"
                            onClick={() => {
                              setNavigating(true);
                              navigate('/home');
                            }}
                            className="cancel-button"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Skip & Go to Home
                          </motion.button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>
      </main>
    </motion.div>
  );
}
