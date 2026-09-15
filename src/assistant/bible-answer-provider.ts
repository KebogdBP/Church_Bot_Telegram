export interface BibleAnswer {
  answer: string;
  bibleReferences: string[];
  needsPastor: boolean;
  category: string;
  sermonSourceIds: string[];
}

export interface SermonAnswerContext { sermonId: string; title: string; excerpt: string }
export interface ConversationTurn { role: 'user' | 'assistant'; content: string }

export interface BibleAnswerProvider {
  answer(question: string, churchContext?: string, sermonContext?: SermonAnswerContext[], history?: ConversationTurn[]): Promise<BibleAnswer & { model: string }>;
}
