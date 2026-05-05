const oracledb = require("oracledb");

oracledb.initOracleClient({ libDir: "C:\\oracle\\instantclient" });

const dbConfig = {
  user: "uniscope",
  password: "uniscope123",
  connectString: "localhost:1521/xe"
};

function makeFallbackUrl(collegeName) {
  const q = encodeURIComponent(`${String(collegeName || "").trim()} official website`);
  return `https://www.google.com/search?q=${q}`;
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
    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `select college_id, college_name, college_link
       from sys.college`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    let updated = 0;
    for (const row of result.rows) {
      const existing = String(row.COLLEGE_LINK || "").trim();
      if (existing) continue;

      const fallback = makeFallbackUrl(row.COLLEGE_NAME);
      await connection.execute(
        `update sys.college
         set college_link = :link
         where college_id = :id`,
        { link: fallback, id: row.COLLEGE_ID },
        { autoCommit: false }
      );
      updated++;

      if (updated % 1000 === 0) {
        await connection.commit();
      }
    }

    await connection.commit();

    const verify = await connection.execute(
      `select count(*) as cnt
       from sys.college
       where college_link is null
          or trim(college_link) is null`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log(
      JSON.stringify(
        {
          linksFilled: updated,
          missingLinksAfterRun: verify.rows[0].CNT
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

