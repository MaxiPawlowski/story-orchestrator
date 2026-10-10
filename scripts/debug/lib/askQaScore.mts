export interface AskShowMe {
  kind: string;
  target: string;
}

export interface AskAnswerRecord {
  id: string;
  persona: 'author' | 'player';
  ok: boolean;
  answer: string;
  topics: string[];
  showMe: AskShowMe | null;
  steps: number;
  refused: number;
}

export interface AuthorQuestion {
  id: string;
  q: string;
  accept: string[];
  showMeOptional?: boolean;
}

export interface PlayerQuestion {
  id: string;
  q: string;
  unreached?: boolean;
}

export type TopicShowMe = (id: string) => AskShowMe | null;

export const topicShowMe: TopicShowMe = (id) => {
  const [family, ...rest] = id.split('/');
  const tail = rest.join('/');
  if (family === 'feature') return { kind: 'feature', target: tail };
  if (family === 'author') return { kind: 'studio', target: tail };
  if (family === 'guide') {
    const [page, slug] = tail.split('#');
    return { kind: 'doc', target: `${page}.md${slug ? `#${slug}` : ''}` };
  }
  return null;
};

const sameShowMe = (left: AskShowMe | null, right: AskShowMe | null) => Boolean(left && right && left.kind === right.kind && left.target === right.target);

export function scoreAuthorAnswer(question: AuthorQuestion, record: AskAnswerRecord | undefined, showMeOf: TopicShowMe) {
  if (!record || !record.ok) return { id: question.id, cites: false, showMe: false, pass: false, reason: 'no answer' };
  const cited = record.topics.filter((topic) => question.accept.includes(topic));
  const acceptable = question.accept.map(showMeOf).filter((target): target is AskShowMe => target !== null);
  const showMe = record.showMe === null ? Boolean(question.showMeOptional) : acceptable.some((target) => sameShowMe(target, record.showMe));
  const pass = cited.length > 0 && showMe;
  return { id: question.id, cites: cited.length > 0, showMe, pass, reason: pass ? null : cited.length ? 'wrong Show me' : `cited ${record.topics.join(', ') || 'nothing'}` };
}

export function playerLeaks(record: AskAnswerRecord | undefined, needles: readonly string[]): string[] {
  if (!record) return [];
  const text = `${record.answer}\n${record.topics.join('\n')}`;
  return needles.filter((needle) => text.includes(needle));
}

export function scoreAskRun(input: { author: AuthorQuestion[]; player: PlayerQuestion[]; unreached: string[]; authorFloor: number; records: AskAnswerRecord[]; showMeOf: TopicShowMe }) {
  const byId = new Map(input.records.map((record) => [record.id, record]));
  const author = input.author.map((question) => scoreAuthorAnswer(question, byId.get(question.id), input.showMeOf));
  const player = input.player.map((question) => {
    const record = byId.get(question.id);
    const leaks = playerLeaks(record, input.unreached);
    return { id: question.id, answered: Boolean(record?.ok), unreached: Boolean(question.unreached), leaks, pass: leaks.length === 0 };
  });
  const authorPassed = author.filter((row) => row.pass).length;
  const playerClean = player.filter((row) => row.pass).length;
  return {
    author: { passed: authorPassed, of: author.length, floor: input.authorFloor, pass: authorPassed >= input.authorFloor, rows: author },
    player: { clean: playerClean, of: player.length, pass: playerClean === player.length, rows: player },
    pass: authorPassed >= input.authorFloor && playerClean === player.length,
  };
}
