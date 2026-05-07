function recommend(student, colleges) {
  return colleges.map(c => {
    const cutoff = Number(c.CUTOFF_MARK || c.CUTOFF || 0);
    const rank = Number(c.RANKING_ID || 100);
    const avgPackage = Number(c.AVG_SALARY || 0);
    const fee = Number(c.FEE || 0);
    const location = c.CITY_NAME || "";

    let score = 0;

    score += Number(student.cutoff || 0) >= cutoff ? 35 : 0;
    score += Math.max(0, 100 - rank) * 0.25;
    score += avgPackage * 0.000002;
    score += Number(student.budget || 0) >= fee ? 15 : 0;

    if (
      student.location &&
      location.toLowerCase().includes(student.location.toLowerCase())
    ) {
      score += 5;
    }

    return {
      ...c,
      score
    };
  }).sort((a, b) => b.score - a.score);
}