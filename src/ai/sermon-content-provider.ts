export interface SermonContent {
  summary: string;
  outline: Array<{ title: string; points: string[] }>;
  keyThoughts: string[];
  reflectionQuestions: string[];
  followUpPosts: string[];
}

export interface SermonContentProvider {
  generate(transcript: string): Promise<SermonContent & { model: string }>;
}
