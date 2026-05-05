const axios = require("axios");
const oracledb = require("oracledb");

oracledb.initOracleClient({ libDir: "C:\\oracle\\instantclient" });

const dbConfig = {
  user: "uniscope",
  password: "uniscope123",
  connectString: "localhost:1521/xe"
};

const COLLEGE_SCORECARD_API_KEY = "SgI1rnbAbZLk0biFnsHAxkAhEYgANvcjR9Iy2Roz";

async function closeConnection(connection) {
  if (connection) {
    try {
      await connection.close();
    } catch (e) {}
  }
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

  const seqResult = await connection.execute(`select city_seq.nextval from dual`);
  const cityId = seqResult.rows[0][0];

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

async function upsertCollege(connection, collegeName, rankingId, cityId, collegeLink) {
  const existing = await connection.execute(
    `select college_id
     from sys.college
     where upper(college_name) = upper(:college_name)`,
    { college_name: collegeName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (existing.rows.length > 0) {
    await connection.execute(
      `update sys.college
       set ranking_id = :ranking_id,
           city_id = :city_id,
           college_link = :college_link
       where college_id = :college_id`,
      {
        ranking_id: rankingId,
        city_id: cityId,
        college_link: collegeLink,
        college_id: existing.rows[0].COLLEGE_ID
      }
    );
    return;
  }

  const seqResult = await connection.execute(`select college_seq.nextval from dual`);
  const collegeId = seqResult.rows[0][0];

  await connection.execute(
    `insert into sys.college (college_id, college_name, ranking_id, city_id, college_link)
     values (:college_id, :college_name, :ranking_id, :city_id, :college_link)`,
    {
      college_id: collegeId,
      college_name: collegeName,
      ranking_id: rankingId,
      city_id: cityId,
      college_link: collegeLink
    }
  );
}

async function syncUSUniversities() {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    const response = await axios.get(
      "https://api.data.gov/ed/collegescorecard/v1/schools",
      {
        params: {
          api_key: COLLEGE_SCORECARD_API_KEY,
          per_page: 30,
          fields: [
            "school.name",
            "school.city",
            "school.state",
            "school.school_url"
          ].join(","),
          "_sort": "school.name:asc"
        }
      }
    );

    const rows = response.data.results || [];
    let rank = 1;

    for (const row of rows) {
      const name = row["school.name"];
      const city = row["school.city"] || "Unknown";
      const state = row["school.state"] || "";
      const websiteRaw = row["school.school_url"] || "";
      const website = websiteRaw
        ? (websiteRaw.startsWith("http") ? websiteRaw : `https://${websiteRaw}`)
        : "";

      if (!name) continue;

      const cityId = await getOrCreateCity(connection, city, state, "USA");
      await upsertCollege(connection, name, rank, cityId, website);

      rank++;
    }

    await connection.commit();
    console.log("US universities synced successfully");
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (e) {}
    }
    console.error("Sync failed:", err.message);
  } finally {
    await closeConnection(connection);
  }
}

syncUSUniversities();