const oracledb = require("oracledb");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

oracledb.initOracleClient({ libDir: "C:\\oracle\\instantclient" });

const app = express();

app.use(cors());
app.use(express.json());

const frontendPath = path.join(__dirname, "..", "frontend");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

const dbConfig = {
  user: "uniscope",
  password: "uniscope123",
  connectString: "localhost:1521/xe"
};

let auditMode = "unknown";
const inMemoryAuditLog = [];
const auditFilePath = path.join(__dirname, "admin_audit_log.json");

function readAuditFile() {
  try {
    if (!fs.existsSync(auditFilePath)) return [];
    const raw = fs.readFileSync(auditFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeAuditFile(rows) {
  try {
    fs.writeFileSync(auditFilePath, JSON.stringify(rows, null, 2), "utf8");
  } catch (e) {}
}

async function closeConnection(connection) {
  if (connection) {
    try {
      await connection.close();
    } catch (e) {}
  }
}

async function ensureAdminAuditTable(connection) {
  if (auditMode === "memory") return;
  try {
    await connection.execute(
      `create table admin_audit_log (
         id number primary key,
         admin_email varchar2(200),
         action varchar2(40),
         entity varchar2(40),
         entity_id number,
         details varchar2(1000),
         created_at timestamp default current_timestamp
       )`
    );
    await connection.commit();
  } catch (err) {
    if (err && err.errorNum === 955) {
      auditMode = "db";
      return;
    }
    if (err && err.errorNum === 1031) {
      auditMode = "memory";
      return;
    }
    throw err;
  }
  auditMode = "db";
}

async function logAdminAction(connection, req, action, entity, entityId, details) {
  await ensureAdminAuditTable(connection);

  if (auditMode === "memory") {
    const entry = {
      ID: Date.now(),
      ADMIN_EMAIL: String(req.headers["x-admin-email"] || req.body?.admin_email || "admin@uniscope.com"),
      ACTION: action,
      ENTITY: entity,
      ENTITY_ID: entityId || null,
      DETAILS: details ? String(details).slice(0, 1000) : null,
      CREATED_AT: new Date().toISOString()
    };

    inMemoryAuditLog.unshift(entry);
    if (inMemoryAuditLog.length > 500) inMemoryAuditLog.pop();

    const rows = readAuditFile();
    rows.unshift(entry);
    if (rows.length > 2000) rows.length = 2000;
    writeAuditFile(rows);
    return;
  }

  const nextIdResult = await connection.execute(
    `select nvl(max(id), 0) + 1 as next_id from admin_audit_log`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const nextId = nextIdResult.rows[0].NEXT_ID;

  await connection.execute(
    `insert into admin_audit_log
     (id, admin_email, action, entity, entity_id, details)
     values (:id, :admin_email, :action, :entity, :entity_id, :details)`,
    {
      id: nextId,
      admin_email: String(req.headers["x-admin-email"] || req.body?.admin_email || "admin@uniscope.com"),
      action,
      entity,
      entity_id: entityId || null,
      details: details ? String(details).slice(0, 1000) : null
    }
  );
}

app.get("/", (req, res) => {
  const indexPath = path.join(frontendPath, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.send("Backend is running. Put your frontend files inside a folder named frontend.");
});

app.get("/test", async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `select 'Oracle connected' as msg from dual`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/stats/colleges", async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);

    const total = await connection.execute(
      `select count(*) as cnt from sys.college`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const countryBuckets = await connection.execute(
      `select upper(nvl(trim(ct.country), '(NULL)')) as country,
              count(*) as cnt
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       group by upper(nvl(trim(ct.country), '(NULL)'))
       order by cnt desc`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const indiaCount = await connection.execute(
      `select count(*) as cnt
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       where upper(nvl(trim(ct.country), 'INDIA')) = 'INDIA'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      totalColleges: total.rows[0]?.CNT ?? 0,
      indiaCollegesByCurrentRule: indiaCount.rows[0]?.CNT ?? 0,
      byCountry: countryBuckets.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/colleges", async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `select c.ranking_id,
              c.college_id,
              c.college_name,
              c.college_link,
              ct.city_name,
              ct.country
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       where upper(nvl(trim(ct.country), 'INDIA')) = 'INDIA'
       order by nvl(c.ranking_id, 999999), c.college_name, c.college_id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/abroad", async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `select c.ranking_id,
              c.college_id,
              c.college_name,
              c.college_link,
              ct.city_name,
              ct.country
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       where ct.country is not null
         and trim(ct.country) is not null
         and upper(trim(ct.country)) <> 'INDIA'
       order by nvl(c.ranking_id, 999999), c.college_name, c.college_id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/compare", async (req, res) => {
  let connection;
  try {
    const { id } = req.query;

    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `select c.college_name,
              c.ranking_id,
              ct.city_name,
              nvl(max(cf.cutoff_mark), 0) as cutoff,
              nvl(o.fee, 0) as fee,
              nvl(p.avg_salary, 0) as avg_salary
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       left join sys.cutoff cf on c.college_id = cf.college_id
       left join sys.offers o on c.college_id = o.college_id
       left join sys.placement_record p on c.college_id = p.college_id
       where c.college_id = :id
       group by c.college_name, c.ranking_id, ct.city_name, o.fee, p.avg_salary`,
      { id: Number(id) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/cutoff-trend", async (req, res) => {
  let connection;
  try {
    const { collegeId } = req.query;

    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `select year, cutoff_mark
       from sys.cutoff
       where college_id = :collegeId
       order by year`,
      { collegeId: Number(collegeId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/financial-colleges", async (req, res) => {
  let connection;
  try {
    const { budget } = req.query;

    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `select c.college_name,
              c.ranking_id,
              ct.city_name,
              nvl(o.fee, 0) as fee,
              nvl(p.avg_salary, 0) as avg_salary
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       left join sys.offers o on c.college_id = o.college_id
       left join sys.placement_record p on c.college_id = p.college_id
       where nvl(o.fee, 0) <= :budget
         and upper(nvl(ct.country, 'INDIA')) = 'INDIA'
       order by o.fee, c.ranking_id`,
      { budget: Number(budget) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/recommendations", async (req, res) => {
  let connection;
  try {
    const { cutoff, budget, location } = req.query;

    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `select
          c.college_id,
          c.college_name,
          c.ranking_id,
          ct.city_name,
          max(cf.cutoff_mark) as cutoff_mark,
          max(o.fee) as fee
       from sys.college c
       join sys.city ct
         on c.city_id = ct.city_id
       join sys.cutoff cf
         on c.college_id = cf.college_id
       join sys.offers o
         on c.college_id = o.college_id
       where upper(nvl(ct.country, 'INDIA')) = 'INDIA'
         and (:location is null or upper(ct.city_name) like upper(:location))
       group by
         c.college_id,
         c.college_name,
         c.ranking_id,
         ct.city_name
       having max(cf.cutoff_mark) <= :cutoff
          and max(o.fee) <= :budget
       order by
         case when c.ranking_id is null then 999999 else c.ranking_id end,
         c.college_name`,
      {
        cutoff: Number(cutoff),
        budget: Number(budget),
        location: location ? `%${location}%` : null
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/student-profile", async (req, res) => {
  let connection;
  try {
    const { email } = req.query;

    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `select sp.student_id,
              sp.first_name,
              sp.last_name,
              sp.pref_city,
              sp.score,
              sp.preferred_course,
              sp.budget,
              se.email,
              sn.phone_no
       from sys.student_profile sp
       left join sys.student_email se on sp.student_id = se.student_id
       left join sys.student_phone_no sn on sp.student_id = sn.student_id
       where se.email = :email`,
      { email },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.post("/student-profile", async (req, res) => {
  let connection;
  try {
    const { name, email, phone, city, course, budget, score } = req.body;

    connection = await oracledb.getConnection(dbConfig);

    const existingStudent = await connection.execute(
      `select sp.student_id
       from sys.student_profile sp
       left join sys.student_email se on sp.student_id = se.student_id
       where se.email = :email`,
      { email },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    let studentId;

    if (existingStudent.rows.length > 0) {
      studentId = existingStudent.rows[0].STUDENT_ID;

      await connection.execute(
        `update sys.student_profile
         set first_name = :first_name,
             last_name = :last_name,
             pref_city = :city,
             preferred_course = :course,
             budget = :budget,
             score = :score
         where student_id = :id`,
        {
          id: studentId,
          first_name: name || "",
          last_name: "",
          city: city || "",
          course: course || "",
          budget: Number(budget || 0),
          score: Number(score || 0)
        }
      );

      await connection.execute(
        `update sys.student_phone_no
         set phone_no = :phone
         where student_id = :id`,
        { id: studentId, phone: phone || "" }
      );

      await connection.execute(
        `update sys.student_email
         set email = :email
         where student_id = :id`,
        { id: studentId, email: email || "" }
      );
    } else {
      const idResult = await connection.execute(`select student_seq.nextval from dual`);
      studentId = idResult.rows[0][0];

      await connection.execute(
        `insert into sys.student_profile
         (student_id, first_name, last_name, pref_city, preferred_course, budget, score)
         values (:id, :first_name, :last_name, :city, :course, :budget, :score)`,
        {
          id: studentId,
          first_name: name || "",
          last_name: "",
          city: city || "",
          course: course || "",
          budget: Number(budget || 0),
          score: Number(score || 0)
        }
      );

      await connection.execute(
        `insert into sys.student_email (student_id, email)
         values (:id, :email)`,
        { id: studentId, email: email || "" }
      );

      await connection.execute(
        `insert into sys.student_phone_no (student_id, phone_no)
         values (:id, :phone)`,
        { id: studentId, phone: phone || "" }
      );
    }

    await connection.commit();

    res.json({ message: "Profile saved" });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (e) {}
    }
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/saved", async (req, res) => {
  let connection;
  try {
    const { email } = req.query;

    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `select college_name, type
       from sys.saved_colleges
       where email = :email
       order by id desc`,
      { email },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.post("/saved", async (req, res) => {
  let connection;
  try {
    const { email, college_name, type } = req.body;

    if (!email || !college_name) {
      return res.status(400).json({ error: "email and college_name are required" });
    }

    connection = await oracledb.getConnection(dbConfig);

    const existing = await connection.execute(
      `select id
       from sys.saved_colleges
       where email = :email
         and college_name = :college_name`,
      { email, college_name },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (existing.rows.length > 0) {
      return res.json({ message: "Already saved" });
    }

    await connection.execute(
      `insert into sys.saved_colleges (id, email, college_name, type)
       values (sys.saved_colleges_seq.nextval, :email, :college_name, :type)`,
      { email, college_name, type: type || "india" },
      { autoCommit: true }
    );

    res.json({ message: "Saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.delete("/saved", async (req, res) => {
  let connection;
  try {
    const { email, college_name } = req.body;

    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(
      `delete from sys.saved_colleges
       where email = :email
         and college_name = :college_name`,
      { email, college_name },
      { autoCommit: true }
    );

    res.json({ message: "Removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/admin/overview", async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);

    const totalColleges = await connection.execute(
      `select count(*) as cnt from sys.college`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const indiaColleges = await connection.execute(
      `select count(*) as cnt
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       where upper(nvl(trim(ct.country), 'INDIA')) = 'INDIA'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const abroadColleges = await connection.execute(
      `select count(*) as cnt
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       where ct.country is not null
         and trim(ct.country) is not null
         and upper(trim(ct.country)) <> 'INDIA'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const totalSaved = await connection.execute(
      `select count(*) as cnt from sys.saved_colleges`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      totalColleges: totalColleges.rows[0]?.CNT ?? 0,
      indiaColleges: indiaColleges.rows[0]?.CNT ?? 0,
      abroadColleges: abroadColleges.rows[0]?.CNT ?? 0,
      savedEntries: totalSaved.rows[0]?.CNT ?? 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/admin/colleges", async (req, res) => {
  let connection;
  try {
    const query = String(req.query.query || "").trim();
    const country = String(req.query.country || "").trim().toUpperCase();
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 25), 1), 200);
    const offset = (page - 1) * pageSize;
    const maxRow = offset + pageSize;

    connection = await oracledb.getConnection(dbConfig);

    let whereSql = " where 1=1 ";
    const binds = {};

    if (query) {
      whereSql += " and upper(c.college_name) like upper(:query) ";
      binds.query = `%${query}%`;
    }

    if (country === "INDIA") {
      whereSql += " and upper(nvl(trim(ct.country), 'INDIA')) = 'INDIA' ";
    } else if (country === "ABROAD") {
      whereSql += " and upper(nvl(trim(ct.country), '')) <> 'INDIA' and trim(nvl(ct.country, '')) <> '' ";
    } else if (country) {
      whereSql += " and upper(nvl(trim(ct.country), '')) = :country ";
      binds.country = country;
    }

    const countResult = await connection.execute(
      `select count(*) as cnt
       from sys.college c
       left join sys.city ct on c.city_id = ct.city_id
       ${whereSql}`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const result = await connection.execute(
      `select * from (
         select base_data.*,
                row_number() over (order by nvl(base_data.ranking_id, 999999), base_data.college_name) as rn
         from (
           select c.college_id,
                  c.college_name,
                  c.ranking_id,
                  c.college_link,
                  ct.city_name,
                  ct.state,
                  ct.country
           from sys.college c
           left join sys.city ct on c.city_id = ct.city_id
           ${whereSql}
         ) base_data
       )
       where rn > :offset
         and rn <= :maxRow`,
      {
        ...binds,
        offset,
        maxRow
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      rows: result.rows,
      total: countResult.rows[0].CNT,
      page,
      pageSize
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.post("/admin/college", async (req, res) => {
  let connection;
  try {
    const { college_name, ranking_id, college_link, city_name, state, country } = req.body || {};

    if (!college_name || !city_name || !country) {
      return res.status(400).json({ error: "college_name, city_name and country are required" });
    }

    connection = await oracledb.getConnection(dbConfig);

    const cityResult = await connection.execute(
      `select city_id
       from sys.city
       where upper(city_name) = upper(:city_name)
         and upper(nvl(country, '')) = upper(:country)`,
      { city_name, country },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    let cityId;

    if (cityResult.rows.length > 0) {
      cityId = cityResult.rows[0].CITY_ID;
    } else {
      const nextCityId = await connection.execute(
        `select nvl(max(city_id), 0) + 1 as next_id from sys.city`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      cityId = nextCityId.rows[0].NEXT_ID;

      await connection.execute(
        `insert into sys.city (city_id, city_name, state, country)
         values (:city_id, :city_name, :state, :country)`,
        {
          city_id: cityId,
          city_name,
          state: state || "",
          country
        }
      );
    }

    const nextCollegeId = await connection.execute(
      `select nvl(max(college_id), 0) + 1 as next_id from sys.college`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const collegeId = nextCollegeId.rows[0].NEXT_ID;

    await connection.execute(
      `insert into sys.college (college_id, college_name, ranking_id, city_id, college_link)
       values (:college_id, :college_name, :ranking_id, :city_id, :college_link)`,
      {
        college_id: collegeId,
        college_name,
        ranking_id: ranking_id ? Number(ranking_id) : null,
        city_id: cityId,
        college_link: college_link || null
      }
    );

    await logAdminAction(connection, req, "CREATE", "COLLEGE", collegeId, `Created ${college_name}`);
    await connection.commit();

    res.status(201).json({ message: "College created", college_id: collegeId });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (e) {}
    }
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.put("/admin/college/:id", async (req, res) => {
  let connection;
  try {
    const id = Number(req.params.id);
    const { ranking_id, college_link } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: "Invalid college id" });
    }

    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(
      `update sys.college
       set ranking_id = :ranking_id,
           college_link = :college_link
       where college_id = :id`,
      {
        ranking_id: ranking_id ? Number(ranking_id) : null,
        college_link: college_link || null,
        id
      }
    );

    await logAdminAction(connection, req, "UPDATE", "COLLEGE", id, "Updated rank/link");
    await connection.commit();

    res.json({ message: "College updated" });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (e) {}
    }
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.delete("/admin/college/:id", async (req, res) => {
  let connection;
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ error: "Invalid college id" });
    }

    connection = await oracledb.getConnection(dbConfig);

    const before = await connection.execute(
      `select college_name from sys.college where college_id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (before.rows.length === 0) {
      return res.status(404).json({ error: "College not found" });
    }

    await connection.execute(
      `delete from sys.college where college_id = :id`,
      { id }
    );

    await logAdminAction(connection, req, "DELETE", "COLLEGE", id, `Deleted ${before.rows[0].COLLEGE_NAME}`);
    await connection.commit();

    res.json({ message: "College deleted" });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (e) {}
    }
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/admin/audit", async (req, res) => {
  let connection;
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 300);
    connection = await oracledb.getConnection(dbConfig);

    await ensureAdminAuditTable(connection);

    if (auditMode === "memory") {
      const fileRows = readAuditFile();
      const memoryRows = inMemoryAuditLog.slice(0, limit);
      const merged = [...memoryRows, ...fileRows].sort((a, b) => {
        return new Date(b.CREATED_AT).getTime() - new Date(a.CREATED_AT).getTime();
      });

      const unique = [];
      const seen = new Set();

      for (const row of merged) {
        const key = `${row.CREATED_AT}|${row.ACTION}|${row.ENTITY}|${row.ENTITY_ID}|${row.DETAILS}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(row);
        if (unique.length >= limit) break;
      }

      return res.json(unique);
    }

    const result = await connection.execute(
      `select *
       from (
         select id, admin_email, action, entity, entity_id, details, created_at
         from admin_audit_log
         order by created_at desc
       )
       where rownum <= :limit`,
      { limit },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.get("/admin/charts", async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);

    const countries = await connection.execute(
      `select country, cnt
       from (
         select upper(nvl(trim(ct.country), '(NULL)')) as country, count(*) as cnt
         from sys.college c
         left join sys.city ct on c.city_id = ct.city_id
         group by upper(nvl(trim(ct.country), '(NULL)'))
         order by cnt desc
       )
       where rownum <= 10`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const rankCoverage = await connection.execute(
      `select bucket,
              sum(case when ranking_id is not null then 1 else 0 end) as ranked,
              sum(case when ranking_id is null then 1 else 0 end) as unranked
       from (
         select c.ranking_id,
                case when upper(nvl(trim(ct.country), 'INDIA')) = 'INDIA' then 'INDIA' else 'ABROAD' end as bucket
         from sys.college c
         left join sys.city ct on c.city_id = ct.city_id
       )
       group by bucket
       order by bucket`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      countries: countries.rows,
      rankCoverage: rankCoverage.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await closeConnection(connection);
  }
});

app.use((req, res) => {
  const cleanPath = req.path.replace(/^\/+/, "");

  const filePath = path.join(frontendPath, cleanPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }

  const htmlPath = path.join(frontendPath, `${cleanPath}.html`);
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }

  const indexPath = path.join(frontendPath, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  res.status(404).send("Page not found");
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});