const oracledb = require("oracledb");

oracledb.initOracleClient({ libDir: "C:\\oracle\\instantclient" });

const dbConfig = {
  user: "uniscope",
  password: "uniscope123",
  connectString: "localhost:1521/xe"
};

const SOURCE_URL =
  "https://www.nirfindia.org/Rankings/2025/OverallRankingALL.html";

async function closeConnection(connection) {
  if (connection) {
    try {
      await connection.close();
    } catch (e) {}
  }
}

function stripTags(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseInstitutionsFromHtml(html) {
  const tableMatch = String(html).match(
    /<table[^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) return [];

  const tableHtml = tableMatch[1];
  const rowMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  const institutions = [];
  for (const rm of rowMatches) {
    const rowHtml = rm[1];
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(m => stripTags(m[1]))
      .filter(Boolean);

    // Expect: Name | City | State
    if (cells.length < 3) continue;
    if (cells[0].toLowerCase() === "name") continue;

    const [name, city, state] = cells;
    if (!name) continue;

    institutions.push({
      name,
      city: city || "Unknown",
      state: state || ""
    });
  }

  return institutions;
}

async function nextId(connection, tableName, idColumn) {
  const r = await connection.execute(
    `select nvl(max(${idColumn}), 0) + 1 as next_id from ${tableName}`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return Number(r.rows[0].NEXT_ID);
}

async function getOrCreateCity(connection, cityName, state, country) {
  const existing = await connection.execute(
    `select city_id
     from sys.city
     where upper(city_name) = upper(:city_name)
       and upper(nvl(country, '')) = upper(:country)`,
    {
      city_name: cityName,
      country: country
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].CITY_ID;
  }

  const cityId = await nextId(connection, "sys.city", "city_id");

  await connection.execute(
    `insert into sys.city (city_id, city_name, state, country)
     values (:city_id, :city_name, :state, :country)`,
    {
      city_id: cityId,
      city_name: cityName,
      state: state,
      country: country
    }
  );

  return cityId;
}

async function insertCollegeIfMissing(connection, collegeName, rankingId, cityId) {
  const existing = await connection.execute(
    `select college_id
     from sys.college
     where upper(college_name) = upper(:college_name)`,
    { college_name: collegeName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (existing.rows.length > 0) return false;

  const collegeId = await nextId(connection, "sys.college", "college_id");

  await connection.execute(
    `insert into sys.college (college_id, college_name, ranking_id, city_id, college_link)
     values (:college_id, :college_name, :ranking_id, :city_id, :college_link)`,
    {
      college_id: collegeId,
      college_name: collegeName,
      ranking_id: Number(rankingId),
      city_id: cityId,
      college_link: null
    }
  );

  return true;
}

async function main() {
  let connection;
  try {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch NIRF list: HTTP ${res.status}`);
    }
    const html = await res.text();
    const institutions = parseInstitutionsFromHtml(html);

    if (institutions.length === 0) {
      throw new Error("No institutions parsed from NIRF page (format changed?)");
    }

    connection = await oracledb.getConnection(dbConfig);

    let inserted = 0;
    let skipped = 0;
    let skippedTooLongName = 0;
    let rank = 1;

    for (const inst of institutions) {
      const cleanedName = String(inst.name || "").trim().replace(/^\"|\"$/g, "");
      if (!cleanedName) {
        skipped++;
        rank++;
        continue;
      }
      if (cleanedName.length > 100) {
        skippedTooLongName++;
        rank++;
        continue;
      }

      const cityId = await getOrCreateCity(
        connection,
        inst.city,
        inst.state,
        "INDIA"
      );
      const didInsert = await insertCollegeIfMissing(
        connection,
        cleanedName,
        rank,
        cityId
      );
      if (didInsert) inserted++;
      else skipped++;

      rank++;
      if ((inserted + skipped) % 200 === 0) {
        await connection.commit();
      }
    }

    await connection.commit();
    console.log(
      JSON.stringify(
        {
          source: SOURCE_URL,
          parsed: institutions.length,
          inserted,
          skippedExisting: skipped
          ,
          skippedTooLongName
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

