const oracledb = require("oracledb");

oracledb.initOracleClient({ libDir: "C:\\oracle\\instantclient" });

const dbConfig = {
  user: "uniscope",
  password: "uniscope123",
  connectString: "localhost:1521/xe"
};

const SOURCE_URL =
  "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";

async function closeConnection(connection) {
  if (connection) {
    try {
      await connection.close();
    } catch (e) {}
  }
}

async function nextId(connection, tableName, idColumn) {
  const r = await connection.execute(
    `select nvl(max(${idColumn}), 0) + 1 as next_id from ${tableName}`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return Number(r.rows[0].NEXT_ID);
}

function normalizeCountry(country) {
  return String(country || "").trim().toUpperCase();
}

function toAscii(value) {
  return String(value || "").replace(/[^\x00-\x7F]/g, "").trim();
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

async function hasCollegeInCountry(connection, collegeName, country) {
  const r = await connection.execute(
    `select college_id
     from (
       select c.college_id
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       where upper(c.college_name) = upper(:college_name)
         and upper(nvl(ct.country, '')) = upper(:country)
     )
     where rownum = 1`,
    { college_name: collegeName, country },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  return r.rows.length > 0;
}

async function insertCollege(connection, collegeName, rankingId, cityId, link) {
  const collegeId = await nextId(connection, "sys.college", "college_id");
  await connection.execute(
    `insert into sys.college (college_id, college_name, ranking_id, city_id, college_link)
     values (:college_id, :college_name, :ranking_id, :city_id, :college_link)`,
    {
      college_id: collegeId,
      college_name: collegeName,
      ranking_id: rankingId,
      city_id: cityId,
      college_link: link
    }
  );
}

async function main() {
  let connection;
  try {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch dataset: HTTP ${res.status}`);
    }

    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("Foreign university dataset is empty");
    }

    connection = await oracledb.getConnection(dbConfig);

    let inserted = 0;
    let skippedIndia = 0;
    let skippedDuplicate = 0;
    let skippedLongName = 0;
    let rank = 1;

    for (const row of raw) {
      const countryRaw = String(row.country || "").trim();
      const country = normalizeCountry(countryRaw);
      if (!countryRaw || country === "INDIA") {
        skippedIndia++;
        continue;
      }

      const name = toAscii(row.name);
      if (!name) continue;
      const safeName = name.slice(0, 100);
      if (!safeName) {
        continue;
      }
      if (name.length > 100) {
        skippedLongName++;
      }

      const cityName = "Unknown";
      const state = "";
      const webPages = Array.isArray(row.web_pages) ? row.web_pages : [];
      const link = webPages.length > 0 ? String(webPages[0]).trim() : null;

      const exists = await hasCollegeInCountry(connection, safeName, countryRaw);
      if (exists) {
        skippedDuplicate++;
        continue;
      }

      const cityId = await getOrCreateCity(connection, cityName, state, countryRaw);
      await insertCollege(connection, safeName, rank, cityId, link || null);
      inserted++;
      rank++;

      if (inserted % 500 === 0) {
        await connection.commit();
      }
    }

    await connection.commit();
    console.log(
      JSON.stringify(
        {
          source: SOURCE_URL,
          fetched: raw.length,
          inserted,
          skippedIndia,
          skippedDuplicate,
          skippedLongName
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

