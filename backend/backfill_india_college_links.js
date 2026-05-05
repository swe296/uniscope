const oracledb = require("oracledb");

oracledb.initOracleClient({ libDir: "C:\\oracle\\instantclient" });

const dbConfig = {
  user: "uniscope",
  password: "uniscope123",
  connectString: "localhost:1521/xe"
};

const SOURCE_URL =
  "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";

function normalizeName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Dataset fetch failed: ${res.status}`);
    const data = await res.json();

    const indiaRows = data.filter(
      r => String(r.country || "").trim().toUpperCase() === "INDIA"
    );

    const linkByName = new Map();
    for (const r of indiaRows) {
      const name = normalizeName(r.name);
      const webPages = Array.isArray(r.web_pages) ? r.web_pages : [];
      const link = String(webPages[0] || "").trim();
      if (!name || !link) continue;
      if (!linkByName.has(name)) linkByName.set(name, link);
    }

    connection = await oracledb.getConnection(dbConfig);

    const collegesRes = await connection.execute(
      `select c.college_id, c.college_name, c.college_link
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       where upper(nvl(trim(ct.country), 'INDIA')) = 'INDIA'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    let updated = 0;
    let matched = 0;
    for (const row of collegesRes.rows) {
      const key = normalizeName(row.COLLEGE_NAME);
      const link = linkByName.get(key);
      if (!link) continue;
      matched++;
      if (row.COLLEGE_LINK && String(row.COLLEGE_LINK).trim()) continue;

      await connection.execute(
        `update sys.college
         set college_link = :link
         where college_id = :id`,
        { link, id: row.COLLEGE_ID },
        { autoCommit: false }
      );
      updated++;
    }

    await connection.commit();
    console.log(
      JSON.stringify(
        {
          indiaDatasetRows: indiaRows.length,
          matchedNames: matched,
          linksUpdated: updated
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

