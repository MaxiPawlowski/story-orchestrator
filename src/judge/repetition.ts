export function hotPhrases(replies: readonly string[], minimumReplies = 4): string[] {
  const counts = new Map<string, number>();
  for (const reply of replies.slice(-60)) {
    const words = reply.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
    const seen = new Set<string>();
    for (let size = 4; size <= 8; size += 1) {
      for (let index = 0; index + size <= words.length; index += 1) seen.add(words.slice(index, index + size).join(" "));
    }
    for (const phrase of seen) counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  const hot = [...counts].filter(([, count]) => count >= minimumReplies).map(([phrase]) => phrase).sort((left, right) => right.length - left.length || left.localeCompare(right));
  return hot.filter((phrase, index) => !hot.slice(0, index).some((longer) => longer.includes(phrase))).slice(0, 12);
}
