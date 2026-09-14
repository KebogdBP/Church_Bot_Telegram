export interface BibleAnswer {
  answer: string;
  bibleReferences: string[];
  needsPastor: boolean;
  category: string;
  sermonSourceIds: string[];
}

export interface SermonAnswerContext { sermonId: string; title: string; excerpt: string }

export interface BibleAnswerProvider {
  answer(question: string, churchContext?: string, sermonContext?: SermonAnswerContext[]): Promise<BibleAnswer & { model: string }>;
}
