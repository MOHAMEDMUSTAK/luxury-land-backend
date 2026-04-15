const express = require("express");
const router = express.Router();
const Land = require("../models/Land");

// ADD LAND
router.post("/add", async (req, res) => {
  const land = new Land(req.body);
  await land.save();
  res.json(land);
});

// GET ALL LANDS
router.get("/", async (req, res) => {
  const lands = await Land.find().sort({ _id: -1 });
  res.json(lands);
});

module.exports = router;