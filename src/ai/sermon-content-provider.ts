export interface SermonContent {
  summary: string;
  keyThoughts: string[];
  reflectionQuestions: string[];
  followUpPosts: string[];
}

export interface SermonContentProvider {
  generate(transcript: string): Promise<SermonContent & { model: string }>;
}
