export function moduleFaqTools(raw = {}) {
  if (raw.questions === undefined) return {};
  if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > 25) throw new Error('أضف من سؤال واحد إلى 25 سؤالًا.');
  const questions = raw.questions.map((item,index) => {
    const question = String(item?.question || '').trim(), answer = String(item?.answer || '').trim();
    if (!question || question.length > 100 || !answer || answer.length > 1800) throw new Error('السؤال حتى 100 حرف، والإجابة حتى 1800 حرف.');
    return { id: String(index), question, answer };
  });
  return { questions };
}
