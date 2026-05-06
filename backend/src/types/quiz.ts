export interface QuizQuestion {
  reference_page: string;
  question: string;
  options: [string, string, string, string];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  quality_warnings?: string[];
}

export interface QuizOutput {
  source_file: string;
  focus_area: string;
  generated_at: string;
  questions: QuizQuestion[];
}
