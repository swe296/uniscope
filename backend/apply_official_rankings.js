const oracledb = require("oracledb");

oracledb.initOracleClient({ libDir: "C:\\oracle\\instantclient" });

const dbConfig = {
  user: "uniscope",
  password: "uniscope123",
  connectString: "localhost:1521/xe"
};

const NIRF_URL = "https://www.nirfindia.org/Rankings/2025/OverallRanking.html";

// QS 2025 top universities (official top-10 published on QS summary)
const QS_TOP_10 = [
  "Massachusetts Institute of Technology",
  "Imperial College London",
  "University of Oxford",
  "Harvard University",
  "University of Cambridge",
  "Stanford University",
  "ETH Zurich",
  "National University of Singapore",
  "University College London",
  "California Institute of Technology"
];

function normalizeName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNirfNames(html) {
  const matches = [
    ...String(html).matchAll(
      /<td>\s*IR-O-U-[^<]*<\/td>\s*<td>\s*([\s\S]*?)<div\s+style="float:right;">/gi
    )
  ];

  const names = [];
  for (const m of matches) {
    const raw = String(m[1] || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (raw) names.push(raw);
  }

  return [...new Set(names)];
}

async function closeConnection(connection) {
  if (connection) {
    try {
      await connection.close();
    } catch (e) {}
  }
}

async function main() {
  let connection;
  try {
    const nirfRes = await fetch(NIRF_URL);
    if (!nirfRes.ok) throw new Error(`NIRF fetch failed: ${nirfRes.status}`);
    const nirfHtml = await nirfRes.text();
    const nirfRanked = parseNirfNames(nirfHtml);

    connection = await oracledb.getConnection(dbConfig);

    const colleges = await connection.execute(
      `select c.college_id, c.college_name, upper(nvl(trim(ct.country), '')) as country
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const india = colleges.rows.filter(r => r.COUNTRY === "INDIA");
    const abroad = colleges.rows.filter(r => r.COUNTRY && r.COUNTRY !== "INDIA");

    // Reset to null first so ranks are not misleading.
    await connection.execute(
      `update sys.college set ranking_id = null`,
      [],
      { autoCommit: false }
    );

    const indiaMap = new Map();
    for (const row of india) {
      const key = normalizeName(row.COLLEGE_NAME);
      if (!indiaMap.has(key)) indiaMap.set(key, []);
      indiaMap.get(key).push(row.COLLEGE_ID);
    }

    let nirfUpdated = 0;
    let nirfMissed = 0;
    let rank = 1;
    for (const name of nirfRanked) {
      const key = normalizeName(name);
      const ids = indiaMap.get(key) || [];
      if (ids.length === 0) {
        nirfMissed++;
        rank++;
        continue;
      }
      for (const collegeId of ids) {
        await connection.execute(
          `update sys.college set ranking_id = :rank where college_id = :id`,
          { rank, id: collegeId },
          { autoCommit: false }
        );
        nirfUpdated++;
      }
      rank++;
    }

    const abroadMap = new Map();
    for (const row of abroad) {
      const key = normalizeName(row.COLLEGE_NAME);
      if (!abroadMap.has(key)) abroadMap.set(key, []);
      abroadMap.get(key).push(row.COLLEGE_ID);
    }

    // Common aliases in existing data
    const qsAliases = {
      "MASSACHUSETTS INSTITUTE OF TECHNOLOGY": ["MIT"],
      "NATIONAL UNIVERSITY OF SINGAPORE": ["NATIONAL UNIVERSITY SINGAPORE", "NUS"],
      "CALIFORNIA INSTITUTE OF TECHNOLOGY": ["CALIFORNIA INSTITUTE OF TECHNOLOGY CALTECH", "CALTECH"],
      "ETH ZURICH": ["ETH ZURICH SWISS FEDERAL INSTITUTE OF TECHNOLOGY"]
    };

    let qsUpdated = 0;
    let qsMissed = 0;
    for (let i = 0; i < QS_TOP_10.length; i++) {
      const rankValue = i + 1;
      const baseName = QS_TOP_10[i];
      const keys = [normalizeName(baseName)];
      const alias = qsAliases[normalizeName(baseName)] || [];
      alias.forEach(a => keys.push(normalizeName(a)));

      const matchedIds = [];
      for (const k of keys) {
        const ids = abroadMap.get(k) || [];
        ids.forEach(id => matchedIds.push(id));
      }

      if (matchedIds.length === 0) {
        qsMissed++;
        continue;
      }

      for (const collegeId of [...new Set(matchedIds)]) {
        await connection.execute(
          `update sys.college set ranking_id = :rank where college_id = :id`,
          { rank: rankValue, id: collegeId },
          { autoCommit: false }
        );
        qsUpdated++;
      }
    }

    await connection.commit();

    console.log(
      JSON.stringify(
        {
          nirfParsed: nirfRanked.length,
          nirfUpdated,
          nirfMissed,
          qsTopConsidered: QS_TOP_10.length,
          qsUpdated,
          qsMissed
        },
        null,
        2
      )
    );
  } finally {
    await closeConnection(connection);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

