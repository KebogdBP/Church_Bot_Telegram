export interface BibleAnswer {
  answer: string;
  bibleReferences: string[];
  needsPastor: boolean;
  category: string;
}

export interface BibleAnswerProvider {
  answer(question: string, churchContext?: string): Promise<BibleAnswer & { model: string }>;
}
