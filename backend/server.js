const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
  console.error("MONGO_URL is missing. Add it in Render Environment Variables.");
}

const client = new MongoClient(MONGO_URL);
let db;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("uniscope");
    console.log("MongoDB connected");
  }
  return db;
}

const frontendPath = path.join(__dirname, "..", "frontend");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

app.get("/", (req, res) => {
  res.send("UniScope backend is running");
});

app.get("/test", async (req, res) => {
  try {
    await connectDB();
    res.json({ success: true, message: "MongoDB connected" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/colleges", async (req, res) => {
  try {
    const database = await connectDB();
    const colleges = await database
      .collection("colleges")
      .find({
        $or: [
          { COUNTRY: { $regex: /^india$/i } },
          { country: { $regex: /^india$/i } },
          { COUNTRY: { $exists: false } }
        ]
      })
      .sort({ RANKING_ID: 1, COLLEGE_NAME: 1 })
      .toArray();

    res.json(colleges);
  } catch (err) {
    res.status(500).json({ error: "Failed to load colleges" });
  }
});

app.get("/abroad", async (req, res) => {
  try {
    const database = await connectDB();
    const colleges = await database
      .collection("colleges")
      .find({
        $and: [
          { COUNTRY: { $exists: true } },
          { COUNTRY: { $not: /^india$/i } }
        ]
      })
      .sort({ RANKING_ID: 1, COLLEGE_NAME: 1 })
      .toArray();

    res.json(colleges);
  } catch (err) {
    res.status(500).json({ error: "Failed to load abroad colleges" });
  }
});

app.get("/compare", async (req, res) => {
  try {
    const database = await connectDB();
    const id = Number(req.query.id);

    const college = await database.collection("colleges").findOne({
      COLLEGE_ID: id
    });

    if (!college) return res.json(null);

    res.json({
      COLLEGE_NAME: college.COLLEGE_NAME,
      RANKING_ID: college.RANKING_ID || 0,
      CITY_NAME: college.CITY_NAME || "",
      CUTOFF: college.CUTOFF || college.CUTOFF_MARK || 0,
      FEE: college.FEE || 0,
      AVG_SALARY: college.AVG_SALARY || 0
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to compare college" });
  }
});

app.get("/cutoff-trend", async (req, res) => {
  try {
    const database = await connectDB();
    const collegeId = Number(req.query.collegeId);

    const college = await database.collection("colleges").findOne({
      COLLEGE_ID: collegeId
    });

    if (!college) return res.json([]);

    if (Array.isArray(college.CUTOFF_TREND)) {
      return res.json(college.CUTOFF_TREND);
    }

    res.json([
      { YEAR: 2022, CUTOFF_MARK: college.CUTOFF_2022 || 0 },
      { YEAR: 2023, CUTOFF_MARK: college.CUTOFF_2023 || 0 },
      { YEAR: 2024, CUTOFF_MARK: college.CUTOFF_2024 || college.CUTOFF || 0 }
    ]);
  } catch (err) {
    res.status(500).json({ error: "Failed to load cutoff trend" });
  }
});

app.get("/financial-colleges", async (req, res) => {
  try {
    const database = await connectDB();
    const budget = Number(req.query.budget || 0);

    const colleges = await database
      .collection("colleges")
      .find({
        COUNTRY: { $regex: /^india$/i },
        FEE: { $lte: budget }
      })
      .sort({ FEE: 1, RANKING_ID: 1 })
      .toArray();

    res.json(colleges);
  } catch (err) {
    res.status(500).json({ error: "Failed to load financial colleges" });
  }
});

app.get("/recommendations", async (req, res) => {
  try {
    const database = await connectDB();

    const cutoff = Number(req.query.cutoff || 0);
    const budget = Number(req.query.budget || 0);
    const location = String(req.query.location || "").trim();

    const filter = {
      COUNTRY: { $regex: /^india$/i }
    };

    if (cutoff) filter.CUTOFF = { $lte: cutoff };
    if (budget) filter.FEE = { $lte: budget };
    if (location) filter.CITY_NAME = { $regex: location, $options: "i" };

    const colleges = await database
      .collection("colleges")
      .find(filter)
      .sort({ RANKING_ID: 1, COLLEGE_NAME: 1 })
      .toArray();

    res.json(colleges);
  } catch (err) {
    res.status(500).json({ error: "Failed to load recommendations" });
  }
});

app.get("/student-profile", async (req, res) => {
  try {
    const database = await connectDB();
    const email = String(req.query.email || "").trim();

    const profile = await database.collection("student_profiles").findOne({
      email
    });

    res.json(profile || null);
  } catch (err) {
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.post("/student-profile", async (req, res) => {
  try {
    const database = await connectDB();
    const { name, email, phone, city, course, budget, score } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    await database.collection("student_profiles").updateOne(
      { email },
      {
        $set: {
          name: name || "",
          email,
          phone: phone || "",
          city: city || "",
          course: course || "",
          budget: Number(budget || 0),
          score: Number(score || 0),
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    res.json({ message: "Profile saved" });
  } catch (err) {
    res.status(500).json({ error: "Failed to save profile" });
  }
});

app.get("/saved", async (req, res) => {
  try {
    const database = await connectDB();
    const email = String(req.query.email || "").trim();

    const saved = await database
      .collection("saved_colleges")
      .find({ email })
      .sort({ created_at: -1 })
      .toArray();

    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: "Failed to load saved colleges" });
  }
});

app.post("/saved", async (req, res) => {
  try {
    const database = await connectDB();
    const { email, college_name, type } = req.body;

    if (!email || !college_name) {
      return res.status(400).json({ error: "email and college_name are required" });
    }

    const existing = await database.collection("saved_colleges").findOne({
      email,
      college_name
    });

    if (existing) {
      return res.json({ message: "Already saved" });
    }

    await database.collection("saved_colleges").insertOne({
      email,
      college_name,
      type: type || "india",
      created_at: new Date()
    });

    res.json({ message: "Saved successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to save college" });
  }
});

app.delete("/saved", async (req, res) => {
  try {
    const database = await connectDB();
    const { email, college_name } = req.body;

    await database.collection("saved_colleges").deleteOne({
      email,
      college_name
    });

    res.json({ message: "Removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove saved college" });
  }
});

app.get("/stats/colleges", async (req, res) => {
  try {
    const database = await connectDB();

    const totalColleges = await database.collection("colleges").countDocuments();

    const indiaCollegesByCurrentRule = await database.collection("colleges").countDocuments({
      COUNTRY: { $regex: /^india$/i }
    });

    const byCountry = await database
      .collection("colleges")
      .aggregate([
        {
          $group: {
            _id: { $toUpper: "$COUNTRY" },
            CNT: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            COUNTRY: "$_id",
            CNT: 1
          }
        },
        { $sort: { CNT: -1 } }
      ])
      .toArray();

    res.json({
      totalColleges,
      indiaCollegesByCurrentRule,
      byCountry
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load stats" });
  }
});

app.get("/admin/overview", async (req, res) => {
  try {
    const database = await connectDB();

    const totalColleges = await database.collection("colleges").countDocuments();
    const indiaColleges = await database.collection("colleges").countDocuments({
      COUNTRY: { $regex: /^india$/i }
    });
    const abroadColleges = await database.collection("colleges").countDocuments({
      COUNTRY: { $not: /^india$/i }
    });
    const savedEntries = await database.collection("saved_colleges").countDocuments();

    res.json({
      totalColleges,
      indiaColleges,
      abroadColleges,
      savedEntries
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load overview" });
  }
});

app.get("/admin/colleges", async (req, res) => {
  try {
    const database = await connectDB();

    const query = String(req.query.query || "").trim();
    const country = String(req.query.country || "").trim().toUpperCase();
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 25), 1), 200);
    const skip = (page - 1) * pageSize;

    const filter = {};

    if (query) {
      filter.COLLEGE_NAME = { $regex: query, $options: "i" };
    }

    if (country === "INDIA") {
      filter.COUNTRY = { $regex: /^india$/i };
    } else if (country === "ABROAD") {
      filter.COUNTRY = { $not: /^india$/i };
    } else if (country) {
      filter.COUNTRY = { $regex: `^${country}$`, $options: "i" };
    }

    const total = await database.collection("colleges").countDocuments(filter);

    const rows = await database
      .collection("colleges")
      .find(filter)
      .sort({ RANKING_ID: 1, COLLEGE_NAME: 1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();

    res.json({
      rows,
      total,
      page,
      pageSize
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load admin colleges" });
  }
});

app.post("/admin/college", async (req, res) => {
  try {
    const database = await connectDB();

    const {
      college_name,
      ranking_id,
      college_link,
      city_name,
      state,
      country,
      fee,
      cutoff,
      avg_salary
    } = req.body || {};

    if (!college_name || !city_name || !country) {
      return res.status(400).json({
        error: "college_name, city_name and country are required"
      });
    }

    const lastCollege = await database
      .collection("colleges")
      .find({})
      .sort({ COLLEGE_ID: -1 })
      .limit(1)
      .toArray();

    const collegeId = lastCollege.length > 0 ? Number(lastCollege[0].COLLEGE_ID || 0) + 1 : 1;

    const college = {
      COLLEGE_ID: collegeId,
      COLLEGE_NAME: college_name,
      RANKING_ID: ranking_id ? Number(ranking_id) : null,
      COLLEGE_LINK: college_link || "",
      CITY_NAME: city_name,
      STATE: state || "",
      COUNTRY: country,
      FEE: Number(fee || 0),
      CUTOFF: Number(cutoff || 0),
      AVG_SALARY: Number(avg_salary || 0),
      created_at: new Date()
    };

    await database.collection("colleges").insertOne(college);

    await database.collection("admin_audit").insertOne({
      ADMIN_EMAIL: req.headers["x-admin-email"] || req.body?.admin_email || "admin@uniscope.com",
      ACTION: "CREATE",
      ENTITY: "COLLEGE",
      ENTITY_ID: collegeId,
      DETAILS: `Created ${college_name}`,
      CREATED_AT: new Date()
    });

    res.status(201).json({
      message: "College created",
      college_id: collegeId
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create college" });
  }
});

app.put("/admin/college/:id", async (req, res) => {
  try {
    const database = await connectDB();
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ error: "Invalid college id" });
    }

    const {
      ranking_id,
      college_link,
      college_name,
      city_name,
      state,
      country,
      fee,
      cutoff,
      avg_salary
    } = req.body || {};

    const updateData = {
      updated_at: new Date()
    };

    if (ranking_id !== undefined) updateData.RANKING_ID = ranking_id ? Number(ranking_id) : null;
    if (college_link !== undefined) updateData.COLLEGE_LINK = college_link || "";
    if (college_name !== undefined) updateData.COLLEGE_NAME = college_name || "";
    if (city_name !== undefined) updateData.CITY_NAME = city_name || "";
    if (state !== undefined) updateData.STATE = state || "";
    if (country !== undefined) updateData.COUNTRY = country || "";
    if (fee !== undefined) updateData.FEE = Number(fee || 0);
    if (cutoff !== undefined) updateData.CUTOFF = Number(cutoff || 0);
    if (avg_salary !== undefined) updateData.AVG_SALARY = Number(avg_salary || 0);

    await database.collection("colleges").updateOne(
      { COLLEGE_ID: id },
      { $set: updateData }
    );

    await database.collection("admin_audit").insertOne({
      ADMIN_EMAIL: req.headers["x-admin-email"] || req.body?.admin_email || "admin@uniscope.com",
      ACTION: "UPDATE",
      ENTITY: "COLLEGE",
      ENTITY_ID: id,
      DETAILS: "Updated college",
      CREATED_AT: new Date()
    });

    res.json({ message: "College updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update college" });
  }
});

app.delete("/admin/college/:id", async (req, res) => {
  try {
    const database = await connectDB();
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ error: "Invalid college id" });
    }

    const college = await database.collection("colleges").findOne({
      COLLEGE_ID: id
    });

    if (!college) {
      return res.status(404).json({ error: "College not found" });
    }

    await database.collection("colleges").deleteOne({
      COLLEGE_ID: id
    });

    await database.collection("admin_audit").insertOne({
      ADMIN_EMAIL: req.headers["x-admin-email"] || req.body?.admin_email || "admin@uniscope.com",
      ACTION: "DELETE",
      ENTITY: "COLLEGE",
      ENTITY_ID: id,
      DETAILS: `Deleted ${college.COLLEGE_NAME}`,
      CREATED_AT: new Date()
    });

    res.json({ message: "College deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete college" });
  }
});

app.get("/admin/audit", async (req, res) => {
  try {
    const database = await connectDB();
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 300);

    const rows = await database
      .collection("admin_audit")
      .find({})
      .sort({ CREATED_AT: -1 })
      .limit(limit)
      .toArray();

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load audit log" });
  }
});

app.get("/admin/charts", async (req, res) => {
  try {
    const database = await connectDB();

    const countries = await database
      .collection("colleges")
      .aggregate([
        {
          $group: {
            _id: { $toUpper: "$COUNTRY" },
            CNT: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            COUNTRY: "$_id",
            CNT: 1
          }
        },
        { $sort: { CNT: -1 } },
        { $limit: 10 }
      ])
      .toArray();

    const rankCoverage = await database
      .collection("colleges")
      .aggregate([
        {
          $project: {
            BUCKET: {
              $cond: [
                { $eq: [{ $toUpper: "$COUNTRY" }, "INDIA"] },
                "INDIA",
                "ABROAD"
              ]
            },
            RANKED: {
              $cond: [{ $ifNull: ["$RANKING_ID", false] }, 1, 0]
            },
            UNRANKED: {
              $cond: [{ $ifNull: ["$RANKING_ID", false] }, 0, 1]
            }
          }
        },
        {
          $group: {
            _id: "$BUCKET",
            RANKED: { $sum: "$RANKED" },
            UNRANKED: { $sum: "$UNRANKED" }
          }
        },
        {
          $project: {
            _id: 0,
            BUCKET: "$_id",
            RANKED: 1,
            UNRANKED: 1
          }
        }
      ])
      .toArray();

    res.json({
      countries,
      rankCoverage
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load charts" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});