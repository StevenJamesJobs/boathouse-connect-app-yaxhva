// Exam state machine and scoring logic

export interface ExamQuestion {
  id: string;
  question_order: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  is_bonus: boolean;
  bonus_bucks_value: number | null;
  source_type: 'auto' | 'custom' | 'bonus';
  // Spanish translations
  question_text_es?: string | null;
  option_a_es?: string | null;
  option_b_es?: string | null;
  option_c_es?: string | null;
  option_d_es?: string | null;
}

export interface AnswerRecord {
  question_id: string;
  selected_option: 'A' | 'B' | 'C' | 'D';
  is_correct: boolean;
}

export type ExamPhase = 'loading' | 'intro' | 'playing' | 'completed';

export interface ExamState {
  questions: ExamQuestion[];
  currentIndex: number;
  answers: AnswerRecord[];
  selectedOption: 'A' | 'B' | 'C' | 'D' | null;
  phase: ExamPhase;
  startTime: number | null;
  isTimedOut: boolean;
}

// Create initial exam state
export function createExamState(questions: ExamQuestion[]): ExamState {
  return {
    questions,
    currentIndex: 0,
    answers: [],
    selectedOption: null,
    phase: 'loading',
    startTime: null,
    isTimedOut: false,
  };
}

// Start the exam (transition from intro to playing)
export function startExam(state: ExamState): ExamState {
  return {
    ...state,
    phase: 'playing',
    startTime: Date.now(),
  };
}

// Select an option for the current question
export function selectOption(state: ExamState, option: 'A' | 'B' | 'C' | 'D'): ExamState {
  return {
    ...state,
    selectedOption: option,
  };
}

// Submit the current answer and advance to next question (or complete)
export function submitAnswer(state: ExamState): ExamState {
  if (!state.selectedOption) return state;

  const currentQuestion = state.questions[state.currentIndex];
  const isCorrect = state.selectedOption === currentQuestion.correct_option;

  const newAnswer: AnswerRecord = {
    question_id: currentQuestion.id,
    selected_option: state.selectedOption,
    is_correct: isCorrect,
  };

  const newAnswers = [...state.answers, newAnswer];
  const isLastQuestion = state.currentIndex >= state.questions.length - 1;

  return {
    ...state,
    answers: newAnswers,
    currentIndex: isLastQuestion ? state.currentIndex : state.currentIndex + 1,
    selectedOption: null,
    phase: isLastQuestion ? 'completed' : 'playing',
  };
}

// Handle timer expiry — mark all remaining questions as unanswered/wrong
export function handleTimeout(state: ExamState): ExamState {
  const remainingAnswers: AnswerRecord[] = [];

  // Mark all unanswered questions as wrong
  for (let i = state.answers.length; i < state.questions.length; i++) {
    remainingAnswers.push({
      question_id: state.questions[i].id,
      selected_option: 'A', // placeholder — not actually selected
      is_correct: false,
    });
  }

  return {
    ...state,
    answers: [...state.answers, ...remainingAnswers],
    phase: 'completed',
    isTimedOut: true,
  };
}

// Calculate scoring results.
//
// rewardPerCorrect defaults to $1 per correct standard question. When a user
// is eligible for multiple weekly quizzes we pass $1/N here so the weekly
// maximum earnings from standard questions stays constant regardless of how
// many quizzes a user takes (bonus questions always pay their full value).
export function calculateResults(
  state: ExamState,
  rewardPerCorrect: number = 1
): {
  correctCount: number;
  totalQuestions: number;
  standardCorrect: number;
  bonusCorrect: boolean;
  bonusBucksValue: number;
  totalBucksAwarded: number;
  timeSeconds: number;
} {
  let standardCorrect = 0;
  let bonusCorrect = false;
  let bonusBucksValue = 0;

  state.answers.forEach((answer, index) => {
    const question = state.questions[index];
    if (!question) return;

    if (question.is_bonus) {
      bonusBucksValue = question.bonus_bucks_value || 0;
      if (answer.is_correct) {
        bonusCorrect = true;
      }
    } else {
      if (answer.is_correct) {
        standardCorrect++;
      }
    }
  });

  const correctCount = standardCorrect + (bonusCorrect ? 1 : 0);
  const totalQuestions = state.questions.length;

  // Standard reward × rewardPerCorrect (rounded to cents) + full bonus value
  const standardBucks = Math.round(standardCorrect * rewardPerCorrect * 100) / 100;
  const totalBucksAwarded = standardBucks + (bonusCorrect ? bonusBucksValue : 0);

  const timeSeconds = state.startTime
    ? Math.floor((Date.now() - state.startTime) / 1000)
    : 0;

  return {
    correctCount,
    totalQuestions,
    standardCorrect,
    bonusCorrect,
    bonusBucksValue,
    totalBucksAwarded,
    timeSeconds,
  };
}

// Get the current question
export function getCurrentQuestion(state: ExamState): ExamQuestion | null {
  if (state.currentIndex >= state.questions.length) return null;
  return state.questions[state.currentIndex];
}

// Get answer status for indicator dots
export function getAnswerStatuses(state: ExamState): ('unanswered' | 'correct' | 'wrong')[] {
  return state.questions.map((_, index) => {
    if (index >= state.answers.length) return 'unanswered';
    return state.answers[index].is_correct ? 'correct' : 'wrong';
  });
}

// Format seconds as M:SS
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Countdown urgency tiers used for color-coding close_at countdowns.
export type CountdownUrgency = 'normal' | 'amber' | 'red' | 'expired';

export function getCountdownUrgency(msRemaining: number): CountdownUrgency {
  if (msRemaining <= 0) return 'expired';
  if (msRemaining < 60 * 60 * 1000) return 'red'; // < 1h
  if (msRemaining < 24 * 60 * 60 * 1000) return 'amber'; // < 24h
  return 'normal';
}

// Human-readable short countdown: "3d 4h", "5h 12m", "4m 23s", or "Expired".
// For sub-day durations it shows two adjacent units so the label doesn't
// flicker every second once you're far from the deadline.
export function formatCountdown(msRemaining: number, isSpanish: boolean = false): string {
  if (msRemaining <= 0) {
    return isSpanish ? 'Expirado' : 'Expired';
  }
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
