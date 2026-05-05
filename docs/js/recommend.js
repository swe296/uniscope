function recommend(student, colleges) {
  return colleges.map(c => {

    const cutoff = Number(c.CUTOFF_MARK || 0);
    const rank = Number(c.RANKING_ID || 0);
    const avgPackage = Number(c.AVG_SALARY || 0);
    const fee = Number(c.FEE || 0);
    const location = c.CITY_NAME || "";

    let score = 0;

    // cutoff match
    score += student.cutoff >= cutoff ? 35 : 0;

    // better rank = higher score
    score += (100 - rank) * 0.25;

    // placement importance
    score += avgPackage * 0.2;

    // budget fit
    score += student.budget >= fee ? 15 : 0;

    // location preference
    if (student.location && location.toLowerCase().includes(student.location.toLowerCase())) {
      score += 5;
    }

    return {
      ...c,
      score
    };

  }).sort((a, b) => b.score - a.score);
}